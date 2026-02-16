#!/usr/bin/env python3
"""Test dashboard and chatbot in browser"""
import requests
import json
import time

print("Testing Dashboard and Chatbot Interface...")
print("=" * 80)

# Test 1: Check if dashboard is accessible
print("\n[1] Testing Dashboard Page...")
try:
    response = requests.get("http://localhost:8000/dashboard", timeout=5)
    if response.status_code == 200:
        print(f"✓ Dashboard page accessible (Status: {response.status_code})")
        if "chatbot" in response.text.lower():
            print("✓ Chatbot HTML found in dashboard")
        else:
            print("✗ Chatbot HTML NOT found in dashboard")
    else:
        print(f"✗ Dashboard returned status {response.status_code}")
except Exception as e:
    print(f"✗ Error accessing dashboard: {e}")

# Test 2: Check if static assets load
print("\n[2] Testing Static Assets...")
assets = [
    ("CSS", "/static/dashboard.css"),
    ("JavaScript", "/static/dashboard.js")
]

for asset_type, path in assets:
    try:
        response = requests.get(f"http://localhost:8000{path}", timeout=5)
        if response.status_code == 200:
            print(f"✓ {asset_type} loaded (Status: {response.status_code}, Size: {len(response.text)} bytes)")
            if asset_type == "CSS" and "chatbot" in response.text.lower():
                print(f"  ✓ Chatbot CSS found")
            if asset_type == "JavaScript" and "chatbot" in response.text.lower():
                print(f"  ✓ Chatbot JavaScript found")
        else:
            print(f"✗ {asset_type} returned status {response.status_code}")
    except Exception as e:
        print(f"✗ Error loading {asset_type}: {e}")

# Test 3: Test the chatbot API endpoint
print("\n[3] Testing Chatbot API Endpoint...")
test_messages = [
    "Hello",
    "What is the fraud rate?",
    "Show high risk transactions"
]

for msg in test_messages:
    try:
        payload = {"message": msg, "time_range": "24h"}
        response = requests.post(
            "http://localhost:8000/api/chatbot",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if "response" in data and "error" not in data:
                print(f"✓ Message '{msg}' - OK (Response length: {len(data['response'])} chars)")
            else:
                print(f"✗ Message '{msg}' - Invalid response: {data}")
        else:
            print(f"✗ Message '{msg}' - Status {response.status_code}")
    except Exception as e:
        print(f"✗ Message '{msg}' - Error: {e}")

print("\n" + "=" * 80)
print("Testing Complete!")
print("\nTo access the dashboard, open: http://localhost:8000/dashboard")
