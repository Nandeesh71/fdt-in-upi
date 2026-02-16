#!/usr/bin/env python3
"""
Seed test users with transaction history to make simulator more realistic
"""
import requests
import random
import time
from datetime import datetime, timezone, timedelta

BACKEND_URL = "http://localhost:8001"
NUM_USERS = 50
TRANSACTIONS_PER_USER = (3, 10)  # Random range

def create_user(user_num):
    """Create a user account"""
    phone = f"99{str(user_num).zfill(8)}"
    user_data = {
        "name": f"Simulator User user_{str(user_num).zfill(3)}",
        "phone": phone,
        "password": "sim123",
        "email": f"user_{str(user_num).zfill(3)}@simulator.test"
    }
    
    try:
        # Try to register
        response = requests.post(
            f"{BACKEND_URL}/api/register",
            json=user_data,
            timeout=5
        )
        
        if response.status_code == 200:
            result = response.json()
            return result.get("token"), result.get("user", {}).get("user_id")
        elif "already registered" in response.text:
            # Login instead
            login_response = requests.post(
                f"{BACKEND_URL}/api/login",
                json={"phone": phone, "password": "sim123"},
                timeout=5
            )
            if login_response.status_code == 200:
                result = login_response.json()
                return result.get("token"), result.get("user", {}).get("user_id")
    except Exception as e:
        print(f"❌ Error creating user {user_num}: {e}")
    
    return None, None

def create_transaction(token, amount):
    """Create a transaction for the user"""
    merchants = ["amazon", "flipkart", "swiggy", "zomato", "uber", "ola", "paytm", "phonepe", "gpay"]
    names = ["rajesh", "priya", "amit", "neha", "suresh", "divya"]
    
    if random.random() > 0.3:
        # Merchant transaction
        recipient_vpa = f"{random.choice(merchants)}{random.randint(1,20)}@upi"
        tx_type = "P2M"
    else:
        # P2P transaction
        recipient_vpa = f"{random.choice(names)}{random.randint(1,99)}@upi"
        tx_type = "P2P"
    
    payload = {
        "amount": amount,
        "recipient_vpa": recipient_vpa,
        "tx_type": tx_type,
        "remarks": "Historical transaction"
    }
    
    try:
        response = requests.post(
            f"{BACKEND_URL}/api/transaction",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
            timeout=5
        )
        return response.status_code == 200
    except:
        return False

def main():
    print(f"🌱 Seeding {NUM_USERS} users with transaction history...")
    print(f"   Backend: {BACKEND_URL}")
    print(f"   Transactions per user: {TRANSACTIONS_PER_USER[0]}-{TRANSACTIONS_PER_USER[1]}\n")
    
    success_count = 0
    tx_count = 0
    
    for i in range(1, NUM_USERS + 1):
        token, user_id = create_user(i)
        
        if not token:
            continue
        
        # Create random number of transactions
        num_tx = random.randint(*TRANSACTIONS_PER_USER)
        user_tx_success = 0
        
        for _ in range(num_tx):
            # Generate realistic amounts (mostly small)
            if random.random() < 0.7:
                amount = round(random.uniform(50, 1000), 2)
            elif random.random() < 0.9:
                amount = round(random.uniform(1000, 3000), 2)
            else:
                amount = round(random.uniform(3000, 8000), 2)
            
            if create_transaction(token, amount):
                user_tx_success += 1
                tx_count += 1
            
            time.sleep(0.05)  # Small delay to avoid overwhelming the server
        
        if user_tx_success > 0:
            success_count += 1
            print(f"✓ user_{str(i).zfill(3)}: {user_tx_success} transactions created")
    
    print(f"\n✅ Seeding complete!")
    print(f"   Users created: {success_count}/{NUM_USERS}")
    print(f"   Transactions created: {tx_count}")
    print(f"\n💡 Now run: python simulator.py")

if __name__ == "__main__":
    main()
