"""
Enhanced Scoring Module - Ensemble ML Fraud Detection
Uses multiple trained models with proper feature extraction and ensemble voting
"""

import os
import math
from datetime import datetime, timezone
from typing import Dict, Optional, Union, Any
import numpy as np

try:
    from .explainability import explain_transaction
except (ImportError, SystemError):
    from explainability import explain_transaction

# Model loading and caching
_MODELS_LOADED = False
_IFOREST = None
_RANDOM_FOREST = None
_XGBOOST = None
_MODEL_METADATA = None

def load_models():
    """Load all trained models (cached after first load)."""
    global _MODELS_LOADED, _IFOREST, _RANDOM_FOREST, _XGBOOST, _MODEL_METADATA
    
    if _MODELS_LOADED:
        return
    
    try:
        import joblib
        import json
        
        # Load models - use absolute path based on script location
        script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        model_dir = os.path.join(script_dir, "models")
        print(f"[INFO] Looking for models in: {model_dir}")
        
        try:
            _IFOREST = joblib.load(os.path.join(model_dir, "iforest.joblib"))
            print("[OK] Loaded Isolation Forest model")
        except Exception as e:
            print(f"[WARN] Could not load Isolation Forest: {e}")
        
        try:
            _RANDOM_FOREST = joblib.load(os.path.join(model_dir, "random_forest.joblib"))
            print("[OK] Loaded Random Forest model")
        except Exception as e:
            print(f"[WARN] Could not load Random Forest: {e}")
        
        try:
            _XGBOOST = joblib.load(os.path.join(model_dir, "xgboost.joblib"))
            print("[OK] Loaded XGBoost model")
        except Exception as e:
            print(f"[WARN] Could not load XGBoost: {e}")
        
        # Load metadata
        try:
            with open(os.path.join(model_dir, "metadata.json"), "r") as f:
                _MODEL_METADATA = json.load(f)
            print("[OK] Loaded model metadata")
        except Exception as e:
            print(f"[WARN] Could not load metadata: {e}")
        
        _MODELS_LOADED = True
        
        if not any([_IFOREST, _RANDOM_FOREST, _XGBOOST]):
            print("[WARN] WARNING: No models loaded! Using fallback rule-based scoring.")
        
    except Exception as e:
        print(f"[ERROR] Error loading models: {e}")
        _MODELS_LOADED = True  # Prevent retry


def extract_features(tx: dict) -> dict:
    """
    Extract features from transaction using feature_engine.
    Falls back to simplified extraction if feature_engine is unavailable.
    """
    try:
        # Try to use the enhanced feature_engine
        try:
            from .feature_engine import extract_features as extract_features_enhanced
        except (ImportError, SystemError):
            from feature_engine import extract_features as extract_features_enhanced
        return extract_features_enhanced(tx)
    except Exception as e:
        # Fallback: simplified feature extraction
        print(f"[WARN] Using fallback feature extraction: {e}")
        return extract_features_fallback(tx)


def extract_features_fallback(tx: dict) -> dict:
    """
    Fallback feature extraction when Redis/feature_engine unavailable.
    Returns features matching the expected feature set.
    """
    try:
        from .feature_engine import get_feature_names
    except (ImportError, SystemError):
        from feature_engine import get_feature_names
    
    ts_field = tx.get("timestamp") or tx.get("ts") or tx.get("created_at")
    try:
        ts = datetime.fromisoformat(str(ts_field).replace("Z", "+00:00")).astimezone(timezone.utc)
    except:
        ts = datetime.now(timezone.utc)
    
    amount = float(tx.get("amount", 0))
    tx_type = tx.get("tx_type", "P2P").upper()
    channel = tx.get("channel", "app").lower()
    recipient = tx.get("recipient_vpa", "unknown@upi")
    merchant = recipient.split("@")[0]
    
    # Build feature dict matching training features
    features = {
        # Basic
        "amount": amount,
        "log_amount": math.log1p(amount),
        "is_round_amount": 1.0 if (amount % 100 == 0 or amount % 500 == 0) else 0.0,
        # Temporal
        "hour_of_day": float(ts.hour),
        "month_of_year": float(ts.month),
        "day_of_week": float(ts.weekday()),
        "is_weekend": 1.0 if ts.weekday() >= 5 else 0.0,
        "is_night": 1.0 if (ts.hour >= 22 or ts.hour <= 5) else 0.0,
        "is_business_hours": 1.0 if (9 <= ts.hour <= 17) else 0.0,
        # Velocity (set to defaults without Redis)
        "tx_count_1h": 0.0,
        "tx_count_6h": 0.0,
        "tx_count_24h": 0.0,
        "tx_count_1min": 0.0,
        "tx_count_5min": 0.0,
        # Behavioral
        "is_new_recipient": 0.0,
        "recipient_tx_count": 5.0,
        "is_new_device": 0.0,
        "device_count": 1.0,
        "is_p2m": 1.0 if tx_type == "P2M" else 0.0,
        "is_p2p": 1.0 if tx_type == "P2P" else 0.0,
        # Statistical
        "amount_mean": amount,
        "amount_std": amount * 0.3,
        "amount_max": amount * 1.5,
        "amount_deviation": 0.5,
        # Risk
        "merchant_risk_score": 0.5 if merchant[0].isdigit() else 0.0,
        "is_qr_channel": 1.0 if channel == "qr" else 0.0,
        "is_web_channel": 1.0 if channel == "web" else 0.0,
    }
    
    return features


