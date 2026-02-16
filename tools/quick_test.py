"""
Quick test script to verify ML improvements are working
"""

print("="*60)
print("UPI FRAUD DETECTION - QUICK TEST")
print("="*60)

# Test 1: Check if dependencies are installed
print("\n[Test 1] Checking dependencies...")
try:
    import numpy as np
    import sklearn
    import xgboost
    import matplotlib
    import seaborn
    print("✓ All dependencies installed")
except ImportError as e:
    print(f"❌ Missing dependency: {e}")
    print("\nRun: pip install numpy scikit-learn xgboost matplotlib seaborn")
    exit(1)

# Test 2: Check if models exist
print("\n[Test 2] Checking trained models...")
import os
models_exist = all([
    os.path.exists("models/iforest.joblib"),
    os.path.exists("models/random_forest.joblib"),
    os.path.exists("models/xgboost.joblib")
])
if models_exist:
    print("✓ All models found")
else:
    print("⚠ Models not found. Run: python train_models.py")

# Test 3: Check feature extraction
print("\n[Test 3] Testing feature extraction...")
try:
    from app.feature_engine import extract_features, get_feature_names
    
    test_tx = {
        "amount": 500,
        "timestamp": "2026-01-14T14:30:00Z",
        "user_id": "user123",
        "device_id": "device456",
        "recipient_vpa": "merchant1@upi",
        "tx_type": "P2P",
        "channel": "app"
    }
    
    # Use fallback extraction if Redis not available
    features = extract_features(test_tx)
    feature_names = get_feature_names()
    
    print(f"✓ Feature extraction working ({len(feature_names)} features)")
    print(f"  Sample features: {list(features.keys())[:5]}")
except Exception as e:
    print(f"⚠ Feature extraction error: {e}")

# Test 4: Test scoring (if models exist)
if models_exist:
    print("\n[Test 4] Testing ML scoring...")
    try:
        from app.scoring import score_transaction
        
        # Normal transaction
        normal_tx = {
            "amount": 500,
            "timestamp": "2026-01-14T14:30:00Z",
            "user_id": "user123",
            "device_id": "device456",
            "recipient_vpa": "merchant1@upi",
            "tx_type": "P2P",
            "channel": "app"
        }
        
        # Fraudulent transaction
        fraud_tx = {
            "amount": 15000,
            "timestamp": "2026-01-14T02:30:00Z",
            "user_id": "user456",
            "device_id": "new_device_999",
            "recipient_vpa": "999888@upi",
            "tx_type": "P2M",
            "channel": "qr"
        }
        
        normal_score = score_transaction(normal_tx)
        fraud_score = score_transaction(fraud_tx)
        
        print(f"✓ ML scoring working")
        print(f"\n  Normal Transaction:")
        print(f"    Risk Score: {normal_score:.4f}")
        print(f"    Action: {'BLOCK' if normal_score >= 0.07 else 'DELAY' if normal_score >= 0.02 else 'ALLOW'}")
        
        print(f"\n  Suspicious Transaction:")
        print(f"    Risk Score: {fraud_score:.4f}")
        print(f"    Action: {'BLOCK' if fraud_score >= 0.07 else 'DELAY' if fraud_score >= 0.02 else 'ALLOW'}")
        
        if fraud_score > normal_score:
            print(f"\n✓ Model correctly identifies suspicious transaction!")
        else:
            print(f"\n⚠ Warning: Model may need retraining")
            
    except Exception as e:
        print(f"⚠ Scoring error: {e}")
else:
    print("\n[Test 4] Skipped (models not trained)")

# Test 5: Check Docker services
print("\n[Test 5] Checking Docker services...")
try:
    import subprocess
    result = subprocess.run(["docker", "ps"], capture_output=True, text=True)
    if "postgres" in result.stdout.lower() or "db" in result.stdout.lower():
        print("✓ PostgreSQL is running")
    else:
        print("⚠ PostgreSQL not detected. Run: docker-compose up -d")
    
    if "redis" in result.stdout.lower():
        print("✓ Redis is running")
    else:
        print("⚠ Redis not detected. Run: docker-compose up -d")
except Exception as e:
    print(f"⚠ Cannot check Docker: {e}")

# Summary
print("\n" + "="*60)
print("TEST SUMMARY")
print("="*60)

if models_exist:
    print("\n✓ System is ready!")
    print("\nNext steps:")
    print("  1. Start API: uvicorn app.main:app --reload --port 8000")
    print("  2. Open dashboard: http://localhost:8000/dashboard")
    print("  3. Run simulator: python simulator/generator.py")
else:
    print("\n⚠ System needs setup!")
    print("\nNext steps:")
    print("  1. Train models: python train_models.py")
    print("  2. Then run this test again: python quick_test.py")

print("\n" + "="*60)
