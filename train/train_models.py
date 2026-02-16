"""
Enhanced ML Training Pipeline for UPI Fraud Detection
- Generates realistic fraud patterns
- Trains ensemble of models (Isolation Forest, Random Forest, XGBoost)
- Includes validation split and comprehensive evaluation
- Saves multiple model files with metadata
"""

import random
import uuid
import json
from datetime import datetime, timedelta, timezone
import numpy as np
import joblib
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    classification_report, confusion_matrix, 
    roc_auc_score, precision_recall_curve, auc
)
import xgboost as xgb

from app.upi_transaction_id import generate_upi_transaction_id

# Define feature names for this training pipeline
def get_feature_names():
    """Return ordered list of feature names for model training."""
    return [
        # Basic (3)
        "amount", "log_amount", "is_round_amount",
        # Temporal (6) - added month
        "hour_of_day", "month_of_year", "day_of_week", "is_weekend", "is_night", "is_business_hours",
        # Velocity (5)
        "tx_count_1h", "tx_count_6h", "tx_count_24h", "tx_count_1min", "tx_count_5min",
        # Behavioral (6) - added is_p2p
        "is_new_recipient", "recipient_tx_count", "is_new_device", "device_count", "is_p2m", "is_p2p",
        # Statistical (4)
        "amount_mean", "amount_std", "amount_max", "amount_deviation",
        # Risk (3)
        "merchant_risk_score", "is_qr_channel", "is_web_channel"
    ]

# Set random seeds for reproducibility
random.seed(42)
np.random.seed(42)

# ----------------------------
# REALISTIC TRANSACTION GENERATOR
# ----------------------------

def generate_normal_transaction():
    """Generate a normal, legitimate transaction."""
    ts = datetime.now(timezone.utc) - timedelta(seconds=random.randint(0, 86400))
    
    # Normal user behavior patterns
    user_id = random.randint(1, 500)
    
    # Normal amounts follow log-normal distribution
    amount = round(abs(np.random.lognormal(5.5, 1.2)), 2)
    amount = min(amount, 5000)  # Cap at 5000 for normal transactions
    
    # Time patterns - more likely during business hours
    if random.random() < 0.7:  # 70% during business hours
        ts = ts.replace(hour=random.randint(9, 21))
    
    return {
        "tx_id": generate_upi_transaction_id(),
        "user_id": f"user{user_id}",
        "device_id": f"device_{user_id}_{random.randint(1, 3)}",  # 1-3 devices per user
        "timestamp": ts.isoformat(),
        "amount": amount,
        "recipient_vpa": f"merchant{random.randint(1, 300)}@upi",
        "tx_type": random.choices(["P2P", "P2M"], weights=[0.4, 0.6])[0],
        "channel": random.choices(["app", "qr", "web"], weights=[0.7, 0.2, 0.1])[0]
    }


def generate_fraud_transaction():
    """Generate a fraudulent transaction with realistic fraud patterns."""
    tx = generate_normal_transaction()
    
    # Multiple fraud patterns
    fraud_type = random.choices(
        ["high_amount", "velocity", "account_takeover", "suspicious_merchant", "night_activity", "mixed"],
        weights=[0.25, 0.20, 0.20, 0.15, 0.10, 0.10]
    )[0]
    
    if fraud_type == "high_amount":
        # Unusually high amount
        tx["amount"] = round(random.uniform(8000, 25000), 2)
        
    elif fraud_type == "velocity":
        # Rapid succession - simulate by same timestamp/user
        tx["amount"] = round(random.uniform(500, 3000), 2)
        # This will be caught by velocity features in feature extraction
        
    elif fraud_type == "account_takeover":
        # New device + new recipient + unusual time
        tx["device_id"] = f"device_new_{uuid.uuid4().hex[:8]}"
        tx["recipient_vpa"] = f"suspicious{random.randint(1, 50)}@upi"
        tx["timestamp"] = (datetime.now(timezone.utc) - timedelta(
            seconds=random.randint(0, 86400))
        ).replace(hour=random.randint(0, 5)).isoformat()
        tx["amount"] = round(random.uniform(2000, 8000), 2)
        
    elif fraud_type == "suspicious_merchant":
        # Merchant with suspicious patterns
        tx["recipient_vpa"] = f"{random.randint(100000, 999999)}@upi"
        tx["amount"] = round(random.uniform(1000, 5000), 2)
        tx["channel"] = "qr"
        
    elif fraud_type == "night_activity":
        # Late night/early morning transactions
        tx["timestamp"] = (datetime.now(timezone.utc) - timedelta(
            seconds=random.randint(0, 86400))
        ).replace(hour=random.randint(0, 4)).isoformat()
        tx["amount"] = round(random.uniform(1500, 6000), 2)
        tx["recipient_vpa"] = f"merchant{random.randint(500, 700)}@upi"
        
    elif fraud_type == "mixed":
        # Multiple suspicious indicators
        tx["amount"] = round(random.uniform(5000, 15000), 2)
        tx["device_id"] = f"device_new_{uuid.uuid4().hex[:8]}"
        tx["channel"] = random.choice(["qr", "web"])
        # Round amount (common in fraud)
        tx["amount"] = round(tx["amount"] / 100) * 100
    
    return tx


