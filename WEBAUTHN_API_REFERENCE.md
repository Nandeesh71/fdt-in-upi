# WebAuthn API Quick Reference

## Endpoint Summary

### 1. JWT Validation
```
GET /auth/validate
Authorization: Bearer <JWT>

Response (200):
{
  "status": "valid",
  "user_id": "user_123",
  "exp": 1708089600
}
```

### 2. Biometric Registration - Get Options
```
POST /auth/biometric/register/options
Authorization: Bearer <JWT>

Response (200):
{
  "status": "success",
  "options": {
    "challenge": "Y2hhbGxlbmdl...",
    "rp": {"id": "fdt-frontend.onrender.com", "name": "..."},
    "user": {"id": "dXNlcl8xMjM=", "email": "...", "name": "..."},
    "pubKeyCredParams": [...],
    "timeout": 60000,
    "attestation": "direct",
    "authenticatorSelection": {...}
  }
}
```

### 3. Biometric Registration - Verify
```
POST /auth/biometric/register/verify
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "credential_id": "Y3JlZF9pZA==",
  "attestation_object": "aGF0dGVzdGF0aW9u...",
  "client_data_json": "Y2xpZW50X2RhdGE=",
  "device_name": "iPhone 15 Pro"
}

Response (200):
{
  "status": "success",
  "message": "Biometric credential registered successfully",
  "credential_id": "Y3JlZF9pZA==",
  "device_name": "iPhone 15 Pro"
}
```

### 4. Biometric Authentication - Get Options
```
POST /auth/biometric/authenticate/options

Response (200):
{
  "status": "success",
  "options": {
    "challenge": "Y2hhbGxlbmdl...",
    "timeout": 60000,
    "userVerification": "preferred"
  }
}
```

### 5. Biometric Authentication - Verify
```
POST /auth/biometric/authenticate/verify
Content-Type: application/json

{
  "credential_id": "Y3JlZF9pZA==",
  "authenticator_data": "YXV0aF9kYXRh...",
  "client_data_json": "Y2xpZW50X2RhdGE=",
  "signature": "c2lnbmF0dXJl..."
}

Response (200):
{
  "status": "success",
  "message": "Biometric authentication verified",
  "user_id": "user_123"
}
```

---

## Frontend Usage Quick Start

### Login Flow
```javascript
import { loginUser, validateToken } from './api';
import { registerBiometric } from './utils/webauthn';

// 1. User logs in with password
const loginResult = await loginUser({
  phone: "+91XXXXXXXXXX",
  password: "password123"
});
// Token automatically stored in sessionStorage

// 2. Offer biometric registration
const registerResult = await registerBiometric("iPhone 15");
// User completes biometric registration on device
```

### App Startup
```javascript
// Check for valid JWT
const token = sessionStorage.getItem('fdt_token');
if (token) {
  try {
    const validation = await validateToken();
    // Token is valid
    
    // Check for biometric credentials
    const creds = sessionStorage.getItem('fdt_credentials');
    if (creds && JSON.parse(creds).length > 0) {
      // Show biometric unlock
      setShowBiometricPrompt(true);
    } else {
      // Direct dashboard access
      setIsAuthenticated(true);
    }
  } catch (error) {
    // Token invalid - show login
    sessionStorage.removeItem('fdt_token');
  }
}
```

### Biometric Unlock
```javascript
import { authenticateWithBiometric } from './utils/webauthn';

const handleUnlock = async () => {
  try {
    const result = await authenticateWithBiometric();
    // result.user_id returned
    // Unlock dashboard
    setIsAuthenticated(true);
  } catch (error) {
    // Show password fallback
    console.error('Biometric failed:', error.message);
  }
};
```

---

## Base64url Encoding (Frontend)

### ArrayBuffer to Base64url
```javascript
function arrayBufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
```

### Base64url to ArrayBuffer
```javascript
function base64urlToArrayBuffer(base64url) {
  const base64 = base64url
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  
  const paddingNeeded = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(paddingNeeded);
  
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
```

---

## Error Responses

