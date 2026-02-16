"""
Fraud Reason Generator - Generates human-readable fraud reasons
based on transaction features and ML model outputs.

This is pure logic for explaining fraud risk decisions.
"""

from typing import List, Dict, Tuple
import math


class FraudReason:
    """Represents a single fraud reason with severity and feature data."""
    
    def __init__(self, reason: str, severity: str, feature_name: str = None, feature_value: float = None):
        """
        Args:
            reason: Human-readable fraud reason
            severity: "critical", "high", "medium", "low"
            feature_name: Name of the feature contributing to this reason
            feature_value: Value of the feature
        """
        self.reason = reason
        self.severity = severity
        self.feature_name = feature_name
        self.feature_value = feature_value
    
    def to_dict(self) -> dict:
        """Convert to dictionary for API response."""
        return {
            "reason": self.reason,
            "severity": self.severity,
            "feature": self.feature_name,
            "value": self.feature_value
        }
    
    def __repr__(self):
        return f"FraudReason({self.reason!r}, {self.severity})"


def generate_fraud_reasons(
    features: dict,
    scores: dict,
    thresholds: dict = None
) -> Tuple[List[FraudReason], float]:
    """
    Generate comprehensive fraud reasons based on features and ML scores.
    
    Args:
        features: Feature dictionary from feature_engine.extract_features()
        scores: Score dictionary from scoring.score_with_ensemble() with keys:
                - iforest: float (0-1)
                - random_forest: float (0-1)
                - xgboost: float (0-1)
                - ensemble: float (0-1)
        thresholds: Dict with "delay" and "block" thresholds. If not provided,
                    uses defaults.
    
    Returns:
        Tuple of (fraud_reasons_list, composite_risk_score)
    """
    
    if thresholds is None:
        thresholds = {"delay": 0.35, "block": 0.70}
    
    reasons = []
    
    # =========================================================================
    # 1. ML MODEL CONFIDENCE
    # =========================================================================
    ensemble_score = scores.get("ensemble", 0.0)
    iforest_score = scores.get("iforest", 0.0)
    rf_score = scores.get("random_forest", 0.0)
    xgb_score = scores.get("xgboost", 0.0)
    
    # Check for model consensus (all models agree this is suspicious)
    model_scores = [s for s in [iforest_score, rf_score, xgb_score] if s > 0]
    if model_scores and len(model_scores) >= 2:
        avg_model_score = sum(model_scores) / len(model_scores)
        
        if avg_model_score > 0.8:
            reasons.append(FraudReason(
                "Multiple ML models flagged as high-risk anomaly",
                "critical",
                "ml_consensus",
                avg_model_score
            ))
        elif avg_model_score > 0.6:
            reasons.append(FraudReason(
                "Anomalous behaviour detected by Isolation Forest",
                "high",
                "iforest_anomaly",
                iforest_score
            ))
        elif avg_model_score > 0.4:
            reasons.append(FraudReason(
                "Transaction exhibits unusual patterns",
                "medium",
                "anomaly_score",
                avg_model_score
            ))
    
    # =========================================================================
    # 2. TRANSACTION AMOUNT ANALYSIS
    # =========================================================================
    amount = float(features.get("amount", 0))
    amount_mean = float(features.get("amount_mean", amount))
    amount_std = float(features.get("amount_std", 0))
    amount_max = float(features.get("amount_max", amount))
    
    # High transaction amount (absolute) - lenient thresholds
    if amount > 100000:
        reasons.append(FraudReason(
            "Very high transaction amount (100000+)",
            "critical",
            "amount",
            amount
        ))
    elif amount > 50000:
        reasons.append(FraudReason(
            "High transaction amount (50000+)",
            "high",
            "amount",
            amount
        ))
    elif amount > 25000:
        reasons.append(FraudReason(
            "Transaction amount exceeds 25000",
            "medium",
            "amount",
            amount
        ))
    
    # Amount deviation from user's pattern - disabled to avoid blocking normal transactions
    # Only flag extreme deviations (>5x) as informational, not blocking
    amount_deviation = float(features.get("amount_deviation", 0))
    if amount_deviation > 5.0 and amount_std > 0:
        reasons.append(FraudReason(
            f"Amount is {amount_deviation:.1f}x above user's normal pattern",
            "low",
            "amount_deviation",
            amount_deviation
        ))
    
    # =========================================================================
    # 3. DEVICE CHECK - DISABLED (same device used for testing)
    # =========================================================================
    # Device checking removed - no device-based fraud reasons generated
    
    # =========================================================================
    # 4. NEW RECIPIENT / BENEFICIARY
    # =========================================================================
    is_new_recipient = float(features.get("is_new_recipient", 0))
    recipient_tx_count = float(features.get("recipient_tx_count", 1))
    
    if is_new_recipient > 0:
        reasons.append(FraudReason(
            "Payment to new recipient",
            "low",
            "is_new_recipient",
            is_new_recipient
        ))
    elif recipient_tx_count == 1:
        reasons.append(FraudReason(
            "First transaction to this recipient",
            "low",
            "recipient_tx_count",
            recipient_tx_count
        ))
    
    # =========================================================================
    # 5. VELOCITY FRAUD (too many transactions in short time)
    # =========================================================================
    tx_count_1min = float(features.get("tx_count_1min", 0))
    tx_count_5min = float(features.get("tx_count_5min", 0))
    tx_count_1h = float(features.get("tx_count_1h", 0))
    tx_count_6h = float(features.get("tx_count_6h", 0))
    tx_count_24h = float(features.get("tx_count_24h", 0))
    
    # Per-minute velocity
    if tx_count_1min > 3:
        reasons.append(FraudReason(
            f"{int(tx_count_1min)} transactions in last 1 minute - potential card testing",
            "critical",
            "tx_count_1min",
            tx_count_1min
        ))
    
    # Per-5-minute velocity
    if tx_count_5min > 10:
        reasons.append(FraudReason(
            f"{int(tx_count_5min)} transactions in last 5 minutes - extremely high velocity",
            "critical",
            "tx_count_5min",
            tx_count_5min
        ))
    elif tx_count_5min > 5:
        reasons.append(FraudReason(
            "Too many transactions in short time (5 minutes)",
            "high",
            "tx_count_5min",
            tx_count_5min
        ))
    
    # Hourly velocity
    if tx_count_1h > 30:
        reasons.append(FraudReason(
            f"{int(tx_count_1h)} transactions in last hour",
            "high",
            "tx_count_1h",
            tx_count_1h
        ))
    elif tx_count_1h > 15:
        reasons.append(FraudReason(
            "Unusually high transaction volume in the last hour",
            "medium",
            "tx_count_1h",
            tx_count_1h
        ))
    
    # 6-hour velocity
    if tx_count_6h > 50:
        reasons.append(FraudReason(
            f"{int(tx_count_6h)} transactions in last 6 hours",
            "medium",
            "tx_count_6h",
            tx_count_6h
        ))
    
    # =========================================================================
    # 6. TEMPORAL RISK (time-based patterns)
    # =========================================================================
    is_night = float(features.get("is_night", 0))
    is_weekend = float(features.get("is_weekend", 0))
    is_business_hours = float(features.get("is_business_hours", 0))
    hour_of_day = float(features.get("hour_of_day", 0))
    
    if is_night > 0:
        reasons.append(FraudReason(
            f"Transaction at unusual hour ({int(hour_of_day)}:00) - late night activity",
            "medium",
            "is_night",
            is_night
        ))
    
    if is_weekend > 0 and is_night > 0:
        reasons.append(FraudReason(
            "Weekend late-night transaction - atypical user behavior",
            "medium",
            "weekend_night",
            1.0
        ))
    
    # =========================================================================
    # 7. MERCHANT / RECIPIENT RISK
    # =========================================================================
    merchant_risk_score = float(features.get("merchant_risk_score", 0))
    
    if merchant_risk_score > 0.7:
        reasons.append(FraudReason(
            "Recipient profile indicates potential risk (suspicious merchant ID format)",
            "medium",
            "merchant_risk_score",
            merchant_risk_score
        ))
    elif merchant_risk_score > 0.4:
        reasons.append(FraudReason(
            "Recipient has characteristics of high-risk merchant",
            "low",
            "merchant_risk_score",
            merchant_risk_score
        ))
    
    # =========================================================================
    # 8. CHANNEL RISK
    # =========================================================================
    is_qr_channel = float(features.get("is_qr_channel", 0))
    is_web_channel = float(features.get("is_web_channel", 0))
    
    if is_qr_channel > 0:
        reasons.append(FraudReason(
            "QR code transaction - higher risk channel",
            "low",
            "is_qr_channel",
            is_qr_channel
        ))
    
    if is_web_channel > 0:
        reasons.append(FraudReason(
            "Web-based transaction - requires additional verification",
            "low",
            "is_web_channel",
            is_web_channel
        ))
    
    # =========================================================================
    # 9. P2M RISK (Peer-to-Merchant)
    # =========================================================================
    is_p2m = float(features.get("is_p2m", 0))
    
    if is_p2m > 0 and amount > 10000:
        reasons.append(FraudReason(
            "Large P2M (Peer-to-Merchant) transaction - higher fraud risk category",
            "medium",
            "is_p2m",
            is_p2m
        ))
    
    # =========================================================================
    # 10. FALLBACK: Normal transaction
    # =========================================================================
    if not reasons:
        reasons.append(FraudReason(
            "No suspicious patterns detected - normal transaction profile",
            "low",
            "normal_pattern",
            0.0
        ))
    
    # Calculate composite risk score based on reasons
    composite_score = calculate_composite_risk_score(reasons, ensemble_score)
    
    return reasons, composite_score


