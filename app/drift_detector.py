"""
Drift Detection: Concept Drift Monitoring with Population Stability Index (PSI).

Monitors feature distribution changes between training data and live data.
  PSI < 0.1  → stable (no significant drift)
  0.1 - 0.25 → moderate drift (warning)
  > 0.25     → major drift (alert / trigger retraining)

Stores feature distribution baselines and computes PSI on a rolling window.
"""

from __future__ import annotations

import json
import math
import os
import time
from typing import Dict, List, Optional, Tuple

import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

_redis_client: Optional[redis.Redis] = None

# Configuration
NUM_BINS = 10
WINDOW_SIZE = 1000  # Number of recent transactions to compare against baseline
BASELINE_TTL = 86400 * 30  # 30-day retention
LIVE_DATA_TTL = 86400 * 7  # 7-day retention


def _get_redis() -> Optional[redis.Redis]:
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    try:
        _redis_client = redis.from_url(
            REDIS_URL, decode_responses=True,
            socket_connect_timeout=2, socket_timeout=2,
        )
        _redis_client.ping()
        return _redis_client
    except Exception:
        return None


# ---------------------------------------------------------------------------
# PSI Calculation
# ---------------------------------------------------------------------------

def _calculate_psi(expected: List[float], actual: List[float]) -> float:
    """
    Calculate Population Stability Index between two distributions.

    Both inputs should be lists of proportions (bin frequencies) that sum to ~1.0.
    """
    psi = 0.0
    eps = 1e-6  # avoid log(0)

    for e, a in zip(expected, actual):
        e = max(e, eps)
        a = max(a, eps)
        psi += (a - e) * math.log(a / e)

    return psi


def _histogram(values: List[float], bin_edges: List[float]) -> List[float]:
    """Compute histogram proportions for values given bin edges."""
    n_bins = len(bin_edges) - 1
    counts = [0] * n_bins

    for v in values:
        placed = False
        for i in range(n_bins):
            if v < bin_edges[i + 1]:
                counts[i] += 1
                placed = True
                break
        if not placed:
            counts[-1] += 1  # overflow goes to last bin

    total = sum(counts)
    if total == 0:
        return [1.0 / n_bins] * n_bins

    return [c / total for c in counts]


# ---------------------------------------------------------------------------
# Baseline Management
# ---------------------------------------------------------------------------

def _key_baseline(feature_name: str) -> str:
    return f"drift:baseline:{feature_name}"


def _key_live_data(feature_name: str) -> str:
    return f"drift:live:{feature_name}"


def _key_last_report() -> str:
    return "drift:last_report"


def store_baseline(feature_distributions: Dict[str, List[float]]) -> None:
    """
    Store training-time feature distributions as baseline.

    Parameters
    ----------
    feature_distributions : dict
        {feature_name: [list of values from training data]}
    """
    r = _get_redis()
    if r is None:
        return

    try:
        pipe = r.pipeline()
        for feature_name, values in feature_distributions.items():
            if not values:
                continue

            # Compute bin edges
            min_val = min(values)
            max_val = max(values)
            if min_val == max_val:
                max_val = min_val + 1.0

            bin_width = (max_val - min_val) / NUM_BINS
            bin_edges = [min_val + i * bin_width for i in range(NUM_BINS + 1)]
            bin_edges[-1] = max_val + 1e-6  # ensure last edge catches all

            # Compute baseline proportions
            proportions = _histogram(values, bin_edges)

            baseline_data = {
                "bin_edges": bin_edges,
                "proportions": proportions,
                "n_samples": len(values),
                "created_at": time.time(),
            }

            pipe.set(_key_baseline(feature_name), json.dumps(baseline_data))
            pipe.expire(_key_baseline(feature_name), BASELINE_TTL)

        pipe.execute()
        print(f"[drift_detector] Stored baselines for {len(feature_distributions)} features")
    except Exception as e:
        print(f"[drift_detector] Error storing baselines: {e}")


def record_live_features(features: Dict[str, float]) -> None:
    """
    Record a single transaction's features for drift monitoring.
    Called during each transaction scoring.
    """
    r = _get_redis()
    if r is None:
        return

    try:
        pipe = r.pipeline()
        for feature_name, value in features.items():
            key = _key_live_data(feature_name)
            pipe.lpush(key, str(float(value)))
            pipe.ltrim(key, 0, WINDOW_SIZE - 1)
            pipe.expire(key, LIVE_DATA_TTL)
        pipe.execute()
    except Exception as e:
        print(f"[drift_detector] Error recording live features: {e}")


def compute_drift_report(feature_names: Optional[List[str]] = None) -> Dict:
    """
    Compute PSI for all (or specified) features.

    Returns
    -------
    dict with:
        - per_feature: {feature_name: {"psi": float, "status": str}}
        - overall_status: "stable" | "moderate_drift" | "major_drift"
        - max_psi: float
        - drifted_features: list of feature names with PSI > 0.1
    """
    r = _get_redis()
    if r is None:
        return {"overall_status": "unavailable", "per_feature": {}}

    try:
        # Discover features with baselines
        if feature_names is None:
            # Scan for baseline keys
            keys = []
            cursor = 0
            while True:
                cursor, batch = r.scan(cursor, match="drift:baseline:*", count=100)
                keys.extend(batch)
                if cursor == 0:
                    break
            feature_names = [k.replace("drift:baseline:", "") for k in keys]

        per_feature = {}
        max_psi = 0.0
        drifted_features = []

        for fname in feature_names:
            baseline_raw = r.get(_key_baseline(fname))
            if baseline_raw is None:
                continue

            baseline = json.loads(baseline_raw)
            bin_edges = baseline["bin_edges"]
            expected_proportions = baseline["proportions"]

            # Get live data
            live_raw = r.lrange(_key_live_data(fname), 0, -1)
            if len(live_raw) < 50:
                # Not enough live data for meaningful comparison
                per_feature[fname] = {"psi": 0.0, "status": "insufficient_data", "n_live": len(live_raw)}
                continue

            live_values = [float(v) for v in live_raw]
            actual_proportions = _histogram(live_values, bin_edges)

            psi = _calculate_psi(expected_proportions, actual_proportions)

            if psi > 0.25:
                status = "major_drift"
                drifted_features.append(fname)
            elif psi > 0.1:
                status = "moderate_drift"
                drifted_features.append(fname)
            else:
                status = "stable"

            per_feature[fname] = {
                "psi": round(psi, 4),
                "status": status,
                "n_live": len(live_values),
            }

            max_psi = max(max_psi, psi)

        # Overall status
        if max_psi > 0.25:
            overall_status = "major_drift"
        elif max_psi > 0.1:
            overall_status = "moderate_drift"
        else:
            overall_status = "stable"

        report = {
            "overall_status": overall_status,
            "max_psi": round(max_psi, 4),
            "n_features_checked": len(per_feature),
            "drifted_features": drifted_features,
            "per_feature": per_feature,
            "timestamp": time.time(),
        }

        # Cache the report
        try:
            r.set(_key_last_report(), json.dumps(report))
            r.expire(_key_last_report(), 86400)
        except Exception:
            pass

        return report

    except Exception as e:
        print(f"[drift_detector] Error computing drift: {e}")
        return {"overall_status": "error", "error": str(e), "per_feature": {}}


def get_last_report() -> Optional[Dict]:
    """Get the most recent cached drift report."""
    r = _get_redis()
    if r is None:
        return None
    try:
        raw = r.get(_key_last_report())
        if raw:
            return json.loads(raw)
        return None
    except Exception:
        return None
