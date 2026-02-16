#!/usr/bin/env python3
"""Test chatbot API with various scenarios"""
import requests
import json

url = "http://localhost:8000/api/chatbot"
headers = {"Content-Type": "application/json"}

test_cases = [
    {"message": "hello", "time_range": "24h", "name": "Greeting"},
    {"message": "What's the fraud rate?", "time_range": "24h", "name": "Fraud Rate"},
    {"message": "Show me high risk transactions", "time_range": "24h", "name": "High Risk"},
    {"message": "How many transactions were blocked?", "time_range": "24h", "name": "Blocked Transactions"},
    {"message": "What's the average risk score?", "time_range": "24h", "name": "Risk Score"},
    {"message": "Last 5 transactions", "time_range": "24h", "name": "Last 5"},
]

print("Testing chatbot API with various queries...\n")
print("=" * 80)

for test in test_cases:
    payload = {
        "message": test["message"],
        "time_range": test["time_range"]
    }
    
    print(f"\n[{test['name']}]")
    print(f"Query: {test['message']}")
    print("-" * 80)
    
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Status: {response.status_code}")
            print(f"Response Preview: {data['response'][:150]}...")
            if "error" in data:
                print(f"⚠ Error: {data['error']}")
        else:
            print(f"✗ Status: {response.status_code}")
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"✗ Exception: {type(e).__name__}: {e}")

print("\n" + "=" * 80)
print("Test completed!")
