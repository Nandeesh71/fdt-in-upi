"""Create a single test transaction with explainability."""
import sys
import os
from datetime import datetime, timezone
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

import requests
from app.upi_transaction_id import generate_upi_transaction_id

URL = "http://localhost:8000/transactions"

# Create a test transaction
tx = {
    "tx_id": generate_upi_transaction_id(),
    "user_id": "user_001",
    "device_id": "test_device_456",
    "amount": 5000.00,
    "recipient_vpa": "merchant@upi",
    "tx_type": "P2M",
    "channel": "app",
    "ts": datetime.now(timezone.utc).isoformat()
}

print("Sending test transaction...")
print(f"TX ID: {tx['tx_id']}")

try:
    response = requests.post(URL, json=tx, timeout=10)
    
    if response.status_code == 200:
        data = response.json()
        print("\n✓ Transaction created successfully!")
        
        inserted = data.get("inserted", {})
        print(f"\nResponse:")
        print(f"  Risk Score: {inserted.get('risk_score', 'N/A')}")
        print(f"  Action: {inserted.get('action', 'N/A')}")
        
        # Check if explainability is in response
        if "explainability" in inserted:
            expl = inserted["explainability"]
            print(f"\n✓ Explainability attached:")
            print(f"  Reasons: {len(expl.get('reasons', []))} items")
            print(f"  Model scores: {list(expl.get('model_scores', {}).keys())}")
            
            if expl.get('reasons'):
                print(f"\n  Reasons:")
                for i, reason in enumerate(expl['reasons'], 1):
                    print(f"    {i}. {reason}")
        else:
            print("\n⚠️  No explainability in response")
            
    else:
        print(f"\n✗ Error: {response.status_code}")
        print(response.text)
        
except Exception as e:
    print(f"\n✗ Exception: {e}")
    print("\nMake sure the server is running:")
    print("  python -m uvicorn app.main:app --reload --port 8000")