def calculate_composite_risk_score(reasons: List[FraudReason], ml_score: float) -> float:
    """
    Calculate composite risk score based on reasons severity.
    
    Args:
        reasons: List of FraudReason objects
        ml_score: ML ensemble score (0-1)
    
    Returns:
        Composite risk score (0-1)
    """
    if not reasons:
        return ml_score
    
    # Weight by severity (lenient - reduced weights)
    severity_weights = {
        "critical": 0.25,
        "high": 0.15,
        "medium": 0.08,
        "low": 0.03
    }
    
    # Check if normal pattern
    if len(reasons) == 1 and reasons[0].feature_name == "normal_pattern":
        return 0.0  # No fraud indicators
    
    # Count reasons by severity
    reason_score = 0.0
    max_severity_score = 0.0
    
    for reason in reasons:
        weight = severity_weights.get(reason.severity, 0)
        reason_score += weight
        max_severity_score = max(max_severity_score, weight)
    
    # Normalize: cap at 1.0
    reason_score = min(reason_score / 2.0, 1.0)  # Divide by 2 to normalize
    
    # Blend with ML score (70% reasons, 30% ML)
    composite = 0.7 * reason_score + 0.3 * ml_score
    
    return min(composite, 1.0)


def categorize_fraud_risk(
    ensemble_score: float,
    fraud_reasons: List[FraudReason],
    thresholds: dict = None
) -> Dict:
    """
    Categorize transaction risk level with action recommendation.
    
    Args:
        ensemble_score: ML ensemble score (0-1)
        fraud_reasons: List of FraudReason objects
        thresholds: Dict with "delay" and "block" thresholds
    
    Returns:
        Dict with risk_level, action, and explanation
    """
    
    if thresholds is None:
        thresholds = {"delay": 0.35, "block": 0.70}
    
    delay_threshold = thresholds.get("delay", 0.35)
    block_threshold = thresholds.get("block", 0.70)
    
    # Determine risk level
    if ensemble_score >= block_threshold:
        risk_level = "BLOCKED"
        action = "BLOCK"
        explanation = "High fraud risk detected - transaction blocked"
    elif ensemble_score >= delay_threshold:
        risk_level = "DELAYED"
        action = "DELAY"
        explanation = "Moderate fraud risk detected - transaction requires verification"
    else:
        risk_level = "APPROVED"
        action = "APPROVE"
        explanation = "Low fraud risk - transaction approved"
    
    # Determine if normal pattern
    is_normal = (
        len(fraud_reasons) == 1 and 
        fraud_reasons[0].feature_name == "normal_pattern"
    )
    
    return {
        "risk_level": risk_level,
        "action": action,
        "explanation": explanation,
        "score": ensemble_score,
        "is_normal": is_normal,
        "critical_reasons": [r for r in fraud_reasons if r.severity == "critical"],
        "high_reasons": [r for r in fraud_reasons if r.severity == "high"],
        "all_reasons": fraud_reasons
    }


