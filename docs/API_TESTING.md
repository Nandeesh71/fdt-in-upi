# FDT API Testing Guide

## Base URL
- Local: `http://localhost:8001/api`
- Production: `https://your-backend-url.com/api`

## Authentication

### 1. User Registration
```bash
curl -X POST http://localhost:8001/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "phone": "+919999999999",
    "password": "testpass123",
    "email": "test@example.com"
  }'
```

**Expected Response:**
```json
{
  "status": "success",
  "message": "User registered successfully",
  "user": {
    "user_id": "user_xxxxx",
    "name": "Test User",
    "phone": "+919999999999",
    "email": "test@example.com",
    "balance": 10000.0
  },
  "token": "eyJhbGc..."
}
```

### 2. User Login
```bash
curl -X POST http://localhost:8001/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+919876543210",
    "password": "password123"
  }'
```

## Transaction APIs (Require Authentication)

Export your token:
```bash
export TOKEN="your_jwt_token_here"
```

### 3. Get Dashboard
```bash
curl -X GET http://localhost:8001/api/user/dashboard \
  -H "Authorization: Bearer $TOKEN"
```

### 4. Create Transaction (Low Risk - Auto Approved)
```bash
curl -X POST http://localhost:8001/api/transaction \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "recipient_vpa": "merchant@upi",
    "amount": 500,
    "remarks": "Low risk payment"
  }'
```

**Expected:** `"action": "ALLOW"`, `"requires_confirmation": false`

### 5. Create Transaction (Medium Risk - Requires Confirmation)
```bash
curl -X POST http://localhost:8001/api/transaction \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "recipient_vpa": "newmerchant@upi",
    "amount": 8000,
    "remarks": "Medium risk payment"
  }'
```

**Expected:** `"action": "DELAY"`, `"requires_confirmation": true`

### 6. Create Transaction (High Risk - Blocked)
```bash
curl -X POST http://localhost:8001/api/transaction \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "recipient_vpa": "suspicious@upi",
    "amount": 20000,
    "remarks": "High risk payment"
  }'
```

**Expected:** `"action": "BLOCK"`, `"requires_confirmation": true`, `"risk_level": "high"`

### 7. User Decision on Flagged Transaction
```bash
# Get transaction ID from previous response
TX_ID="tx_xxxxxxxxxx"

# Confirm transaction
curl -X POST http://localhost:8001/api/user-decision \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "tx_id": "'$TX_ID'",
    "decision": "confirm"
  }'

# Or cancel transaction
curl -X POST http://localhost:8001/api/user-decision \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "tx_id": "'$TX_ID'",
    "decision": "cancel"
  }'
```

### 8. Get Transaction History
```bash
# All transactions
curl -X GET "http://localhost:8001/api/user/transactions?limit=20" \
  -H "Authorization: Bearer $TOKEN"

# Filter by status
curl -X GET "http://localhost:8001/api/user/transactions?status_filter=ALLOW" \
  -H "Authorization: Bearer $TOKEN"

curl -X GET "http://localhost:8001/api/user/transactions?status_filter=BLOCK" \
  -H "Authorization: Bearer $TOKEN"
```

### 9. Register Push Notification Token
```bash
curl -X POST http://localhost:8001/api/push-token \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "fcm_token": "firebase_token_here",
    "device_id": "web_device_001"
  }'
```

## Health Check
```bash
curl http://localhost:8001/api/health
```

## Demo Users

| Phone | Password | Balance |
|-------|----------|---------|
| +919876543210 | password123 | ₹25,000 |
| +919876543211 | password123 | ₹15,000 |
| +919876543212 | password123 | ₹30,000 |

## Risk Score Interpretation

- **0.0 - 0.3**: Low Risk → Auto-approved
- **0.3 - 0.6**: Medium Risk → Requires user confirmation
- **0.6 - 1.0**: High Risk → Blocked (requires explicit confirmation)

## Testing Fraud Detection Scenarios

### Scenario 1: Normal Transaction
- Amount: ₹100 - ₹2,000
- Expected: Low risk, auto-approved

### Scenario 2: High Amount
- Amount: ₹5,000 - ₹10,000
- Expected: Medium risk, requires confirmation

### Scenario 3: Very High Amount
- Amount: > ₹10,000
- Expected: High risk, blocked

### Scenario 4: Rapid Transactions
- Create multiple transactions within seconds
- Expected: Increasing risk scores

### Scenario 5: New Recipient
- Use a never-seen-before VPA
- Expected: Slightly elevated risk

## Error Responses

### 401 Unauthorized
```json
{
  "detail": "Missing or invalid authorization header"
}
```

### 400 Bad Request
```json
{
  "detail": "Insufficient balance"
}
```

### 404 Not Found
```json
{
  "detail": "Transaction not found"
}
```
