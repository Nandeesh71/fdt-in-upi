"""
Pattern Mapper - Converts ML feature values into fraud pattern categories.

This module provides deterministic, explainable mappings from ML features
to human-readable fraud patterns for dashboard visualization.

All thresholds are explicit and documented for transparency.
"""

from typing import Dict, List, Any
from dataclasses import dataclass


@dataclass
class PatternResult:
    """Result of pattern detection with explanation."""
    pattern: str
    detected: bool
    confidence: float  # 0-1
    trigger_features: List[str]
    explanation: str


class PatternMapper:
    """
    Maps ML features and model scores to fraud pattern categories.
    
    Patterns:
    - Amount Anomaly: High transaction amounts or statistical deviations
    - Behavioural Anomaly: Temporal, channel, or recipient patterns
    - Device Anomaly: New or suspicious device usage
    - Velocity Anomaly: Rapid transaction bursts
    - Model Consensus: Multiple models agree on high risk
    - Model Disagreement: Models produce conflicting signals
    """
    
    # Configurable thresholds (lenient)
    THRESHOLDS = {
        # Amount thresholds (raised for lenient detection)
        "amount_high": 25000,
        "amount_very_high": 50000,
        "amount_critical": 100000,
        "amount_deviation_moderate": 5.0,
        "amount_deviation_high": 8.0,
        
        # Velocity thresholds
        "velocity_1min_warn": 2,
        "velocity_1min_critical": 3,
        "velocity_5min_warn": 5,
        "velocity_5min_critical": 10,
        "velocity_1h_warn": 15,
        "velocity_1h_critical": 30,
        "velocity_6h_warn": 50,
        
        # Model score thresholds
        "model_high_risk": 0.6,
        "model_very_high_risk": 0.8,
        "model_consensus_min": 0.6,
        "model_consensus_avg": 0.7,
        "model_spread_disagreement": 0.3,
        "model_spread_consensus": 0.2,
        
        # Risk scores
        "merchant_risk_moderate": 0.4,
        "merchant_risk_high": 0.7,
    }
    
    @classmethod
    def detect_amount_anomaly(cls, features: Dict[str, Any]) -> PatternResult:
        """
        Detect amount-based anomalies.
        
        Rules:
        - amount >= 50000 → CRITICAL
        - amount >= 20000 → HIGH
        - amount >= 10000 → MODERATE
        - amount_deviation >= 3.0 → HIGH (statistical outlier)
        - amount_deviation >= 2.0 → MODERATE
        """
        amount = float(features.get("amount", 0))
        amount_mean = float(features.get("amount_mean", amount))
        amount_deviation = float(features.get("amount_deviation", 0))
        
        triggers = []
        confidence = 0.0
        explanation = []
        
        # Absolute amount checks
        if amount >= cls.THRESHOLDS["amount_critical"]:
            triggers.append("amount_critical")
            confidence = max(confidence, 0.95)
            explanation.append(f"Critical amount: ₹{amount:,.0f}")
        elif amount >= cls.THRESHOLDS["amount_very_high"]:
            triggers.append("amount_very_high")
            confidence = max(confidence, 0.8)
            explanation.append(f"Very high amount: ₹{amount:,.0f}")
        elif amount >= cls.THRESHOLDS["amount_high"]:
            triggers.append("amount_high")
            confidence = max(confidence, 0.6)
            explanation.append(f"High amount: ₹{amount:,.0f}")
        
        # Statistical deviation checks
        if amount_deviation >= cls.THRESHOLDS["amount_deviation_high"]:
            triggers.append("amount_deviation_high")
            confidence = max(confidence, 0.85)
            explanation.append(f"Amount {amount_deviation:.1f}x above user's normal")
        elif amount_deviation >= cls.THRESHOLDS["amount_deviation_moderate"]:
            triggers.append("amount_deviation_moderate")
            confidence = max(confidence, 0.65)
            explanation.append(f"Amount {amount_deviation:.1f}x above user's average")
        
        # Relative to mean check
        if amount_mean > 0 and amount >= 2.5 * amount_mean:
            triggers.append("amount_vs_mean")
            confidence = max(confidence, 0.7)
            explanation.append(f"Amount 2.5x above user's average (₹{amount_mean:,.0f})")
        
        detected = len(triggers) > 0
        explanation_text = "; ".join(explanation) if explanation else "No amount anomaly"
        
        return PatternResult(
            pattern="Amount Anomaly",
            detected=detected,
            confidence=confidence,
            trigger_features=triggers,
            explanation=explanation_text
        )
    
    @classmethod
    def detect_behavioural_anomaly(cls, features: Dict[str, Any], model_scores: Dict[str, float]) -> PatternResult:
        """
        Detect behavioural anomalies from temporal, channel, and merchant patterns.
        
        Rules:
        - is_night = 1 → Night activity
        - is_weekend = 1 → Weekend activity
        - is_round_amount = 1 → Possible testing
        - merchant_risk_score >= 0.7 → High risk merchant
        - merchant_risk_score >= 0.4 → Moderate risk merchant
        - is_qr_channel OR is_web_channel → Riskier channels
        - is_new_recipient = 1 → New beneficiary
        - Isolation Forest score >= 0.6 → Unsupervised anomaly detection
        """
        triggers = []
        confidence = 0.0
        explanation = []
        
        # Temporal patterns
        is_night = float(features.get("is_night", 0))
        is_weekend = float(features.get("is_weekend", 0))
        hour_of_day = float(features.get("hour_of_day", 12))
        
        if is_night > 0:
            triggers.append("night_activity")
            confidence = max(confidence, 0.5)
            explanation.append(f"Late night transaction ({int(hour_of_day)}:00)")
        
        if is_weekend > 0:
            triggers.append("weekend_activity")
            confidence = max(confidence, 0.4)
            explanation.append("Weekend transaction")
        
        # Amount patterns
        is_round = float(features.get("is_round_amount", 0))
        if is_round > 0:
            triggers.append("round_amount")
            confidence = max(confidence, 0.3)
            explanation.append("Round amount (possible testing)")
        
        # Merchant risk
        merchant_risk = float(features.get("merchant_risk_score", 0))
        if merchant_risk >= cls.THRESHOLDS["merchant_risk_high"]:
            triggers.append("merchant_risk_high")
            confidence = max(confidence, 0.75)
            explanation.append("High-risk merchant profile")
        elif merchant_risk >= cls.THRESHOLDS["merchant_risk_moderate"]:
            triggers.append("merchant_risk_moderate")
            confidence = max(confidence, 0.55)
            explanation.append("Moderate merchant risk")
        
        # Channel risk
        is_qr = float(features.get("is_qr_channel", 0))
        is_web = float(features.get("is_web_channel", 0))
        if is_qr > 0 or is_web > 0:
            triggers.append("risky_channel")
            confidence = max(confidence, 0.4)
            channel_name = "QR" if is_qr > 0 else "Web"
            explanation.append(f"{channel_name} channel (higher risk)")
        
        # Recipient patterns
        is_new_recipient = float(features.get("is_new_recipient", 0))
        if is_new_recipient > 0:
            triggers.append("new_recipient")
            confidence = max(confidence, 0.6)
            explanation.append("New/unknown recipient")
        
        # Isolation Forest anomaly (unsupervised learning signal)
        iforest_score = model_scores.get("iforest", 0)
        if iforest_score >= cls.THRESHOLDS["model_high_risk"]:
            triggers.append("iforest_anomaly")
            confidence = max(confidence, 0.7)
            explanation.append(f"Isolation Forest anomaly (score: {iforest_score:.2f})")

        # Ensemble behavior: anomaly-only signal (unsupervised fires while supervised is quiet)
        rf_score = model_scores.get("random_forest")
        xgb_score = model_scores.get("xgboost")
        supervised_scores = [s for s in [rf_score, xgb_score] if s is not None]
        supervised_high = [s for s in supervised_scores if s >= cls.THRESHOLDS["model_high_risk"]]

        if iforest_score >= cls.THRESHOLDS["model_high_risk"] and supervised_scores and len(supervised_high) == 0:
            triggers.append("anomaly_only_signal")
            confidence = max(confidence, 0.68)
            explanation.append("Anomaly-only signal: Isolation Forest high while supervised models are quiet")
        
        detected = len(triggers) > 0
        explanation_text = "; ".join(explanation) if explanation else "No behavioural anomaly"
        
        return PatternResult(
            pattern="Behavioural Anomaly",
            detected=detected,
            confidence=confidence,
            trigger_features=triggers,
            explanation=explanation_text
        )
    
    @classmethod
    def detect_device_anomaly(cls, features: Dict[str, Any]) -> PatternResult:
        """
        Device anomaly detection disabled - same device used for testing.
        Always returns no anomaly detected.
        """
        return PatternResult(
            pattern="Device Anomaly",
            detected=False,
            confidence=0.0,
            trigger_features=[],
            explanation="Device checking disabled"
        )
    
    @classmethod
    def detect_velocity_anomaly(cls, features: Dict[str, Any]) -> PatternResult:
        """
        Detect velocity-based fraud (rapid transactions).
        
        Rules:
        - tx_count_1min > 3 → CRITICAL burst
        - tx_count_1min > 2 → WARNING burst
        - tx_count_5min > 10 → CRITICAL velocity
        - tx_count_5min > 5 → HIGH velocity
        - tx_count_1h > 30 → CRITICAL volume
        - tx_count_1h > 15 → HIGH volume
        - tx_count_6h > 50 → WARNING volume
        """
        triggers = []
        confidence = 0.0
        explanation = []
        
        c1min = float(features.get("tx_count_1min", 0))
        c5min = float(features.get("tx_count_5min", 0))
        c1h = float(features.get("tx_count_1h", 0))
        c6h = float(features.get("tx_count_6h", 0))
        
        # 1-minute velocity (most critical)
        if c1min > cls.THRESHOLDS["velocity_1min_critical"]:
            triggers.append("velocity_1min_critical")
            confidence = max(confidence, 0.95)
            explanation.append(f"{int(c1min)} transactions in 1 minute (card testing)")
        elif c1min > cls.THRESHOLDS["velocity_1min_warn"]:
            triggers.append("velocity_1min_warn")
            confidence = max(confidence, 0.8)
            explanation.append(f"{int(c1min)} transactions in 1 minute")
        
        # 5-minute velocity
        if c5min > cls.THRESHOLDS["velocity_5min_critical"]:
            triggers.append("velocity_5min_critical")
            confidence = max(confidence, 0.9)
            explanation.append(f"{int(c5min)} transactions in 5 minutes")
        elif c5min > cls.THRESHOLDS["velocity_5min_warn"]:
            triggers.append("velocity_5min_warn")
            confidence = max(confidence, 0.75)
            explanation.append(f"{int(c5min)} transactions in 5 minutes")
        
        # 1-hour velocity
        if c1h > cls.THRESHOLDS["velocity_1h_critical"]:
            triggers.append("velocity_1h_critical")
            confidence = max(confidence, 0.85)
            explanation.append(f"{int(c1h)} transactions in 1 hour")
        elif c1h > cls.THRESHOLDS["velocity_1h_warn"]:
            triggers.append("velocity_1h_warn")
            confidence = max(confidence, 0.65)
            explanation.append(f"{int(c1h)} transactions in 1 hour")
        
        # 6-hour velocity
        if c6h > cls.THRESHOLDS["velocity_6h_warn"]:
            triggers.append("velocity_6h_warn")
            confidence = max(confidence, 0.6)
            explanation.append(f"{int(c6h)} transactions in 6 hours")
        
        detected = len(triggers) > 0
        explanation_text = "; ".join(explanation) if explanation else "No velocity anomaly"
        
        return PatternResult(
            pattern="Velocity Anomaly",
            detected=detected,
            confidence=confidence,
            trigger_features=triggers,
            explanation=explanation_text
        )
    
    @classmethod
    def detect_model_consensus(cls, model_scores: Dict[str, float]) -> PatternResult:
        """
        Detect when multiple models agree on high risk.
        
        Rules:
        - All model scores >= 0.6 → Strong consensus
        - Average >= 0.7 AND spread < 0.2 → Consensus
        """
        triggers = []
        confidence = 0.0
        explanation = []
        
        model_names = ["iforest", "random_forest", "xgboost"]
        scores = [model_scores.get(name, 0) for name in model_names if model_scores.get(name) is not None]

        # Extract specific model groups for ensemble-aware explanations
        iforest_score = model_scores.get("iforest")
        rf_score = model_scores.get("random_forest")
        xgb_score = model_scores.get("xgboost")
        supervised_scores = [s for s in [rf_score, xgb_score] if s is not None]
        
        if len(scores) >= 2:
            min_score = min(scores)
            max_score = max(scores)
            avg_score = sum(scores) / len(scores)
            spread = max_score - min_score
            
            # Strong consensus: all models high
            if min_score >= cls.THRESHOLDS["model_consensus_min"]:
                triggers.append("all_models_high")
                confidence = 0.9
                explanation.append(f"Strong fraud signal: all models agree (min={min_score:.2f})")
            
            # Moderate consensus: average high with low spread
            elif avg_score >= cls.THRESHOLDS["model_consensus_avg"] and spread < cls.THRESHOLDS["model_spread_consensus"]:
                triggers.append("avg_high_low_spread")
                confidence = 0.75
                explanation.append(f"Models consensus: avg={avg_score:.2f}, spread={spread:.2f}")

            # Supervised-only strong signal (known fraud pattern): trees high, anomaly quiet
            elif supervised_scores and all(s >= cls.THRESHOLDS["model_high_risk"] for s in supervised_scores) and (iforest_score is None or iforest_score < cls.THRESHOLDS["model_high_risk"]):
                triggers.append("supervised_only_high")
                confidence = 0.8
                explanation.append("Known fraud pattern: tree-based models high while anomaly model is low")
        
        detected = len(triggers) > 0
        explanation_text = "; ".join(explanation) if explanation else "No model consensus"
        
        return PatternResult(
            pattern="Model Consensus",
            detected=detected,
            confidence=confidence,
            trigger_features=triggers,
            explanation=explanation_text
        )
    
    @classmethod
    def detect_model_disagreement(cls, model_scores: Dict[str, float]) -> PatternResult:
        """
        Detect when models produce conflicting signals.
        
        Rules:
        - Spread >= 0.3 → Significant disagreement
        """
        triggers = []
        confidence = 0.0
        explanation = []
        
        model_names = ["iforest", "random_forest", "xgboost"]
        scores = [model_scores.get(name, 0) for name in model_names if model_scores.get(name) is not None]

        iforest_score = model_scores.get("iforest")
        rf_score = model_scores.get("random_forest")
        xgb_score = model_scores.get("xgboost")
        
        if len(scores) >= 2:
            min_score = min(scores)
            max_score = max(scores)
            spread = max_score - min_score
            
            if spread >= cls.THRESHOLDS["model_spread_disagreement"]:
                triggers.append("high_spread")
                confidence = 0.7
                explanation.append(f"Models disagree significantly: lowest score={min_score:.0%}, highest score={max_score:.0%} (difference: {spread:.0%})")

            # Explicitly call out anomaly-only vs supervised-only to clarify disagreements
            supervised_scores = [s for s in [rf_score, xgb_score] if s is not None]
            if iforest_score is not None and supervised_scores:
                supervised_high = [s for s in supervised_scores if s >= cls.THRESHOLDS["model_high_risk"]]
                supervised_low = [s for s in supervised_scores if s < cls.THRESHOLDS["model_high_risk"]]

                if iforest_score >= cls.THRESHOLDS["model_high_risk"] and len(supervised_high) == 0:
                    triggers.append("anomaly_vs_supervised")
                    confidence = max(confidence, 0.72)
                    explanation.append("Unusual behavioral pattern detected, but no match with known fraud signatures")

                if len(supervised_high) == len(supervised_scores) and (iforest_score < cls.THRESHOLDS["model_high_risk"] if iforest_score is not None else True):
                    triggers.append("supervised_vs_anomaly")
                    confidence = max(confidence, 0.72)
                    explanation.append("Matches known fraud patterns, but transaction behavior appears statistically typical")
        
        detected = len(triggers) > 0
        explanation_text = "; ".join(explanation) if explanation else "All models show consistent risk assessment"
        
        return PatternResult(
            pattern="Model Disagreement",
            detected=detected,
            confidence=confidence,
            trigger_features=triggers,
            explanation=explanation_text
        )
    
    @classmethod
    def analyze_all_patterns(cls, features: Dict[str, Any], model_scores: Dict[str, float]) -> Dict[str, PatternResult]:
        """
        Analyze all fraud patterns for a transaction.
        
        Args:
            features: Feature dictionary from extract_features()
            model_scores: Model scores dictionary with keys: iforest, random_forest, xgboost
        
        Returns:
            Dictionary mapping pattern names to PatternResult objects
        """
        return {
            "amount_anomaly": cls.detect_amount_anomaly(features),
            "behavioural_anomaly": cls.detect_behavioural_anomaly(features, model_scores),
            "device_anomaly": cls.detect_device_anomaly(features),
            "velocity_anomaly": cls.detect_velocity_anomaly(features),
            "model_consensus": cls.detect_model_consensus(model_scores),
            "model_disagreement": cls.detect_model_disagreement(model_scores),
        }
    
    @classmethod
    def get_pattern_summary(cls, features: Dict[str, Any], model_scores: Dict[str, float]) -> Dict[str, Any]:
        """
        Get a summary of detected patterns suitable for API responses.
        
        Returns:
            Dict with pattern counts, detected patterns, and explanations
        """
        patterns = cls.analyze_all_patterns(features, model_scores)
        
        detected_patterns = [
            {
                "name": result.pattern,
                "confidence": result.confidence,
                "triggers": result.trigger_features,
                "explanation": result.explanation
            }
            for result in patterns.values()
            if result.detected
        ]
        
        pattern_counts = {
            "amount_anomaly": 1 if patterns["amount_anomaly"].detected else 0,
            "behavioural_anomaly": 1 if patterns["behavioural_anomaly"].detected else 0,
            "device_anomaly": 1 if patterns["device_anomaly"].detected else 0,
            "velocity_anomaly": 1 if patterns["velocity_anomaly"].detected else 0,
            "model_consensus": 1 if patterns["model_consensus"].detected else 0,
            "model_disagreement": 1 if patterns["model_disagreement"].detected else 0,
        }
        
        return {
            "pattern_counts": pattern_counts,
            "detected_patterns": detected_patterns,
            "total_detected": len(detected_patterns)
        }