def features_to_vector(feature_dict: dict) -> np.ndarray:
    """Convert feature dictionary to numpy array in correct order."""
    try:
        try:
            from .feature_engine import features_to_vector as ftv
        except (ImportError, SystemError):
            from feature_engine import features_to_vector as ftv
        return np.array(ftv(feature_dict))
    except:
        # Fallback: use fixed order matching training
        try:
            from .feature_engine import get_feature_names
        except (ImportError, SystemError):
            from feature_engine import get_feature_names
        feature_names = get_feature_names()
        return np.array([float(feature_dict.get(name, 0.0)) for name in feature_names])


def score_with_ensemble(features_dict: dict) -> Dict[str, float]:
    """
    Score transaction using ensemble of models.
    
    Returns:
        dict with scores from each model and ensemble score
    """
    # Lazy load models
    if not _MODELS_LOADED:
        load_models()
    
    # Convert features to vector
    try:
        feature_vec = features_to_vector(features_dict)
        feature_vec = feature_vec.reshape(1, -1)  # Shape for prediction
    except Exception as e:
        print(f"Error converting features: {e}")
        fallback_score = fallback_rule_based_score(features_dict)
        return {
            "ensemble": fallback_score,
            "final_risk_score": fallback_score,
            "disagreement": 0.0,
            "confidence_level": "LOW",
            "iforest": None,
            "random_forest": None,
            "xgboost": None
        }
    
    scores = {}
    
    # Isolation Forest (unsupervised)
    if _IFOREST:
        try:
            # Anomaly score: higher = more anomalous
            anomaly_score = -_IFOREST.decision_function(feature_vec)[0]
            # Normalize to 0-1
            iforest_score = 1 / (1 + math.exp(-anomaly_score))
            scores["iforest"] = float(max(0.0, min(1.0, iforest_score)))
        except Exception as e:
            print(f"Isolation Forest scoring error: {e}")
    
    # Random Forest (supervised)
    if _RANDOM_FOREST:
        try:
            rf_proba = _RANDOM_FOREST.predict_proba(feature_vec)[0, 1]  # Probability of fraud
            scores["random_forest"] = float(rf_proba)
        except Exception as e:
            print(f"Random Forest scoring error: {e}")
    
    # XGBoost (supervised)
    if _XGBOOST:
        try:
            xgb_proba = _XGBOOST.predict_proba(feature_vec)[0, 1]  # Probability of fraud
            scores["xgboost"] = float(xgb_proba)
        except Exception as e:
            print(f"XGBoost scoring error: {e}")
    
    # Ensemble: weighted average
    if scores:
        # Weight supervised models higher than unsupervised
        weights = {
            "iforest": 0.2,
            "random_forest": 0.4,
            "xgboost": 0.4
        }
        
        weighted_sum = sum(scores.get(model, 0) * weights.get(model, 0) 
                          for model in weights.keys())
        total_weight = sum(weights.get(model, 0) for model in scores.keys())
        
        scores["ensemble"] = float(weighted_sum / total_weight) if total_weight > 0 else 0.0

        # Final risk score: simple average of available model scores (excluding ensemble)
        model_values = [v for k, v in scores.items() if k != "ensemble"]
        if model_values:
            scores["final_risk_score"] = float(sum(model_values) / len(model_values))
            # Disagreement: spread between max and min model scores
            scores["disagreement"] = float(max(model_values) - min(model_values))
            # Confidence level from disagreement
            if scores["disagreement"] < 0.2:
                scores["confidence_level"] = "HIGH"
            elif scores["disagreement"] <= 0.4:
                scores["confidence_level"] = "MEDIUM"
            else:
                scores["confidence_level"] = "LOW"
        else:
            scores["final_risk_score"] = scores["ensemble"]
            scores["disagreement"] = 0.0
            scores["confidence_level"] = "HIGH"
    else:
        # No models available, use fallback
        scores["ensemble"] = fallback_rule_based_score(features_dict)
        scores["final_risk_score"] = scores["ensemble"]
        scores["disagreement"] = 0.0
        scores["confidence_level"] = "HIGH"
    
    return scores


