#!/usr/bin/env python3
"""
Performance Testing Script for Dashboard Optimization

This script tests the performance improvements made to the dashboard.
It measures:
1. API response times
2. Data payload sizes
3. Time range change latency
"""

import asyncio
import time
import json
import aiohttp
from datetime import datetime

BASE_URL = "http://localhost:8000"

async def test_endpoint(session, endpoint, time_range="24h"):
    """Test a single endpoint and measure response time and payload size"""
    url = f"{BASE_URL}{endpoint}?time_range={time_range}"
    
    start = time.time()
    async with session.get(url) as response:
        data = await response.json()
        elapsed = time.time() - start
        payload_size = len(json.dumps(data))
        
        return {
            "endpoint": endpoint,
            "time_range": time_range,
            "response_time_ms": round(elapsed * 1000, 2),
            "payload_size_bytes": payload_size,
            "status": response.status
        }

async def test_parallel_requests(time_range="24h"):
    """Test all dashboard endpoints in parallel and measure total time"""
    endpoints = [
        "/dashboard-data",
        "/recent-transactions",
        "/dashboard-analytics",
        "/pattern-analytics"
    ]
    
    async with aiohttp.ClientSession() as session:
        print(f"\n{'='*70}")
        print(f"Testing Parallel Requests: {time_range}")
        print(f"{'='*70}")
        
        start = time.time()
        tasks = [test_endpoint(session, ep, time_range) for ep in endpoints]
        results = await asyncio.gather(*tasks)
        total_time = time.time() - start
        
        total_payload = 0
        for result in results:
            print(f"\n{result['endpoint']}:")
            print(f"  Response Time: {result['response_time_ms']}ms")
            print(f"  Payload Size: {result['payload_size_bytes']:,} bytes")
            print(f"  Status: {result['status']}")
            total_payload += result['payload_size_bytes']
        
        print(f"\n{'-'*70}")
        print(f"Total Time (Parallel): {round(total_time * 1000, 2)}ms")
        print(f"Total Payload: {total_payload:,} bytes ({round(total_payload/1024, 2)} KB)")
        print(f"Average Response Time: {round((total_time/len(endpoints)) * 1000, 2)}ms per endpoint")
        
        return {
            "time_range": time_range,
            "total_time_ms": round(total_time * 1000, 2),
            "total_payload_bytes": total_payload,
            "endpoint_count": len(endpoints)
        }

async def test_sequential_requests(time_range="24h"):
    """Test all dashboard endpoints sequentially and measure total time"""
    endpoints = [
        "/dashboard-data",
        "/recent-transactions", 
        "/dashboard-analytics",
        "/pattern-analytics"
    ]
    
    async with aiohttp.ClientSession() as session:
        print(f"\n{'='*70}")
        print(f"Testing Sequential Requests (Simulated): {time_range}")
        print(f"{'='*70}")
        
        results = []
        total_time = 0
        
        for endpoint in endpoints:
            result = await test_endpoint(session, endpoint, time_range)
            results.append(result)
            total_time += result['response_time_ms']
            
        print(f"\n{'-'*70}")
        print(f"Total Time (Sequential - Simulated): {round(total_time, 2)}ms")
        print(f"Expected Parallel Time: {round(max([r['response_time_ms'] for r in results]), 2)}ms")
        
        for result in results:
            print(f"\n{result['endpoint']}:")
            print(f"  Response Time: {result['response_time_ms']}ms")
        
        return {
            "time_range": time_range,
            "sequential_time_ms": round(total_time, 2),
            "parallel_time_ms": round(max([r['response_time_ms'] for r in results]), 2)
        }

async def run_all_tests():
    """Run all performance tests"""
    print("\n" + "="*70)
    print("DASHBOARD PERFORMANCE TEST SUITE")
    print("="*70)
    print(f"Timestamp: {datetime.now().isoformat()}")
    print(f"Base URL: {BASE_URL}")
    
    try:
        # Test different time ranges
        time_ranges = ["1h", "24h", "7d", "30d"]
        
        all_results = {}
        
        for time_range in time_ranges:
            parallel_result = await test_parallel_requests(time_range)
            all_results[f"parallel_{time_range}"] = parallel_result
            
            # Small delay between tests
            await asyncio.sleep(0.5)
        
        # Print summary
        print(f"\n\n{'='*70}")
        print("PERFORMANCE SUMMARY")
        print(f"{'='*70}")
        
        print(f"\n{'Time Range':<12} {'Parallel Time':<18} {'Payload Size':<18} {'Status'}")
        print("-" * 70)
        
        for time_range in time_ranges:
            result = all_results[f"parallel_{time_range}"]
            payload_kb = round(result['total_payload_bytes'] / 1024, 2)
            status = "✓ GOOD" if result['total_time_ms'] < 500 else "✗ SLOW"
            print(f"{time_range:<12} {result['total_time_ms']:.0f}ms{'':<12} {payload_kb} KB{'':<8} {status}")
        
        print("\n" + "="*70)
        print("RECOMMENDATIONS:")
        print("="*70)
        print("✓ Response times should be <500ms for first load")
        print("✓ Cached loads should be <100ms")
        print("✓ Payload size should be <1MB for 30d range")
        print("✓ Check browser DevTools for cache hit verification")
        
    except Exception as e:
        print(f"\nError during testing: {e}")
        print("Make sure the server is running: python app/main.py")

if __name__ == "__main__":
    asyncio.run(run_all_tests())