def format_fraud_reasons_text(fraud_reasons: List[FraudReason]) -> str:
    """
    Format fraud reasons as human-readable text for logging/display.
    
    Args:
        fraud_reasons: List of FraudReason objects
    
    Returns:
        Multi-line human-readable string
    """
    lines = []
    
    # Group by severity
    severity_order = ["critical", "high", "medium", "low"]
    grouped = {sev: [] for sev in severity_order}
    
    for reason in fraud_reasons:
        grouped[reason.severity].append(reason)
    
    for severity in severity_order:
        reasons_at_severity = grouped[severity]
        if reasons_at_severity:
            lines.append(f"\n🔴 {severity.upper()}:")
            for reason in reasons_at_severity:
                lines.append(f"   • {reason.reason}")
                if reason.feature_value is not None:
                    lines.append(f"     [{reason.feature_name} = {reason.feature_value:.2f}]")
    
    return "\n".join(lines) if lines else "No fraud indicators detected"


# Example usage and testing
if __name__ == "__main__":
    # Test with sample features and scores
    sample_features = {
        "amount": 15000.0,
        "log_amount": 9.62,
        "is_round_amount": 0.0,
        "hour_of_day": 2.0,
        "day_of_week": 5.0,
        "is_weekend": 1.0,
        "is_night": 1.0,
        "is_business_hours": 0.0,
        "tx_count_1h": 12.0,
        "tx_count_6h": 25.0,
        "tx_count_24h": 45.0,
        "tx_count_1min": 0.0,
        "tx_count_5min": 2.0,
        "is_new_recipient": 1.0,
        "recipient_tx_count": 1.0,
        "is_new_device": 1.0,
        "device_count": 1.0,
        "is_p2m": 0.0,
        "amount_mean": 8000.0,
        "amount_std": 2000.0,
        "amount_max": 18000.0,
        "amount_deviation": 3.5,
        "merchant_risk_score": 0.3,
        "is_qr_channel": 0.0,
        "is_web_channel": 0.0
    }
    
    sample_scores = {
        "iforest": 0.72,
        "random_forest": 0.65,
        "xgboost": 0.68,
        "ensemble": 0.68
    }
    
    reasons, composite_score = generate_fraud_reasons(sample_features, sample_scores)
    
    print("=" * 70)
    print("FRAUD REASON ANALYSIS")
    print("=" * 70)
    print(f"\nComposite Risk Score: {composite_score:.2%}")
    print(f"Total Reasons: {len(reasons)}\n")
    
    print(format_fraud_reasons_text(reasons))
    
    print("\n" + "=" * 70)
    categorization = categorize_fraud_risk(sample_scores["ensemble"], reasons)
    print(f"Risk Level: {categorization['risk_level']}")
    print(f"Action: {categorization['action']}")
    print(f"Explanation: {categorization['explanation']}")