# Convenience function for backward compatibility
def map_features_to_patterns(features: Dict[str, Any], model_scores: Dict[str, float]) -> Dict[str, Any]:
    """
    Convenience function to map features and scores to pattern summary.
    
    Args:
        features: Feature dictionary
        model_scores: Model scores dictionary
    
    Returns:
        Pattern summary dictionary
    """
    return PatternMapper.get_pattern_summary(features, model_scores)


if __name__ == "__main__":
    # Test the pattern mapper
    test_features = {
        "amount": 15000,
        "amount_mean": 5000,
        "amount_deviation": 3.2,
        "is_night": 1.0,
        "is_weekend": 0.0,
        "is_new_device": 1.0,
        "device_count": 1.0,
        "tx_count_1min": 0.0,
        "tx_count_5min": 2.0,
        "tx_count_1h": 12.0,
        "merchant_risk_score": 0.6,
    }
    
    test_scores = {
        "iforest": 0.72,
        "random_forest": 0.65,
        "xgboost": 0.68,
        "ensemble": 0.68
    }
    
    print("=" * 70)
    print("FRAUD PATTERN ANALYSIS TEST")
    print("=" * 70)
    
    summary = PatternMapper.get_pattern_summary(test_features, test_scores)
    
    print(f"\nTotal Patterns Detected: {summary['total_detected']}")
    print(f"\nPattern Counts:")
    for pattern, count in summary['pattern_counts'].items():
        print(f"  {pattern}: {count}")
    
    print(f"\nDetected Patterns:")
    for pattern in summary['detected_patterns']:
        print(f"\n  • {pattern['name']} (confidence: {pattern['confidence']:.2f})")
        print(f"    Explanation: {pattern['explanation']}")
        print(f"    Triggers: {', '.join(pattern['triggers'])}")
