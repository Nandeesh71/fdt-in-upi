"""
Standalone ML Model Testing - No API/Database Required
Tests the ML ensemble directly without needing the server running
"""

import sys
import os
from datetime import datetime, timezone

# Add parent directory to path so we can import app module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.upi_transaction_id import generate_upi_transaction_id

print("="*60)
print("STANDALONE ML MODEL TEST")
print("="*60)

# Test the scoring module directly
print("\n[1] Loading ML models...")
try:
    from app.scoring import score_transaction, load_models
    
    # Force load models
    load_models()
    print("✓ Models loaded successfully\n")
except Exception as e:
    print(f"❌ Error loading models: {e}")
    sys.exit(1)

# Generate transaction IDs for test cases
tx_ids = [generate_upi_transaction_id() for _ in range(6)]

# Test transactions
test_cases = [
    {
        "name": "Normal - Small amount, business hours",
        "tx": {
            "tx_id": tx_ids[0],
            "user_id": "user123",
            "device_id": "device456",
            "timestamp": "2026-01-14T14:30:00Z",
            "amount": 350.00,
            "recipient_vpa": "merchant1@upi",
            "tx_type": "P2P",
            "channel": "app"
        }
    },
    {
        "name": "Slightly Suspicious - Higher amount",
        "tx": {
            "tx_id": tx_ids[1],
            "user_id": "user123",
            "device_id": "device456",
            "timestamp": "2026-01-14T10:30:00Z",
            "amount": 2500.00,
            "recipient_vpa": "merchant50@upi",
            "tx_type": "P2M",
            "channel": "app"
        }
    },
    {
        "name": "Suspicious - Night time + high amount",
        "tx": {
            "tx_id": tx_ids[2],
            "user_id": "user789",
            "device_id": "device_new_123",
            "timestamp": "2026-01-14T03:15:00Z",
            "amount": 8000.00,
            "recipient_vpa": "merchant999@upi",
            "tx_type": "P2M",
            "channel": "qr"
        }
    },
    {
        "name": "High Risk - Large amount + suspicious merchant + night",
        "tx": {
            "tx_id": tx_ids[3],
            "user_id": "user999",
            "device_id": "new_device_suspicious",
            "timestamp": "2026-01-14T02:30:00Z",
            "amount": 18000.00,
            "recipient_vpa": "999888777@upi",
            "tx_type": "P2M",
            "channel": "web"
        }
    },
    {
        "name": "Weekend Transaction",
        "tx": {
            "tx_id": tx_ids[4],
            "user_id": "user555",
            "device_id": "device789",
            "timestamp": "2026-01-11T20:00:00Z",  # Saturday
            "amount": 1200.00,
            "recipient_vpa": "restaurant@upi",
            "tx_type": "P2M",
            "channel": "qr"
        }
    },
    {
        "name": "Round Amount (Fraud Pattern)",
        "tx": {
            "tx_id": tx_ids[5],
            "user_id": "user111",
            "device_id": "device222",
            "timestamp": "2026-01-14T15:00:00Z",
            "amount": 5000.00,  # Exact round number
            "recipient_vpa": "12345@upi",
            "tx_type": "P2M",
            "channel": "qr"
        }
    }
]

print("\n[2] Testing transactions...\n")
print("="*60)

results = []

for idx, test in enumerate(test_cases, 1):
    print(f"\nTest {idx}: {test['name']}")
    print("-" * 60)
    
    tx = test['tx']
    print(f"Amount: ₹{tx['amount']:.2f}")
    print(f"Time: {tx['timestamp']}")
    print(f"Channel: {tx['channel'].upper()}")
    print(f"Merchant: {tx['recipient_vpa']}")
    
    try:
        risk_score = score_transaction(tx)
        
        # Determine action based on thresholds
        if risk_score >= 0.60:
            action = "🔴 BLOCK"
            color = "HIGH RISK"
        elif risk_score >= 0.30:
            action = "🟡 DELAY"
            color = "MEDIUM RISK"
        else:
            action = "🟢 ALLOW"
            color = "LOW RISK"
        
        print(f"\n📊 Risk Score: {risk_score:.4f} ({risk_score*100:.2f}%)")
        print(f"⚡ Action: {action}")
        print(f"🎯 Classification: {color}")
        
        results.append({
            "name": test['name'],
            "score": risk_score,
            "action": action
        })
        
    except Exception as e:
        print(f"❌ Error: {e}")
        results.append({
            "name": test['name'],
            "score": None,
            "action": "ERROR"
        })

# Summary
print("\n" + "="*60)
print("SUMMARY")
print("="*60)

print(f"\n{'Test Case':<45} {'Risk Score':<12} {'Action':<10}")
print("-" * 60)

for r in results:
    if r['score'] is not None:
        print(f"{r['name']:<45} {r['score']:.4f} ({r['score']*100:>5.1f}%)  {r['action']}")
    else:
        print(f"{r['name']:<45} {'ERROR':<12} {r['action']}")

print("\n" + "="*60)
print("✓ Standalone test complete!")
print("="*60)

# Compare old vs new thresholds
print("\n📌 Threshold Recommendations:")
print("-" * 60)
print("Current (config.yaml):")
print("  delay: 0.02 (2%)  ← Too low for new model")
print("  block: 0.07 (7%)  ← Too low for new model")
print("\nRecommended for new ML models:")
print("  delay: 0.30 (30%) ← Better balance")
print("  block: 0.60 (60%) ← High confidence")
print("\nWith recommended thresholds:")

for r in results:
    if r['score'] is not None:
        score = r['score']
        if score >= 0.60:
            new_action = "🔴 BLOCK"
        elif score >= 0.30:
            new_action = "🟡 DELAY"
        else:
            new_action = "🟢 ALLOW"
        print(f"  {r['name']:<45} {new_action}")