def fallback_rule_based_score(features: dict) -> float:
    """
    Fallback rule-based scoring when no models are available.
    Uses heuristics based on amount, velocity, and temporal patterns.
    Made lenient to avoid false positives.
    """
    amount = float(features.get("amount", 0))
    is_night = float(features.get("is_night", 0))
    is_new_recipient = float(features.get("is_new_recipient", 0))
    merchant_risk = float(features.get("merchant_risk_score", 0))
    tx_count_1h = float(features.get("tx_count_1h", 0))
    is_qr = float(features.get("is_qr_channel", 0))
    is_web = float(features.get("is_web_channel", 0))
    
    score = 0.0
    
    # Amount-based risk (lenient - raised thresholds)
    if amount > 50000:
        score += 0.3
    elif amount > 25000:
        score += 0.15
    elif amount > 10000:
        score += 0.08
    
    # Temporal risk (reduced)
    if is_night > 0:
        score += 0.1
    
    # Device checking removed
    
    # New recipient - minimal impact
    if is_new_recipient > 0:
        score += 0.03
    
    # Merchant risk (reduced)
    score += merchant_risk * 0.1
    
    # Velocity risk (kept but reduced)
    if tx_count_1h > 10:
        score += 0.2
    elif tx_count_1h > 5:
        score += 0.1
    
    # Channel risk (reduced)
    if is_qr > 0 or is_web > 0:
        score += 0.05
    
    return float(max(0.0, min(1.0, score)))


def score_transaction(tx: dict, return_details: bool = False) -> Union[float, Dict[str, Any]]:
    """
    Main scoring function.
    - Always computes per-model scores.
    - Optionally returns full details (model scores + explainability reasons).

    Args:
        tx: Transaction dictionary
        return_details: When True, return dict with risk score, model-wise scores, and reasons.

    Returns:
        float risk score (default) OR
        dict {"risk_score", "final_risk_score", "model_scores", "disagreement", "confidence_level", "reasons", "features"}
    """
    try:
        # Extract features
        features = extract_features(tx)

        # Score with ensemble
        model_scores = score_with_ensemble(features)
        risk_score = model_scores.get("ensemble", 0.0)
        final_risk_score = model_scores.get("final_risk_score", risk_score)
        disagreement = model_scores.get("disagreement", 0.0)
        confidence_level = model_scores.get("confidence_level", "HIGH")

        if not return_details:
            return risk_score

        # Build explainability reasons using the dedicated module (no scoring done here)
        reasons = explain_transaction(
            features,
            {
                "iforest_score": model_scores.get("iforest"),
                "rf_proba": model_scores.get("random_forest"),
                "xgb_proba": model_scores.get("xgboost"),
            },
        )

        return {
            "risk_score": risk_score,
            "final_risk_score": final_risk_score,
            "model_scores": model_scores,
            "disagreement": disagreement,
            "confidence_level": confidence_level,
            "reasons": reasons,
            "features": features,
        }

    except Exception as e:
        print(f"Scoring error: {e}")
        # Emergency fallback
        if return_details:
            return {
                "risk_score": 0.5,
                "final_risk_score": 0.5,
                "model_scores": {},
                "disagreement": 0.0,
                "confidence_level": "LOW",
                "reasons": ["Scoring fallback due to error"],
                "features": {},
            }
        return 0.5


# Legacy compatibility functions
def score_features(features: dict) -> float:
    """Legacy function for compatibility."""
    scores = score_with_ensemble(features)
    return scores.get("ensemble", 0.0)