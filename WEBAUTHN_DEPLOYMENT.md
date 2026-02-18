# WebAuthn Implementation - Quick Start & Deployment Guide

## What Was Implemented

A production-grade biometric authentication system with the following components:

### Backend (FastAPI)
- **New Module**: `backend/webauthn_auth.py` - All WebAuthn logic
- **New Endpoints**: 
  - `GET /auth/validate` - JWT validation
  - `POST /auth/biometric/register/options` - Registration challenge
  - `POST /auth/biometric/register/verify` - Registration verification
  - `POST /auth/biometric/authenticate/options` - Authentication challenge
  - `POST /auth/biometric/authenticate/verify` - Authentication verification

### Frontend (React)
- **Updated**: `frontend/src/utils/webauthn.js` - WebAuthn client operations  
- **Updated**: `frontend/src/api.js` - Added `validateToken()` and `logoutUser()`
- **Updated**: `frontend/src/components/BiometricPrompt.js` - Simplified for new endpoints

### Documentation
- **New File**: `WEBAUTHN_IMPLEMENTATION.md` - Complete technical documentation

## Pre-Deployment Checklist

### Backend Requirements
- [ ] Python 3.9+
- [ ] FastAPI 0.115+
- [ ] `python-webauthn==2.2.0` (already in requirements.txt)
- [ ] Redis running (for challenge storage)
- [ ] PostgreSQL with `user_credentials` table

### Verify Backend Dependencies
```bash
cd backend
pip install -r requirements.txt
# Verify python-webauthn is installed
python -c "import webauthn; print(webauthn.__version__)"
```

### Frontend Requirements
- [ ] React 17+
- [ ] axios
- [ ] react-router-dom
- [ ] Supported browser (Chrome, Firefox, Safari, Edge - recent versions)

### Environment Variables

**Backend - Add to .env**:
```bash
# Must be the exact frontend domain
WEBAUTHN_RP_ID=fdt-frontend.onrender.com

# Or use default Fraud Detection Tool
WEBAUTHN_RP_NAME=Fraud Detection Tool

# Ensure Redis is configured
REDIS_URL=redis://localhost:6379/0

# JWT configuration (change in production)
JWT_SECRET_KEY=your_super_secret_key_change_this
JWT_EXPIRATION_HOURS=24
```

**Frontend - Add to .env**:
```bash
REACT_APP_USER_BACKEND_URL=https://fdt-admin-backend.onrender.com
REACT_APP_ADMIN_BACKEND_URL=https://fdt-admin-backend.onrender.com
```

## Deployment Steps

### 1. Backend Deployment (Render/Railway/Vercel)

**Step 1**: Update `backend/server.py` imports
```python
# Already added - imports webauthn_auth module
try:
    from backend.webauthn_auth import (...)
except ImportError:
    from webauthn_auth import (...)
```

**Step 2**: Ensure Redis is running
```bash
# If using Render Redis Add-on, update REDIS_URL env var
REDIS_URL=redis://<your-redis-url>
```

**Step 3**: Deploy to Render
```bash
git add backend/webauthn_auth.py backend/server.py
git commit -m "Add WebAuthn biometric authentication"
git push
```

The endpoint `https://fdt-admin-backend.onrender.com/auth/validate` should now be accessible.

### 2. Frontend Deployment (Render/Vercel)

**Step 1**: Update frontend variables
```bash
# .env or build environment
REACT_APP_USER_BACKEND_URL=https://fdt-admin-backend.onrender.com
```

**Step 2**: Verify BiometricPrompt component is updated
```javascript
// Should NOT require phone number anymore
const result = await authenticateWithBiometric();
```

**Step 3**: Deploy
```bash
git add frontend/src/
git commit -m "Add production WebAuthn endpoints"
git push
```

### 3. Database Verification

Verify the `user_credentials` table exists:
```sql
-- Connect to your PostgreSQL database
\d user_credentials

-- Should show:
-- credential_id (TEXT PRIMARY KEY)
-- user_id (VARCHAR)
-- public_key (TEXT)
-- counter (BIGINT)
-- device_name (VARCHAR)
-- created_at, last_used, is_active (TIMESTAMP/BOOLEAN)
```

If table doesn't exist, create it:
```sql
CREATE TABLE IF NOT EXISTS user_credentials (
    credential_id TEXT PRIMARY KEY,
    user_id VARCHAR(100) REFERENCES users(user_id) ON DELETE CASCADE,
    public_key TEXT NOT NULL,
    counter BIGINT DEFAULT 0,
    device_name VARCHAR(255),
    aaguid TEXT,
    transports TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);
```

## Testing After Deployment

### 1. Test Backend Endpoints

**Test JWT Validation**:
```bash
# Get a valid JWT by logging in
curl -X GET https://fdt-admin-backend.onrender.com/auth/validate \
  -H "Authorization: Bearer <your-jwt-token>"

# Expected response:
# {"status": "valid", "user_id": "...", "exp": ...}
```

