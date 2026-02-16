#!/bin/bash
# FDT Backend Server Fix Script
# This script helps restart the Docker container on the server and verify endpoints

echo "=== FDT Backend Server Fix ==="
echo "This script will restart the FDT backend Docker container on the server"
echo "and verify that transaction-limit endpoints are working."
echo ""

# Check if we're on the server or local machine
if [[ "$HOSTNAME" == *"server"* ]] || [[ "$(hostname)" == *"192.168.2.1"* ]]; then
    echo "📍 Running on server machine"
    
    # Step 1: Check running containers
    echo "🔍 Step 1: Finding FDT backend container..."
    docker ps | grep -E "(fdt|backend|fastapi)" || {
        echo "❌ No FDT backend container found. Checking all containers..."
        docker ps
        exit 1
    }
    
    # Step 2: Get container ID
    CONTAINER_ID=$(docker ps | grep -E "(fdt|backend|fastapi)" | awk '{print $1}' | head -1)
    echo "🎯 Found container ID: $CONTAINER_ID"
    
    # Step 3: Restart container
    echo "🔄 Step 2: Restarting container..."
    docker restart $CONTAINER_ID
    
    # Step 4: Wait for container to be ready
    echo "⏳ Step 3: Waiting for container to be ready..."
    sleep 10
    
    # Step 5: Test endpoints
    echo "✅ Step 4: Testing transaction-limit endpoint..."
    curl -s http://localhost:8001/api/user/transaction-limit || {
        echo "❌ Endpoint not responding. Checking container logs..."
        docker logs $CONTAINER_ID --tail 20
        exit 1
    }
    
    echo "✅ Backend server restarted successfully!"
    
else
    echo "📍 Running on local machine. Connecting to server..."
    
    # Step 1: SSH to server and restart
    echo "🔄 Step 1: Restarting backend container on server..."
    ssh 192.168.2.1 'cd /path/to/FDT && ./restart_backend.sh' || {
        echo "❌ SSH failed. Please run the following manually on 192.168.2.1:"
        echo "   docker restart \$(docker ps | grep -E \"fdt|backend|fastapi\" | awk '{print \$1}' | head -1)"
        exit 1
    }
    
    # Step 2: Test from local machine
    echo "🔍 Step 2: Testing transaction-limit endpoint from local..."
    sleep 5
    
    # Test without auth first (should return auth error, not 404)
    echo "Testing without authentication (should return auth error)..."
    response=$(curl -s -w "%{http_code}" http://192.168.2.1:8001/api/user/transaction-limit)
    http_code="${response: -3}"
    body="${response%???}"
    
    if [[ "$http_code" == "401" ]]; then
        echo "✅ Endpoint is responding! (401 Unauthorized - expected)"
    elif [[ "$http_code" == "404" ]]; then
        echo "❌ Endpoint not found (404). Server restart didn't work."
        echo "Response: $body"
        exit 1
    else
        echo "⚠️  Unexpected response code: $http_code"
        echo "Response: $body"
    fi
    
    # Step 3: Test with a dummy token
    echo "🔍 Step 3: Testing with dummy authentication..."
    response=$(curl -s -w "%{http_code}" http://192.168.2.1:8001/api/user/transaction-limit \
        -H "Authorization: Bearer test_token")
    http_code="${response: -3}"
    body="${response%???}"
    
    if [[ "$http_code" == "401" ]]; then
        echo "✅ Auth system is working correctly!"
    elif [[ "$http_code" == "404" ]]; then
        echo "❌ Still getting 404. Server needs manual restart."
        echo "Please SSH into 192.168.2.1 and restart manually:"
        echo "   docker ps | grep backend"
        echo "   docker restart <container_id>"
        exit 1
    else
        echo "📊 Response: HTTP $http_code"
        echo "Body: $body"
    fi
fi

echo ""
echo "🎉 Backend server fix complete!"
echo "🧪 Next: Test transaction-limit feature in frontend:"
echo "   1. Open http://localhost:3000"
echo "   2. Log in with: phone=9876543210, password=password123"
echo "   3. Go to Security Settings"
echo "   4. Change daily limit and verify it saves"