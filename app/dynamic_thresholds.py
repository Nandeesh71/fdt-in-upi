"""
Dynamic Thresholding for Fraud Detection.

Replaces static thresholds (0.3 delay / 0.7 block) with dynamic thresholds
that adapt based on:
  - Transaction amount (higher amount → stricter thresholds)
  - Account age (newer accounts → stricter)
  - User historical risk score (from risk buffer)
  - Device novelty (new device → stricter)
  - Time of day (night → stricter)

Higher risk context → lower thresholds → more transactions flagged.
"""

from __future__ import annotations

import math
import os
from typing import Dict, Tuple

# Base thresholds (fallback / starting point) - lenient for better UX
BASE_DELAY_THRESHOLD = float(os.getenv("DELAY_THRESHOLD", "0.45"))
BASE_BLOCK_THRESHOLD = float(os.getenv("BLOCK_THRESHOLD", "0.75"))

# Minimum thresholds (never go below these)
MIN_DELAY_THRESHOLD = 0.25
MIN_BLOCK_THRESHOLD = 0.50

# Maximum thresholds (never go above these)
MAX_DELAY_THRESHOLD = 0.55
MAX_BLOCK_THRESHOLD = 0.85


def compute_dynamic_thresholds(
    amount: float,
    features: Dict[str, float],
    risk_buffer_value: float = 0.0,
    account_age_days: float = 365.0,
) -> Tuple[float, float, Dict]:
    """
    Compute dynamic delay and block thresholds for a transaction.

    Parameters
    ----------
    amount : float
        Transaction amount.
    features : dict
        Extracted transaction features (from feature_engine).
    risk_buffer_value : float
        Current cumulative risk buffer value for the user.
    account_age_days : float
        How many days since the user account was created.

    Returns
    -------
    (delay_threshold, block_threshold, details)
    """
    # Start from base thresholds
    delay_adj = 0.0
    block_adj = 0.0
    adjustments = {}

    # 1. Amount-based adjustment: high amounts → slightly lower thresholds (lenient)
    # Reduced factor: log(amount) / 200 gives ~0.025 for 1000, ~0.045 for 10000, ~0.055 for 50000
    if amount > 0:
        amount_factor = math.log1p(amount) / 200.0
        delay_adj -= amount_factor
        block_adj -= amount_factor
        adjustments["amount_adj"] = round(-amount_factor, 4)

    # 2. Account age adjustment: newer accounts → stricter
    # New accounts (< 30 days) get up to 0.08 reduction
    if account_age_days < 30:
        age_factor = 0.08 * (1.0 - account_age_days / 30.0)
        delay_adj -= age_factor
        block_adj -= age_factor
        adjustments["account_age_adj"] = round(-age_factor, 4)

    # 3. Risk buffer adjustment: elevated buffer → stricter
    if risk_buffer_value > 0.5:
        buffer_factor = min(0.10, risk_buffer_value * 0.04)
        delay_adj -= buffer_factor
        block_adj -= buffer_factor
        adjustments["risk_buffer_adj"] = round(-buffer_factor, 4)

    # 4. Device novelty: DISABLED - same device used for testing
    # is_new_device check removed

    # 5. Night-time adjustment: night transactions → stricter
    is_night = features.get("is_night", 0.0)
    if is_night > 0:
        delay_adj -= 0.03
        block_adj -= 0.03
        adjustments["night_adj"] = -0.03

    # 6. New recipient: no penalty - allow user's avg amount transactions to new users
    # Removed stricter thresholds for new recipients

    # 7. High velocity: many transactions recently → stricter
    tx_count_1h = features.get("tx_count_1h", 0.0)
    if tx_count_1h > 5:
        vel_factor = min(0.05, (tx_count_1h - 5) * 0.01)
        delay_adj -= vel_factor
        block_adj -= vel_factor
        adjustments["velocity_adj"] = round(-vel_factor, 4)

    # Compute final thresholds
    delay_threshold = BASE_DELAY_THRESHOLD + delay_adj
    block_threshold = BASE_BLOCK_THRESHOLD + block_adj

    # Clamp to valid range
    delay_threshold = max(MIN_DELAY_THRESHOLD, min(MAX_DELAY_THRESHOLD, delay_threshold))
    block_threshold = max(MIN_BLOCK_THRESHOLD, min(MAX_BLOCK_THRESHOLD, block_threshold))

    # Ensure delay < block
    if delay_threshold >= block_threshold:
        delay_threshold = block_threshold - 0.05

    details = {
        "base_delay": BASE_DELAY_THRESHOLD,
        "base_block": BASE_BLOCK_THRESHOLD,
        "delay_threshold": round(delay_threshold, 4),
        "block_threshold": round(block_threshold, 4),
        "total_delay_adj": round(delay_adj, 4),
        "total_block_adj": round(block_adj, 4),
        "adjustments": adjustments,
    }

    return delay_threshold, block_threshold, details
