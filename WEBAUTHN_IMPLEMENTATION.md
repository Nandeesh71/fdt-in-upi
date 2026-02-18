# WebAuthn Biometric Authentication - Production Implementation Guide

## Overview

This document describes the production-grade WebAuthn (biometric) authentication system implemented for the FDT (Fraud Detection Tool) PWA. The system provides device-level biometric unlock (fingerprint, Face ID) while maintaining JWT as the primary authentication mechanism.

## Architecture

### Key Principles

1. **JWT First**: JWT tokens are validated BEFORE biometric unlock
2. **Device Unlock Only**: Biometric is a device unlock layer, NOT a replacement for JWT
3. **One-Time Challenges**: All challenges expire after 10 minutes and are one-time use
4. **Secure Storage**: Redis stores challenges server-side; biometric data never crosses the network

### Authentication Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    APP LOAD / RESUME                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                  ┌──────────────────────┐
                  │  JWT In localStorage? │
                  └──────────────────────┘
                       │            │
                   YES │            │ NO
                       ▼            ▼
                  ┌─────────┐    ┌───────────────┐
                  │ Validate│    │ Show Login    │
                  │with /   │    │ Screen        │
                  │auth/    │    └───────────────┘
                  │validate │
                  └─────────┘
                       │
         ┌─────────────┴──────────────┐
         │ Valid?                     │
    YES  │                            │ NO/EXPIRED
         ▼                            ▼
   ┌──────────────┐            ┌──────────────┐
   │Has Biometric │            │Clear Token   │
   │Credentials?  │            │Show Login    │
   └──────────────┘            │Screen        │
         │       │              └──────────────┘
    YES │       │ NO
        ▼       ▼
   ┌─────────────┐    ┌──────────────┐
   │Show Biometric│   │Unlock        │
   │Unlock Screen│   │Dashboard     │
   └─────────────┘    │Directly      │
        │             └──────────────┘
        ▼
   ┌─────────────────────┐
   │User biometric       │
   │authentication       │
   │  Success ──► Dashboard
   │  Failed  ──► Fallback to Password
   └─────────────────────┘
```

## Backend API Endpoints

### 1. JWT Validation
**Endpoint**: `GET /auth/validate`

Validates the JWT token stored in localStorage. Called on app load.

**Request**:
```http
GET /auth/validate HTTP/1.1
Authorization: Bearer <JWT_TOKEN>
```

**Response (200 - Valid)**:
```json
{
  "status": "valid",
  "user_id": "user_abc123",
  "exp": 1708089600
}
```

**Response (401 - Invalid/Expired)**:
```json
{
  "detail": "Invalid token"
}
```

### 2. Biometric Registration - Options
**Endpoint**: `POST /auth/biometric/register/options`

Generates a registration challenge for new biometric credential.

**Request**:
```http
POST /auth/biometric/register/options HTTP/1.1
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Response (200)**:
```json
{
  "status": "success",
  "options": {
    "challenge": "Y2hhbGxlbmdlXzEyMzQ1Ng",
    "rp": {
      "id": "fdt-frontend.onrender.com",
      "name": "Fraud Detection Tool"
    },
    "user": {
      "id": "user_abc123",
      "email": "user@example.com",
      "name": "John Doe"
    },
    "pubKeyCredParams": [
      {"alg": -7, "type": "public-key"},
      {"alg": -257, "type": "public-key"}
    ],
    "timeout": 60000,
    "attestation": "direct",
    "authenticatorSelection": {
      "authenticatorAttachment": "platform",
      "residentKey": "preferred",
      "userVerification": "preferred"
    }
  }
}
```

### 3. Biometric Registration - Verify
**Endpoint**: `POST /auth/biometric/register/verify`

Verifies the attestation and stores the credential.

**Request**:
```json
{
  "credential_id": "Y3JlZF9pZA",
  "attestation_object": "aGF0dGVzdGF0aW9uX2Jz",
  "client_data_json": "Y2xpZW50X2RhdGE",
  "device_name": "iPhone 15 Pro"
}
```

**Response (200)**:
```json
{
  "status": "success",
  "message": "Biometric credential registered successfully",
  "credential_id": "Y3JlZF9pZA",
  "device_name": "iPhone 15 Pro"
}
```

### 4. Biometric Authentication - Options
**Endpoint**: `POST /auth/biometric/authenticate/options`

Generates an authentication challenge for biometric unlock.

**Request** (No JWT required - this is called before biometric unlock):
```http
POST /auth/biometric/authenticate/options HTTP/1.1
Content-Type: application/json
```

**Response (200)**:
```json
{
  "status": "success",
  "options": {
    "challenge": "Y2hhbGxlbmdlXzc4OTEw",
    "timeout": 60000,
    "userVerification": "preferred"
  }
}
```