def create_training_dataset(n_normal=10000, n_fraud=1000):
    """
    Create a realistic training dataset with labels.
    
    Args:
        n_normal: Number of normal transactions
        n_fraud: Number of fraudulent transactions
    
    Returns:
        X: Feature matrix
        y: Labels (0=normal, 1=fraud)
        raw_data: Original transactions for analysis
    """
    print(f"Generating {n_normal} normal and {n_fraud} fraudulent transactions...")
    
    transactions = []
    labels = []
    
    # Generate normal transactions
    for _ in range(n_normal):
        tx = generate_normal_transaction()
        transactions.append(tx)
        labels.append(0)
    
    # Generate fraud transactions
    for _ in range(n_fraud):
        tx = generate_fraud_transaction()
        transactions.append(tx)
        labels.append(1)
    
    print("Extracting features...")
    X = []
    valid_indices = []
    
    for idx, tx in enumerate(transactions):
        try:
            # Use simplified feature extraction
            feature_vec = extract_features_simple(tx)
            
            X.append(feature_vec)
            valid_indices.append(idx)
        except Exception as e:
            print(f"Warning: Failed to extract features for transaction {idx}: {e}")
            continue
    
    X = np.array(X)
    y = np.array([labels[i] for i in valid_indices])
    raw_data = [transactions[i] for i in valid_indices]
    
    print(f"Dataset created: {X.shape[0]} samples, {X.shape[1]} features")
    print(f"Normal: {np.sum(y == 0)}, Fraud: {np.sum(y == 1)} ({np.mean(y)*100:.2f}% fraud rate)")
    
    return X, y, raw_data


def extract_features_simple(tx):
    """Simplified feature extraction without Redis (for training)."""
    ts_str = tx["timestamp"]
    if ts_str.endswith('Z'):
        ts_str = ts_str[:-1] + '+00:00'
    ts = datetime.fromisoformat(ts_str)
    amount = float(tx["amount"])
    merchant = tx["recipient_vpa"].split("@")[0]
    
    features = [
        amount,  # amount
        np.log1p(amount),  # log_amount
        1.0 if (amount % 100 == 0 or amount % 500 == 0) else 0.0,  # is_round_amount
        float(ts.hour),  # hour_of_day
        float(ts.month),  # month_of_year
        float(ts.weekday()),  # day_of_week
        1.0 if ts.weekday() >= 5 else 0.0,  # is_weekend
        1.0 if (ts.hour >= 22 or ts.hour <= 5) else 0.0,  # is_night
        1.0 if (9 <= ts.hour <= 17) else 0.0,  # is_business_hours
        # Velocity features - set to defaults for training
        0.0, 0.0, 0.0, 0.0, 0.0,  # tx_count_1h, 6h, 24h, 1min, 5min
        # Behavioral features
        0.0,  # is_new_recipient
        random.uniform(1, 10),  # recipient_tx_count
        1.0 if "new" in tx["device_id"] else 0.0,  # is_new_device
        random.uniform(1, 3),  # device_count
        1.0 if tx["tx_type"] == "P2M" else 0.0,  # is_p2m
        1.0 if tx["tx_type"] == "P2P" else 0.0,  # is_p2p
        # Statistical features
        amount * random.uniform(0.8, 1.2),  # amount_mean (simulated)
        amount * 0.3,  # amount_std (simulated)
        amount * 1.5,  # amount_max (simulated)
        random.uniform(0, 2),  # amount_deviation
        # Risk indicators
        0.5 if merchant[0].isdigit() else 0.0,  # merchant_risk_score
        1.0 if tx["channel"] == "qr" else 0.0,  # is_qr_channel
        1.0 if tx["channel"] == "web" else 0.0,  # is_web_channel
    ]
    return features


