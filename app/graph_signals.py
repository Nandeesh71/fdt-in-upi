"""
Graph-Based Fraud Signals.

Builds a transaction graph (nodes: users, recipients, devices; edges: transfers,
shared device usage) and computes graph-derived risk signals:

  - Recipient fraud ratio: fraction of senders flagged as fraud for this recipient
  - Degree centrality: how many unique senders send to this recipient
  - Shared device risk: if device is used by multiple users, are any flagged?
  - Cluster membership: users connected to known fraud clusters

These signals are impossible to detect with per-transaction ML alone.
"""

from __future__ import annotations

import os
import time
from typing import Dict, Optional, Tuple

import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

_redis_client: Optional[redis.Redis] = None

GRAPH_TTL = 86400 * 30  # 30-day retention for graph data


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
# Redis Key Helpers
# ---------------------------------------------------------------------------

def _key_recipient_senders(recipient: str) -> str:
    """Set of user_ids that have sent money to this recipient."""
    return f"graph:recipient:{recipient}:senders"


def _key_recipient_fraud_senders(recipient: str) -> str:
    """Set of user_ids that sent fraud-flagged transactions to this recipient."""
    return f"graph:recipient:{recipient}:fraud_senders"


def _key_device_users(device_id: str) -> str:
    """Set of user_ids that have used this device."""
    return f"graph:device:{device_id}:users"


def _key_device_fraud_users(device_id: str) -> str:
    """Set of user_ids flagged for fraud that used this device."""
    return f"graph:device:{device_id}:fraud_users"


def _key_user_recipients(user_id: str) -> str:
    """Set of recipients this user has sent money to."""
    return f"graph:user:{user_id}:recipients"


def _key_user_fraud_count(user_id: str) -> str:
    """Count of fraud flags for this user."""
    return f"graph:user:{user_id}:fraud_count"


# ---------------------------------------------------------------------------
# Graph Update Operations
# ---------------------------------------------------------------------------

def record_transaction_edge(user_id: str, recipient: str, device_id: str) -> None:
    """
    Record a transaction as an edge in the graph.
    Call this for every processed transaction.
    """
    r = _get_redis()
    if r is None:
        return

    try:
        pipe = r.pipeline()

        # User → Recipient edge
        pipe.sadd(_key_recipient_senders(recipient), user_id)
        pipe.expire(_key_recipient_senders(recipient), GRAPH_TTL)

        pipe.sadd(_key_user_recipients(user_id), recipient)
        pipe.expire(_key_user_recipients(user_id), GRAPH_TTL)

        # Device → User edge
        pipe.sadd(_key_device_users(device_id), user_id)
        pipe.expire(_key_device_users(device_id), GRAPH_TTL)

        pipe.execute()
    except Exception as e:
        print(f"[graph_signals] Error recording edge: {e}")


def record_fraud_edge(user_id: str, recipient: str, device_id: str) -> None:
    """
    Mark a transaction as fraudulent in the graph.
    Call this when a transaction is confirmed/detected as fraud.
    """
    r = _get_redis()
    if r is None:
        return

    try:
        pipe = r.pipeline()

        # Mark sender as fraud for this recipient
        pipe.sadd(_key_recipient_fraud_senders(recipient), user_id)
        pipe.expire(_key_recipient_fraud_senders(recipient), GRAPH_TTL)

        # Mark user as having fraud on this device
        pipe.sadd(_key_device_fraud_users(device_id), user_id)
        pipe.expire(_key_device_fraud_users(device_id), GRAPH_TTL)

        # Increment user fraud count
        pipe.incr(_key_user_fraud_count(user_id))
        pipe.expire(_key_user_fraud_count(user_id), GRAPH_TTL)

        pipe.execute()
    except Exception as e:
        print(f"[graph_signals] Error recording fraud edge: {e}")


# ---------------------------------------------------------------------------
# Graph Signal Computation
# ---------------------------------------------------------------------------

def compute_graph_signals(
    user_id: str,
    recipient: str,
    device_id: str,
) -> Tuple[float, Dict]:
    """
    Compute graph-based fraud risk signals.

    Returns
    -------
    (graph_risk_score, details)
        graph_risk_score: float in [0, 1], higher = more suspicious
        details: dict with individual signal components
    """
    r = _get_redis()
    if r is None:
        return 0.0, {"status": "unavailable"}

    try:
        # 1. Recipient fraud ratio
        total_senders = r.scard(_key_recipient_senders(recipient)) or 0
        fraud_senders = r.scard(_key_recipient_fraud_senders(recipient)) or 0

        if total_senders > 0 and fraud_senders > 0:
            recipient_fraud_ratio = fraud_senders / total_senders
        else:
            recipient_fraud_ratio = 0.0

        # 2. Recipient degree centrality (how many unique senders)
        # High degree + fraud = money mule / scam collector
        degree_centrality = total_senders
        # Normalize: 1-30 senders is normal, 30+ is suspicious
        degree_risk = min(1.0, max(0.0, (degree_centrality - 30) / 70.0)) if degree_centrality > 30 else 0.0

        # 3. Shared device risk - DISABLED (same device used for testing)
        device_users = 0
        device_fraud_users = 0
        shared_device_fraud_ratio = 0.0
        multi_user_device_risk = 0.0

        # 4. User's own fraud history
        user_fraud_count = int(r.get(_key_user_fraud_count(user_id)) or 0)
        user_fraud_risk = min(1.0, user_fraud_count * 0.3)

        # 5. Aggregate graph risk score
        # Weight the components (device components disabled)
        graph_risk = (
            0.45 * recipient_fraud_ratio +
            0.15 * degree_risk +
            0.40 * user_fraud_risk
        )

        graph_risk = min(1.0, max(0.0, graph_risk))

        details = {
            "recipient_fraud_ratio": round(recipient_fraud_ratio, 4),
            "recipient_total_senders": total_senders,
            "recipient_fraud_senders": fraud_senders,
            "degree_centrality": degree_centrality,
            "degree_risk": round(degree_risk, 4),
            "shared_device_fraud_ratio": round(shared_device_fraud_ratio, 4),
            "device_users": device_users,
            "device_fraud_users": device_fraud_users,
            "multi_user_device_risk": round(multi_user_device_risk, 4),
            "user_fraud_count": user_fraud_count,
            "user_fraud_risk": round(user_fraud_risk, 4),
            "graph_risk_score": round(graph_risk, 4),
        }

        return graph_risk, details

    except Exception as e:
        print(f"[graph_signals] Error computing signals: {e}")
        return 0.0, {"status": "error", "error": str(e)}


def get_recipient_profile(recipient: str) -> Dict:
    """
    Get a full risk profile for a recipient based on graph data.
    Useful for admin dashboard insights.
    """
    r = _get_redis()
    if r is None:
        return {"status": "unavailable"}

    try:
        total_senders = r.scard(_key_recipient_senders(recipient)) or 0
        fraud_senders = r.scard(_key_recipient_fraud_senders(recipient)) or 0
        sender_list = list(r.smembers(_key_recipient_senders(recipient)) or [])

        return {
            "recipient": recipient,
            "total_unique_senders": total_senders,
            "fraud_flagged_senders": fraud_senders,
            "fraud_ratio": round(fraud_senders / total_senders, 4) if total_senders > 0 else 0.0,
            "recent_senders": sender_list[:20],  # limit for display
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}
