"""Debug script to check dashboard-data endpoint response."""
import requests

try:
    response = requests.get("http://localhost:8000/dashboard-data?time_range=24h", timeout=5)
    print("\nDashboard Data Response:")
    print("=" * 60)
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print("\nFull response:")
        print(data)
        
        stats = data.get("stats", {})
        print("\nStats breakdown:")
        print(f"  Total Transactions: {stats.get('totalTransactions', 'MISSING')}")
        print(f"  Blocked: {stats.get('blocked', 'MISSING')}")
        print(f"  Delayed: {stats.get('delayed', 'MISSING')}")
        print(f"  Allowed: {stats.get('allowed', 'MISSING')}")
        
        total = stats.get('totalTransactions')
        if total is None:
            print("\n⚠️  totalTransactions is None!")
        elif total == 0:
            print("\n⚠️  totalTransactions is 0!")
        else:
            print(f"\n✓ totalTransactions looks good: {total}")
    else:
        print(f"\n✗ Error: {response.text}")
        
except Exception as e:
    print(f"\n✗ Exception: {e}")
    print("\nMake sure the server is running:")
    print("  python -m uvicorn app.main:app --reload --port 8000")