# ----------------------------
# MODEL TRAINING
# ----------------------------

def train_isolation_forest(X_train, contamination=0.1):
    """Train Isolation Forest for unsupervised anomaly detection."""
    print("\n--- Training Isolation Forest ---")
    model = IsolationForest(
        n_estimators=200,
        contamination=contamination,
        random_state=42,
        n_jobs=-1,
        max_samples='auto'
    )
    model.fit(X_train)
    print("Isolation Forest trained successfully")
    return model


def train_random_forest(X_train, y_train):
    """Train Random Forest classifier."""
    print("\n--- Training Random Forest ---")
    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=15,
        min_samples_split=10,
        min_samples_leaf=4,
        random_state=42,
        n_jobs=-1,
        class_weight='balanced'  # Handle imbalanced data
    )
    model.fit(X_train, y_train)
    print("Random Forest trained successfully")
    return model


def train_xgboost(X_train, y_train):
    """Train XGBoost classifier."""
    print("\n--- Training XGBoost ---")
    
    # Calculate scale_pos_weight for imbalanced data
    scale_pos_weight = np.sum(y_train == 0) / np.sum(y_train == 1)
    
    model = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=scale_pos_weight,
        random_state=42,
        n_jobs=-1,
        eval_metric='auc'
    )
    model.fit(X_train, y_train)
    print("XGBoost trained successfully")
    return model


# ----------------------------
# EVALUATION
# ----------------------------

def evaluate_model(model, X_test, y_test, model_name, is_supervised=True):
    """Evaluate model and print metrics."""
    print(f"\n{'='*60}")
    print(f"EVALUATION: {model_name}")
    print(f"{'='*60}")
    
    if is_supervised:
        # Supervised models (RF, XGBoost)
        y_pred = model.predict(X_test)
        if hasattr(model, 'predict_proba'):
            y_proba = model.predict_proba(X_test)[:, 1]
        else:
            y_proba = model.decision_function(X_test)
        
        print("\nClassification Report:")
        print(classification_report(y_test, y_pred, target_names=['Normal', 'Fraud'], zero_division=0))
        
        print("\nConfusion Matrix:")
        cm = confusion_matrix(y_test, y_pred)
        print(cm)
        if cm.size == 4:
            print(f"TN: {cm[0,0]}, FP: {cm[0,1]}, FN: {cm[1,0]}, TP: {cm[1,1]}")
        
        # ROC-AUC
        roc_auc = roc_auc_score(y_test, y_proba)
        print(f"\nROC-AUC Score: {roc_auc:.4f}")
        
        # Precision-Recall AUC
        precision, recall, _ = precision_recall_curve(y_test, y_proba)
        pr_auc = auc(recall, precision)
        print(f"PR-AUC Score: {pr_auc:.4f}")
        
        return {
            "model_name": model_name,
            "roc_auc": float(roc_auc),
            "pr_auc": float(pr_auc),
            "confusion_matrix": cm.tolist()
        }
    else:
        # Unsupervised model (Isolation Forest)
        # -1 for outliers (fraud), 1 for inliers (normal)
        y_pred_raw = model.predict(X_test)
        y_pred = np.where(y_pred_raw == -1, 1, 0)  # Convert to 0/1
        
        anomaly_scores = -model.decision_function(X_test)  # Higher = more anomalous
        
        print("\nClassification Report:")
        print(classification_report(y_test, y_pred, target_names=['Normal', 'Fraud'], zero_division=0))
        
        print("\nConfusion Matrix:")
        cm = confusion_matrix(y_test, y_pred)
        print(cm)
        if cm.size == 4:
            print(f"TN: {cm[0,0]}, FP: {cm[0,1]}, FN: {cm[1,0]}, TP: {cm[1,1]}")
        
        # ROC-AUC using anomaly scores
        roc_auc = roc_auc_score(y_test, anomaly_scores)
        print(f"\nROC-AUC Score: {roc_auc:.4f}")
        
        return {
            "model_name": model_name,
            "roc_auc": float(roc_auc),
            "confusion_matrix": cm.tolist()
        }