**Test Registration Options**:
```bash
curl -X POST https://fdt-admin-backend.onrender.com/auth/biometric/register/options \
  -H "Authorization: Bearer <your-jwt-token>" \
  -H "Content-Type: application/json"

# Expected response:
# {"status": "success", "options": {...}}
```

**Test Authentication Options**:
```bash
curl -X POST https://fdt-admin-backend.onrender.com/auth/biometric/authenticate/options \
  -H "Content-Type: application/json"

# Expected response:
# {"status": "success", "options": {"challenge": "...", ...}}
```

### 2. Test Frontend Flow

**Manual Testing**:
1. Open app in modern browser (mobile):
   - https://fdt-frontend.onrender.com
2. Log in with phone + password
3. Click "Enable Fingerprint" or similar option
4. Complete biometric registration (touch sensor/Face ID)
5. See success message
6. Close browser/tab
7. Reopen app
8. See biometric unlock prompt
9. Authenticate with biometric
10. Verify dashboard loads

**Mobile Testing**:
- iOS 14+: Use Face ID or Touch ID
- Android 7+: Use Fingerprint or Face Unlock
- Ensure browser supports WebAuthn (Chrome, Safari, Firefox)

### 3. Error Scenarios

Test these intentionally to verify error handling:

1. **Invalid JWT**:
   - Manually delete JWT from storage
   - Refresh page
   - Should show login screen

2. **Expired Challenge**:
   - Get authentication options
   - Wait 11+ minutes
   - Try to send assertion
   - Should get 400 "Invalid or expired challenge"

3. **Network Error**:
   - Disable internet
   - Try biometric registration
   - Should show "Cannot connect to server"

4. **WebAuthn Not Supported**:
   - Test in older browser (IE11, etc.)
   - Should skip biometric, use password only

## Rollback Plan

If issues occur:

### 1. Disable WebAuthn in Frontend
Edit `frontend/src/components/App.js`:
```javascript
// Comment out biometric prompt
setShowBiometricPrompt(false);
// Always go straight to dashboard after login
setIsAuthenticated(true);
```

### 2. Disable New Endpoints in Backend
Comment out in `backend/server.py`:
```python
# Comment these imports and endpoint definitions
# from webauthn_auth import (...)
```

### 3. Redeploy Both
```bash
git push  # Will trigger re-deployment
```

## Performance Considerations

### Challenge Storage (Redis)

Default: 10 minutes (600 seconds)

If experiencing timeout issues:
```python
# In backend/webauthn_auth.py
CHALLENGE_EXPIRY_SECONDS = 900  # Increase to 15 minutes
```

### Database Indexes

Add indexes for faster credential lookups:
```sql
CREATE INDEX idx_user_credentials_user_id 
ON user_credentials(user_id);

CREATE INDEX idx_user_credentials_credential_id 
ON user_credentials(credential_id);
```

## Security Checklist

- [ ] HTTPS enabled on both frontend and backend
- [ ] CORS configured for production domain only
- [ ] JWT_SECRET_KEY changed from default
- [ ] Redis password set (if using)
- [ ] Database credentials secure
- [ ] No biometric data logged or stored on server
- [ ] Challenge TTL set appropriately
- [ ] Rate limiting enabled on endpoints
- [ ] Challenge key names don't leak in production logs

## Monitoring Commands

Check Redis challenges:
```bash
redis-cli
> KEYS "webauthn_challenge:*"
> GET "webauthn_challenge:user_123:registration"
```

Check database credentials:
```sql
SELECT user_id, credential_name, created_at, last_used 
FROM user_credentials 
WHERE is_active = TRUE 
ORDER BY last_used DESC;
```

Check authentication in logs:
```bash
# Backend logs should show
# "✓ Biometric credential registered successfully"
# "✓ Biometric authentication verified"
```

## FAQ

**Q: Can users use password login even with biometric set up?**
A: Yes! BiometricPrompt shows "Use Password Instead" button.

**Q: What if user loses their device?**
A: Credential becomes inactive when user logs in from new device. Old credential can be revoked in security settings.

**Q: Does biometric replace password login?**
A: No. Biometric is optional device unlock layer. Password login always available.

**Q: What if WebAuthn not supported?**
A: App detects support and skips biometric option. User can still login with password.

## Support

For issues, check:
1. `WEBAUTHN_IMPLEMENTATION.md` - Full technical details
2. Browser console logs (Ctrl+Shift+I)
3. Backend logs (check deployment logs)
4. Verify Redis is running: `redis-cli ping` → "PONG"
5. Verify database schema: Check `user_credentials` table exists

---

**Deployment Date**: February 18, 2026
**Status**: ✅ Ready for Production