### 400 - Bad Request
```json
{
  "detail": "Missing or invalid attestation_object"
}
```

### 401 - Unauthorized
```json
{
  "detail": "Invalid or expired challenge"
}
```

### 404 - Not Found
```json
{
  "detail": "User not found"
}
```

### 500 - Server Error
```json
{
  "detail": "Internal server error"
}
```

---

## Environment Variables

### Backend
```bash
WEBAUTHN_RP_ID=fdt-frontend.onrender.com
WEBAUTHN_RP_NAME=Fraud Detection Tool
REDIS_URL=redis://localhost:6379/0
JWT_SECRET_KEY=your_secret_key
JWT_EXPIRATION_HOURS=24
```

### Frontend
```bash
REACT_APP_USER_BACKEND_URL=https://fdt-admin-backend.onrender.com
```

---

## Curl Testing Examples

### Test JWT Validation
```bash
curl -H "Authorization: Bearer <TOKEN>" \
  https://fdt-admin-backend.onrender.com/auth/validate
```

### Test Registration Options
```bash
curl -X POST \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  https://fdt-admin-backend.onrender.com/auth/biometric/register/options
```

### Test Auth Options
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  https://fdt-admin-backend.onrender.com/auth/biometric/authenticate/options
```

---

## Database Queries

### Get all credentials for user
```sql
SELECT * FROM user_credentials 
WHERE user_id = 'user_123' AND is_active = TRUE;
```

### Check credential counter (for signature validation)
```sql
SELECT credential_id, counter, last_used 
FROM user_credentials 
WHERE credential_id = 'xxx';
```

### Active credentials by device
```sql
SELECT user_id, credential_name, counter, last_used 
FROM user_credentials 
WHERE is_active = TRUE 
ORDER BY last_used DESC;
```

---

## Redis Keys

### Challenge Storage Format
```
Key: webauthn_challenge:user_id:registration
Key: webauthn_challenge:user_id:authentication

Value: {
  "challenge": "base64url_encoded_challenge",
  "type": "registration|authentication",
  "timestamp": "2026-02-18T12:00:00"
}

TTL: 600 seconds (10 minutes)
```

### Check challenges in Redis
```bash
redis-cli
> KEYS "webauthn_challenge:*"
> GET "webauthn_challenge:user_123:registration"
> DEL "webauthn_challenge:user_123:registration"  # Cleanup
```

---

## Security Headers

All endpoints should include:
```
Content-Type: application/json
Authorization: Bearer <JWT_FOR_PROTECTED_ENDPOINTS>
Origin: https://fdt-frontend.onrender.com
```

CORS Response Headers (from server):
```
Access-Control-Allow-Origin: https://fdt-frontend.onrender.com
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type
```

---

## Status Codes Summary

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Continue |
| 400 | Bad request | Check payload |
| 401 | Unauthorized/Invalid | Get new challenge or login |
| 404 | Not found | Verify credential_id |
| 429 | Rate limited | Wait and retry |
| 500 | Server error | Check logs |

---

## Typical Request Flow Timing

```
1. GET /auth/validate              ← 100-200ms
2. POST /auth/biometric/auth/options ← 100-200ms
3. [User biometric prompt]          ← 2-5 seconds (device timeout)
4. POST /auth/biometric/auth/verify ← 100-200ms
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total: 2.3-5.6 seconds
```

---

## Debug Logging

Enable detailed logging in frontend:
```javascript
// In api.js or utils/webauthn.js
const DEBUG = true;

if (DEBUG) {
  console.log('WebAuthn Challenge:', challenge);
  console.log('Credential ID:', credential.id);
  console.log('Attestation Object:', credential.response.attestationObject);
  console.log('Client Data JSON:', credential.response.clientDataJSON);
}
```

Enable logging in backend:
```python
# In webauthn_auth.py
import logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Add debug logs
logger.debug(f"Challenge stored for {user_id}: {challenge[:20]}...")
logger.debug(f"Verification result: {success}")
```

---

Quick Reference v1.0 | February 18, 2026 | Production Ready
