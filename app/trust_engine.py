"""
Trust Engine: Gradual recipient trust scoring.

Replaces the binary 70% known-recipient discount with a continuous trust score
based on:
  - Number of past successful transactions to this recipient
  - Total amount sent historically
  - Days since first transaction to this recipient
  - Any past fraud flags involving this recipient

Trust score range: 0.0 (no trust) to 1.0 (fully trusted)
Risk adjustment:  risk_score = risk_score * (1 - 0.3 * trust_score)
"""

from __future__ import annotations

import os
import math
import time
from typing import Dict, Optional, Tuple

import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

_redis_client: Optional[redis.Redis] = None


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
# Redis key helpers
# ---------------------------------------------------------------------------

def _key_tx_count(user_id: str, recipient: str) -> str:
    return f"trust:{user_id}:{recipient}:tx_count"


def _key_total_amount(user_id: str, recipient: str) -> str:
    return f"trust:{user_id}:{recipient}:total_amount"


def _key_first_ts(user_id: str, recipient: str) -> str:
    return f"trust:{user_id}:{recipient}:first_ts"


def _key_fraud_flags(user_id: str, recipient: str) -> str:
    return f"trust:{user_id}:{recipient}:fraud_flags"


TTL_SECONDS = 86400 * 90  # 90-day retention


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_trust_score(user_id: str, recipient: str) -> Tuple[float, Dict[str, float]]:
    """
    Compute a gradual trust score for the (user, recipient) pair.
    
    New recipients get a baseline trust of 0.3 so that users can send
    their average transaction amounts without being flagged.

    Returns
    -------
    (trust_score, details)
        trust_score: float in [0, 1]
        details: dict with sub-component values for explainability
    """
    r = _get_redis()
    if r is None:
        # Even without Redis, give a baseline trust for new recipients
        return 0.3, {"tx_count": 0, "total_amount": 0.0, "days_known": 0.0, "fraud_flags": 0, "baseline_trust": True}

    try:
        tx_count = int(r.get(_key_tx_count(user_id, recipient)) or 0)
        total_amount = float(r.get(_key_total_amount(user_id, recipient)) or 0.0)
        first_ts = r.get(_key_first_ts(user_id, recipient))
        fraud_flags = int(r.get(_key_fraud_flags(user_id, recipient)) or 0)
    except Exception:
        return 0.3, {"tx_count": 0, "total_amount": 0.0, "days_known": 0.0, "fraud_flags": 0, "baseline_trust": True}

    # Days since first transaction
    if first_ts is not None:
        days_known = max(0.0, (time.time() - float(first_ts)) / 86400.0)
    else:
        days_known = 0.0

    # Sub-scores (each in [0, 1])
    # Frequency component: saturates around 20 transactions
    freq_score = min(1.0, math.log1p(tx_count) / math.log1p(20))

    # Volume component: saturates around 50000 total amount
    vol_score = min(1.0, math.log1p(total_amount) / math.log1p(50000))

    # Longevity component: saturates around 90 days
    lon_score = min(1.0, days_known / 90.0)

    # Fraud penalty: each flag substantially reduces trust
    fraud_penalty = min(1.0, fraud_flags * 0.5)

    # Weighted combination
    raw_trust = (0.35 * freq_score + 0.25 * vol_score + 0.40 * lon_score)

    # Apply fraud penalty
    trust_score = max(0.0, raw_trust - fraud_penalty)

    # Baseline trust for new recipients: ensure at least 0.3 trust
    # so that normal-amount transactions to new people aren't flagged
    baseline_applied = False
    if tx_count == 0 and fraud_flags == 0:
        trust_score = max(trust_score, 0.3)
        baseline_applied = True

    # Clamp
    trust_score = min(1.0, max(0.0, trust_score))

    details = {
        "tx_count": tx_count,
        "total_amount": total_amount,
        "days_known": round(days_known, 1),
        "fraud_flags": fraud_flags,
        "freq_score": round(freq_score, 3),
        "vol_score": round(vol_score, 3),
        "lon_score": round(lon_score, 3),
        "fraud_penalty": round(fraud_penalty, 3),
        "trust_score": round(trust_score, 4),
        "baseline_trust": baseline_applied,
    }

    return trust_score, details


def apply_trust_discount(risk_score: float, trust_score: float) -> float:
    """
    Apply gradual trust-based discount to a risk score.

    Formula: risk_score * (1 - 0.3 * trust_score)
    - New recipient   (trust=0.0) → no discount
    - Moderate trust  (trust=0.5) → 15% discount
    - High trust      (trust=1.0) → 30% discount (max)
    """
    discount_factor = 1.0 - 0.3 * trust_score
    return risk_score * discount_factor


def record_transaction(user_id: str, recipient: str, amount: float,
                       is_fraud: bool = False) -> None:
    """
    Update trust data after a transaction is processed (allowed).
    Call this when a transaction is confirmed/allowed.
    """
    r = _get_redis()
    if r is None:
        return

    try:
        pipe = r.pipeline()

        # Increment transaction count
        pipe.incr(_key_tx_count(user_id, recipient))
        pipe.expire(_key_tx_count(user_id, recipient), TTL_SECONDS)

        # Add to total amount
        pipe.incrbyfloat(_key_total_amount(user_id, recipient), amount)
        pipe.expire(_key_total_amount(user_id, recipient), TTL_SECONDS)

        # Set first timestamp (only if not already set)
        first_key = _key_first_ts(user_id, recipient)
        pipe.setnx(first_key, str(time.time()))
        pipe.expire(first_key, TTL_SECONDS)

        # Record fraud flag if applicable
        if is_fraud:
            pipe.incr(_key_fraud_flags(user_id, recipient))
            pipe.expire(_key_fraud_flags(user_id, recipient), TTL_SECONDS)

        pipe.execute()
    except Exception as e:
        print(f"[trust_engine] Error recording transaction: {e}")


def record_fraud_flag(user_id: str, recipient: str) -> None:
    """
    Increment fraud flag count for a (user, recipient) pair.
    Called when a transaction to this recipient is confirmed as fraud.
    """
    r = _get_redis()
    if r is None:
        return
    try:
        key = _key_fraud_flags(user_id, recipient)
        r.incr(key)
        r.expire(key, TTL_SECONDS)
    except Exception as e:
        print(f"[trust_engine] Error recording fraud flag: {e}")
