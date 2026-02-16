"""
Cumulative Risk Memory (Slow-Burn Fraud Protection).

Maintains a per-user risk accumulator that decays over time.
Detects gradual account takeover, behavioral drift, and social engineering
progression that individual transaction scoring cannot catch.

Formula:
    user_risk_buffer = previous_buffer * decay + current_risk

If the buffer crosses a threshold, the transaction is escalated.
"""

from __future__ import annotations

import os
import time
from typing import Dict, Optional, Tuple

import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

_redis_client: Optional[redis.Redis] = None

# Configuration
DECAY_FACTOR = float(os.getenv("RISK_BUFFER_DECAY", "0.85"))
ESCALATE_THRESHOLD = float(os.getenv("RISK_BUFFER_ESCALATE", "2.5"))
BLOCK_THRESHOLD = float(os.getenv("RISK_BUFFER_BLOCK", "4.0"))
BUFFER_TTL = 86400 * 7  # 7-day retention


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


def _key_buffer(user_id: str) -> str:
    return f"risk_buffer:{user_id}:value"


def _key_last_ts(user_id: str) -> str:
    return f"risk_buffer:{user_id}:last_ts"


def _key_history(user_id: str) -> str:
    return f"risk_buffer:{user_id}:history"


def get_risk_buffer(user_id: str) -> Tuple[float, Dict]:
    """
    Get the current risk buffer value for a user.

    Returns
    -------
    (buffer_value, details)
        buffer_value: current accumulated risk
        details: dict with buffer info for explainability
    """
    r = _get_redis()
    if r is None:
        return 0.0, {"buffer": 0.0, "status": "unavailable"}

    try:
        raw_buffer = r.get(_key_buffer(user_id))
        raw_ts = r.get(_key_last_ts(user_id))

        if raw_buffer is None:
            return 0.0, {"buffer": 0.0, "status": "new_user"}

        buffer_val = float(raw_buffer)
        last_ts = float(raw_ts) if raw_ts else time.time()

        # Apply time-based decay since last update
        elapsed_hours = (time.time() - last_ts) / 3600.0
        if elapsed_hours > 0:
            # Decay per hour: decay_factor applied per transaction,
            # but also passive decay over time (slower)
            passive_decay = DECAY_FACTOR ** (elapsed_hours / 6.0)  # decay per 6 hours
            buffer_val *= passive_decay

        status = "normal"
        if buffer_val >= BLOCK_THRESHOLD:
            status = "critical"
        elif buffer_val >= ESCALATE_THRESHOLD:
            status = "elevated"

        details = {
            "buffer": round(buffer_val, 4),
            "elapsed_hours": round(elapsed_hours, 1),
            "status": status,
            "escalate_threshold": ESCALATE_THRESHOLD,
            "block_threshold": BLOCK_THRESHOLD,
        }

        return buffer_val, details

    except Exception as e:
        print(f"[risk_buffer] Error getting buffer: {e}")
        return 0.0, {"buffer": 0.0, "status": "error"}


def update_risk_buffer(user_id: str, current_risk: float) -> Tuple[float, str]:
    """
    Update the risk buffer with a new transaction's risk score.

    Formula: new_buffer = old_buffer * decay + current_risk

    Returns
    -------
    (new_buffer, action_modifier)
        new_buffer: updated buffer value
        action_modifier: "NONE" | "ESCALATE" | "BLOCK"
    """
    r = _get_redis()
    if r is None:
        return 0.0, "NONE"

    try:
        # Get current buffer (with passive decay applied)
        old_buffer, _ = get_risk_buffer(user_id)

        # Apply decay and add current risk
        new_buffer = old_buffer * DECAY_FACTOR + current_risk

        # Store updated values
        pipe = r.pipeline()
        pipe.set(_key_buffer(user_id), str(new_buffer))
        pipe.expire(_key_buffer(user_id), BUFFER_TTL)
        pipe.set(_key_last_ts(user_id), str(time.time()))
        pipe.expire(_key_last_ts(user_id), BUFFER_TTL)

        # Store recent history (last 20 risk scores)
        pipe.lpush(_key_history(user_id), f"{current_risk:.4f}:{time.time():.0f}")
        pipe.ltrim(_key_history(user_id), 0, 19)
        pipe.expire(_key_history(user_id), BUFFER_TTL)

        pipe.execute()

        # Determine action modifier
        if new_buffer >= BLOCK_THRESHOLD:
            action_modifier = "BLOCK"
        elif new_buffer >= ESCALATE_THRESHOLD:
            action_modifier = "ESCALATE"
        else:
            action_modifier = "NONE"

        return new_buffer, action_modifier

    except Exception as e:
        print(f"[risk_buffer] Error updating buffer: {e}")
        return 0.0, "NONE"


def reset_buffer(user_id: str) -> None:
    """Reset the risk buffer for a user (e.g., after manual review clears them)."""
    r = _get_redis()
    if r is None:
        return
    try:
        r.delete(_key_buffer(user_id), _key_last_ts(user_id), _key_history(user_id))
    except Exception as e:
        print(f"[risk_buffer] Error resetting buffer: {e}")


def get_buffer_history(user_id: str) -> list:
    """
    Get the recent risk score history for a user.
    Returns list of (risk_score, timestamp) tuples, newest first.
    """
    r = _get_redis()
    if r is None:
        return []
    try:
        raw_history = r.lrange(_key_history(user_id), 0, -1)
        history = []
        for entry in raw_history:
            parts = entry.split(":")
            if len(parts) == 2:
                history.append({
                    "risk_score": float(parts[0]),
                    "timestamp": float(parts[1]),
                })
        return history
    except Exception:
        return []
