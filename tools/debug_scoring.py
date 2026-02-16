"""
Debug script to diagnose why risk score is 0
"""
import sys
from datetime import datetime, timezone

# Test transaction (typical "friend" transaction)
test_tx = {
    "tx_id": "test-friend-123",
    "user_id": "user1",
    "device_id": "device1",
    "ts": datetime.now(timezone.utc).isoformat(),
    "amount": 500.0,
    "recipient_vpa": "friend1@upi",
    "tx_type": "P2P",
    "channel": "app"
}

print("=" * 80)
print("DEBUGGING FRAUD DETECTION SCORING")
print("=" * 80)

# Test 1: Redis connection
print("\n[TEST 1] Redis Connection")
try:
    import redis
    import os
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    r = redis.from_url(REDIS_URL, decode_responses=True)
    r.ping()
    print("✅ Redis connected successfully")
except Exception as e:
    print(f"❌ Redis connection failed: {e}")
    print("   → This will cause velocity/behavioral features to fail!")

# Test 2: Model loading
print("\n[TEST 2] Model Loading")
try:
    from app import scoring
    scoring.load_models()
    
    if scoring._IFOREST:
        print("✅ Isolation Forest loaded")
    else:
        print("❌ Isolation Forest not loaded")
    
    if scoring._RANDOM_FOREST:
        print("✅ Random Forest loaded")
    else:
        print("❌ Random Forest not loaded")
    
    if scoring._XGBOOST:
        print("✅ XGBoost loaded")
    else:
        print("❌ XGBoost not loaded")
        
except Exception as e:
    print(f"❌ Model loading failed: {e}")

# Test 3: Feature extraction
print("\n[TEST 3] Feature Extraction")
try:
    from app import scoring
    features = scoring.extract_features(test_tx)
    print(f"✅ Features extracted: {len(features)} features")
    print("\nKey features:")
    for key in ["amount", "is_new_recipient", "is_new_device", "tx_count_1h", "merchant_risk_score"]:
        print(f"   {key}: {features.get(key, 'N/A')}")
except Exception as e:
    print(f"❌ Feature extraction failed: {e}")
    import traceback
    traceback.print_exc()

# Test 4: Scoring
print("\n[TEST 4] Risk Scoring")
try:
    from app import scoring
    risk_score = scoring.score_transaction(test_tx)
    print(f"✅ Risk score calculated: {risk_score:.4f}")
    
    if risk_score == 0.0:
        print("\n⚠️  ISSUE FOUND: Risk score is exactly 0.0")
        print("   Possible causes:")
        print("   1. All features are 0 (first transaction for this user)")
        print("   2. Models returning 0 probability for all inputs")
        print("   3. Feature extraction failing silently")
        
        # Get detailed scores
        features = scoring.extract_features(test_tx)
        detailed_scores = scoring.score_with_ensemble(features)
        print(f"\n   Detailed scores: {detailed_scores}")
        
except Exception as e:
    print(f"❌ Scoring failed: {e}")
    import traceback
    traceback.print_exc()

# Test 5: Multiple transactions to build history
print("\n[TEST 5] Transaction with History")
try:
    from app import scoring
    
    # First transaction (builds history)
    print("   Sending 1st transaction...")
    score1 = scoring.score_transaction(test_tx)
    print(f"   Score 1: {score1:.4f}")
    
    # Second transaction (uses history)
    test_tx["tx_id"] = "test-friend-124"
    test_tx["amount"] = 1500.0  # Higher amount
    print("   Sending 2nd transaction (higher amount)...")
    score2 = scoring.score_transaction(test_tx)
    print(f"   Score 2: {score2:.4f}")
    
    if score2 > score1:
        print("   ✅ Scoring is working - higher amount = higher risk")
    else:
        print("   ⚠️  Scoring may not be working correctly")
        
except Exception as e:
    print(f"❌ Test failed: {e}")

print("\n" + "=" * 80)
print("DIAGNOSTIC COMPLETE")
print("=" * 80)
print("\nIf risk score is 0, common fixes:")
print("1. Ensure Redis is running: docker-compose up -d")
print("2. Check models exist: ls models/*.joblib")
print("3. Restart API server to reload models")
print("4. For first transactions, 0 is normal (no history yet)")
