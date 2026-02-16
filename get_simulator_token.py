#!/usr/bin/env python3
"""
Helper script to register a test user and get JWT token for simulator
"""
import requests
import sys

BACKEND_URL = "http://localhost:8001"

def get_token():
    """Register test user and get JWT token"""
    # Test user credentials
    user_data = {
        "name": "Simulator Test User",
        "phone": "9999999999",
        "password": "test123",
        "email": "simulator@test.com"
    }
    
    print("🔐 Attempting to get token for simulator...")
    
    # Try to login first (in case user already exists)
    try:
        login_response = requests.post(
            f"{BACKEND_URL}/api/login",
            json={"phone": user_data["phone"], "password": user_data["password"]},
            timeout=5
        )
        
        if login_response.status_code == 200:
            result = login_response.json()
            token = result.get("token")
            user = result.get("user", {})
            print(f"✅ Login successful!")
            print(f"   User: {user.get('name')} ({user.get('phone')})")
            print(f"   Balance: ₹{user.get('balance', 0)}")
            print(f"\n🎫 Token: {token}")
            print(f"\n📋 Run simulator with:")
            print(f"   python simulator.py --token {token}")
            return token
    except Exception as e:
        print(f"⚠️  Login failed, attempting registration...")
    
    # If login failed, try to register
    try:
        register_response = requests.post(
            f"{BACKEND_URL}/api/register",
            json=user_data,
            timeout=5
        )
        
        if register_response.status_code == 200:
            result = register_response.json()
            token = result.get("token")
            user = result.get("user", {})
            print(f"✅ Registration successful!")
            print(f"   User: {user.get('name')} ({user.get('phone')})")
            print(f"   Balance: ₹{user.get('balance', 0)}")
            print(f"\n🎫 Token: {token}")
            print(f"\n📋 Run simulator with:")
            print(f"   python simulator.py --token {token}")
            return token
        else:
            print(f"❌ Registration failed: {register_response.text}")
            sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}")
        print("\n⚠️  Make sure backend server is running on port 8001")
        print("   Run: python backend/server.py")
        sys.exit(1)

if __name__ == "__main__":
    get_token()