### 5. Biometric Authentication - Verify
**Endpoint**: `POST /auth/biometric/authenticate/verify`

Verifies the assertion and confirms biometric unlock.

**Request** (No JWT required - this is called before biometric unlock):
```json
{
  "credential_id": "Y3JlZF9pZA",
  "authenticator_data": "YXV0aF9kYXRh",
  "client_data_json": "Y2xpZW50X2RhdGE",
  "signature": "c2lnbmF0dXJl"
}
```

**Response (200)**:
```json
{
  "status": "success",
  "message": "Biometric authentication verified",
  "user_id": "user_abc123"
}
```

## Frontend Implementation

### Login Flow (Password Login)

1. **User enters phone + password**
   ```javascript
   const result = await api.loginUser({
     phone: "+91XXXXXXXXXX",
     password: "password123"
   });
   ```

2. **Backend returns JWT + user data**
   ```javascript
   // api.js automatically stores in sessionStorage
   if (result.token) setAuthToken(result.token);
   if (result.user) setStoredUser(result.user);
   ```

3. **Offer biometric registration**
   ```javascript
   // Show BiometricSetup component
   // User completes biometric registration
   const result = await registerBiometric("iPhone 15");
   ```

4. **Redirect to dashboard**

### App Startup & JWT Validation

```javascript
// App.js useEffect
useEffect(() => {
  const restoreSession = async () => {
    const token = sessionStorage.getItem('fdt_token');
    
    if (token && !isTokenExpired(token)) {
      // Validate with backend
      try {
        const validation = await api.validateToken();
        
        // Token is valid - check for biometric
        const credentials = sessionStorage.getItem('fdt_credentials');
        if (credentials && JSON.parse(credentials).length > 0) {
          // Show biometric unlock screen
          setShowBiometricPrompt(true);
        } else {
          // Direct dashboard access
          setIsAuthenticated(true);
        }
      } catch (error) {
        // Token invalid/expired - show login
        sessionStorage.removeItem('fdt_token');
      }
    } else {
      // No token - show login
    }
  };
  
  restoreSession();
}, []);
```

### Biometric Unlock Flow

```javascript
// BiometricPrompt.js
const handleBiometricAuth = async () => {
  try {
    // Step 1: Get challenge
    const options = await fetch('/auth/biometric/authenticate/options');
    
    // Step 2: Request biometric from device
    const assertion = await navigator.credentials.get({publicKey: options});
    
    // Step 3: Verify with backend
    const result = await fetch('/auth/biometric/authenticate/verify', {
      method: 'POST',
      body: JSON.stringify({
        credential_id: assertion.id,
        authenticator_data: assertion.response.authenticatorData,
        client_data_json: assertion.response.clientDataJSON,
        signature: assertion.response.signature
      })
    });
    
    if (result.ok) {
      // Unlock dashboard
      setIsAuthenticated(true);
    }
  } catch (error) {
    // Show fallback to password login
  }
};
```

## Security Features

### Challenge Management
- **Storage**: Redis with automatic 10-minute expiry
- **One-Time Use**: Challenges are deleted after retrieval
- **Format**: Base64url encoding compatible with WebAuthn spec

### Credential Storage
- **Database**: PostgreSQL `user_credentials` table
- **Fields**:
  - `credential_id`: Base64url encoded credential ID
  - `public_key`: Base64url encoded public key
  - `counter`: Signature counter for replay attack prevention
  - `device_name`: User-friendly device identifier
  - `created_at`, `last_used`: Audit timestamps
  - `is_active`: Soft delete support

### Transport Security
- **HTTPS Only**: All endpoints require HTTPS in production
- **CORS Restriction**: Only `https://fdt-frontend.onrender.com` allowed
- **No Biometric Data**: Biometric data never leaves device

### Token Security
- **JWT Validation**: Backend validates HS256 signature
- **Expiry Checking**: Frontend checks token expiry + backend validation
- **Session Storage**: JWT stored in sessionStorage (cleared on tab close)

## Environment Variables

### Backend (.env)
```bash
# JWT Configuration
JWT_SECRET_KEY=your_secret_key_change_in_production
JWT_EXPIRATION_HOURS=24

# Redis for challenge storage
REDIS_URL=redis://localhost:6379/0

# WebAuthn RP ID
WEBAUTHN_RP_ID=fdt-frontend.onrender.com
WEBAUTHN_RP_NAME=Fraud Detection Tool
```

### Frontend (.env)
```bash
# Backend URLs
REACT_APP_USER_BACKEND_URL=https://fdt-admin-backend.onrender.com
REACT_APP_ADMIN_BACKEND_URL=https://fdt-admin-backend.onrender.com
```

## Database Schema

The system uses the existing `user_credentials` table:

```sql
CREATE TABLE user_credentials (
    credential_id TEXT PRIMARY KEY,
    user_id VARCHAR(100) REFERENCES users(user_id) ON DELETE CASCADE,
    public_key TEXT NOT NULL,
    counter BIGINT DEFAULT 0,
    device_id VARCHAR(100),
    credential_name VARCHAR(255),
    aaguid TEXT,
    transports TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);
```

## Error Handling

### Common Errors and Handling

**1. WebAuthn Not Supported**
```javascript
try {
  const supported = await isWebAuthnSupported();
  if (!supported) {
    // Show fallback to password login
    setShowBiometricOption(false);
  }
} catch (error) {
  console.error('WebAuthn check failed:', error);
}
```

**2. User Cancelled Biometric**
```javascript
try {
  const assertion = await navigator.credentials.get({publicKey: options});
  if (!assertion) {
    throw new Error('User cancelled');
  }
} catch (error) {
  if (error.message.includes('User cancelled')) {
    // Show password login option
  }
}
```

**3. Challenge Expired**
Backend returns 400 with message: "Invalid or expired challenge"
```javascript
// Retry by getting new challenge options
const newOptions = await fetch('/auth/biometric/authenticate/options');
```

**4. Network Error**
```javascript
if (error.includes('Failed to fetch') || error.includes('NetworkError')) {
  // Show offline message, allow retry
}
```

## Testing

### Manual Testing Checklist

- [ ] Login with password works
- [ ] Biometric registration offered after login
- [ ] Biometric registration completes successfully
- [ ] Device biometric prompt appears
- [ ] Stored device credentials appear in security settings
- [ ] App restart shows biometric unlock prompt
- [ ] Biometric unlock succeeds and shows dashboard
- [ ] Biometric unlock failure allows password fallback
- [ ] Token validation endpoint works with valid JWT
- [ ] Token validation endpoint returns 401 with invalid JWT
- [ ] Logout clears credentials and shows login screen
- [ ] Multiple devices can register different credentials

### Automated Testing

Test the endpoints with:
```bash
# Test JWT validation
curl -H "Authorization: Bearer <TOKEN>" \
  https://fdt-admin-backend.onrender.com/auth/validate

# Test registration options
curl -X POST -H "Authorization: Bearer <TOKEN>" \
  https://fdt-admin-backend.onrender.com/auth/biometric/register/options

# Test authentication options (no JWT needed)
curl -X POST \
  https://fdt-admin-backend.onrender.com/auth/biometric/authenticate/options
```

## Monitoring & Logging

### Key Metrics to Monitor

1. **Biometric Registration Rate**: Track adoption
2. **Biometric Success Rate**: Monitor for device issues
3. **Challenge Expiry Rate**: Detect timeout issues
4. **Failed Assertions**: Indicator of potential attacks or device issues
5. **Sign Count Anomalies**: Potential cloning attacks

### Log Events

```
[timestamp] ✓ Biometric credential registered: {credential_id}
[timestamp] ✓ Biometric authentication verified: {user_id}
[timestamp] ⚠ Challenge verification failed: {reason}
[timestamp] ⚠ Invalid credential: {credential_id}
[timestamp] ⚠ Signature count mismatch: potential attack
```

## Troubleshooting

### WebAuthn Not Working on Production URL

**Issue**: WebAuthn works locally but fails on production domain

**Cause**: Mix of HTTP/HTTPS or invalid domain

**Solution**:
1. Ensure HTTPS only
2. Check CORS is properly configured
3. Verify RP ID matches domain exactly

### Biometric Device Not Responding

**Issue**: User completes biometric registration but device doesn't prompt on unlock

**Cause**: Device doesn't support resident keys or biometric

**Solution**:
1. Check device supports WebAuthn (modern iOS/Android)
2. User may need to enable biometric auth in device settings
3. Provide password fallback option

### Challenge Expired Errors

**Issue**: "Invalid or expired challenge" error

**Cause**: Challenge expired after 10 minutes or Redis connection issue

**Solution**:
1. Check Redis connectivity
2. Increase challenge TTL if needed (user.py webauthn_auth.py)
3. Implement automatic retry with new challenge

## Future Enhancements

1. **Passwordless Login**: Allow WebAuthn as primary login method
2. **Multi-Device Registration**: Different biometric per device
3. **Biometric Fallback Chain**: Multiple biometric methods
4. **Cross-Device Authentication**: Smartphone unlock other devices
5. **Conditional UI**: Autofill with biometric verification

## References

- [WebAuthn Specification](https://www.w3.org/TR/webauthn-2/)
- [python-webauthn Documentation](https://github.com/duo-labs/py_webauthn)
- [MDN WebAuthn Guide](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API)
- [OWASP WebAuthn Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Web_Authentication_Cheat_Sheet.html)

---

**Last Updated**: February 18, 2026
**Version**: 1.0 - Production Ready
**Status**: ✅ Implemented and Tested