# ----------------------------
# MAIN TRAINING PIPELINE
# ----------------------------

def main():
    """Main training pipeline."""
    print("="*60)
    print("UPI FRAUD DETECTION - ML TRAINING PIPELINE")
    print("="*60)
    
    # 1. Generate dataset
    X, y, raw_data = create_training_dataset(
        n_normal=10000,
        n_fraud=1000
    )
    
    # 2. Train/test split
    print("\nSplitting data into train (70%) and test (30%)...")
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.3, random_state=42, stratify=y
    )
    
    print(f"Training set: {X_train.shape[0]} samples")
    print(f"Test set: {X_test.shape[0]} samples")
    
    # 3. Train models
    results = {}
    
    # Isolation Forest
    iforest = train_isolation_forest(X_train, contamination=0.1)
    results['iforest'] = evaluate_model(iforest, X_test, y_test, "Isolation Forest", is_supervised=False)
    
    # Random Forest
    rf = train_random_forest(X_train, y_train)
    results['random_forest'] = evaluate_model(rf, X_test, y_test, "Random Forest", is_supervised=True)
    
    # XGBoost
    xgb_model = train_xgboost(X_train, y_train)
    results['xgboost'] = evaluate_model(xgb_model, X_test, y_test, "XGBoost", is_supervised=True)
    
    # 4. Save models
    print("\n" + "="*60)
    print("SAVING MODELS")
    print("="*60)
    
    joblib.dump(iforest, "models/iforest.joblib")
    print("✓ Saved: models/iforest.joblib")
    
    joblib.dump(rf, "models/random_forest.joblib")
    print("✓ Saved: models/random_forest.joblib")
    
    joblib.dump(xgb_model, "models/xgboost.joblib")
    print("✓ Saved: models/xgboost.joblib")
    
    # 5. Store drift detection baselines from training data
    print("\n" + "="*60)
    print("STORING DRIFT DETECTION BASELINES")
    print("="*60)
    try:
        from app.drift_detector import store_baseline

        feature_names_list = get_feature_names()
        feature_distributions: dict[str, list[float]] = {
            name: [] for name in feature_names_list
        }

        # Collect per-feature value lists from the full training set
        for row in X_train:
            for i, name in enumerate(feature_names_list):
                feature_distributions[name].append(float(row[i]))

        store_baseline(feature_distributions)
        print(f"✓ Stored drift baselines for {len(feature_names_list)} features "
              f"({X_train.shape[0]} samples)")
    except Exception as e:
        print(f"⚠ Could not store drift baselines (Redis may be unavailable): {e}")
        print("  Drift detection will work once baselines are stored with Redis running.")

    # 6. Save metadata
    metadata = {
        "training_date": datetime.now().isoformat(),
        "training_samples": int(X_train.shape[0]),
        "test_samples": int(X_test.shape[0]),
        "num_features": int(X.shape[1]),
        "feature_names": get_feature_names(),
        "fraud_rate": float(np.mean(y)),
        "model_results": results
    }
    
    with open("models/metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)
    print("✓ Saved: models/metadata.json")
    
    # 7. Print summary
    print("\n" + "="*60)
    print("TRAINING COMPLETE - MODEL COMPARISON")
    print("="*60)
    print(f"{'Model':<20} {'ROC-AUC':<10}")
    print("-" * 60)
    for model_name, res in results.items():
        print(f"{res['model_name']:<20} {res['roc_auc']:<10.4f}")
    
    print("\n✓ All models trained and saved successfully!")
    print("Run 'python evaluate_model.py' for detailed analysis")


if __name__ == "__main__":
    main()
