"""Test script to verify real-time pattern aggregation."""
import requests
import time

BASE_URL = "http://localhost:8000"

def test_pattern_aggregation():
    print("="*80)
    print("TESTING REAL-TIME PATTERN AGGREGATION")
    print("="*80)
    
    # Test different time ranges
    time_ranges = ["1h", "24h", "7d"]
    
    for time_range in time_ranges:
        print(f"\n📊 Fetching pattern analytics for: {time_range}")
        try:
            response = requests.get(f"{BASE_URL}/pattern-analytics?time_range={time_range}", timeout=5)
            
            if response.status_code == 200:
                data = response.json()
                
                print(f"   ✓ Response received")
                print(f"   Transactions analyzed: {data.get('transactions_analyzed', 0)}")
                print(f"\n   Pattern Counts:")
                print(f"     • Amount Anomaly:        {data.get('amount_anomaly', 0)}")
                print(f"     • Behavioural Anomaly:   {data.get('behavioural_anomaly', 0)}")
                print(f"     • Device Anomaly:        {data.get('device_anomaly', 0)}")
                print(f"     • Velocity Anomaly:      {data.get('velocity_anomaly', 0)}")
                print(f"     • Model Consensus:       {data.get('model_consensus', 0)}")
                print(f"     • Model Disagreement:    {data.get('model_disagreement', 0)}")
                
                # Validate data
                total_patterns = sum([
                    data.get('amount_anomaly', 0),
                    data.get('behavioural_anomaly', 0),
                    data.get('device_anomaly', 0),
                    data.get('velocity_anomaly', 0),
                    data.get('model_consensus', 0),
                    data.get('model_disagreement', 0)
                ])
                
                if total_patterns > 0:
                    print(f"\n   ✓ REAL DATA: {total_patterns} total pattern detections")
                else:
                    print(f"\n   ⚠️  No patterns detected (may need more transactions)")
                    
            else:
                print(f"   ✗ Error: HTTP {response.status_code}")
                print(f"   {response.text}")
                
        except Exception as e:
            print(f"   ✗ Exception: {e}")
    
    # Test with limit parameter
    print(f"\n📊 Fetching pattern analytics with limit=100")
    try:
        response = requests.get(f"{BASE_URL}/pattern-analytics?limit=100", timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            print(f"   ✓ Analyzed {data.get('transactions_analyzed', 0)} transactions")
        else:
            print(f"   ✗ Error: HTTP {response.status_code}")
    except Exception as e:
        print(f"   ✗ Exception: {e}")
    
    print("\n" + "="*80)
    print("TEST COMPLETE")
    print("="*80)
    print("\nNext steps:")
    print("1. Run simulator: python simulator/generator.py")
    print("2. Open dashboard: http://localhost:8000/")
    print("3. Check fraud pattern analysis chart updates in real-time")
    print("="*80)

if __name__ == "__main__":
    print("\nMake sure the server is running:")
    print("  python -m uvicorn app.main:app --reload --port 8000\n")
    time.sleep(1)
    test_pattern_aggregation()
