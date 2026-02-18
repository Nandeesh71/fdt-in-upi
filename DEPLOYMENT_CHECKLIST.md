# Production Deployment Checklist

## Pre-Deployment Verification (48 hours before launch)

### ✅ Code Review & Testing

#### Backend Code
- [ ] `backend/webauthn_auth.py` exists and syntax is valid
- [ ] All 6 functions are properly documented
- [ ] Base64url encoding/decoding is correct
- [ ] Error handling covers all edge cases
- [ ] Python imports are complete (webauthn library)
- [ ] No hardcoded secrets or test credentials

#### Backend Server Changes
- [ ] `backend/server.py` imports webauthn_auth module
- [ ] All 5 new endpoints are properly decorated (@app.post, @app.get)
- [ ] JWT validation endpoint properly checks token expiry
- [ ] CORS configuration restricts to production domain only
- [ ] All Pydantic models are correctly defined
- [ ] No breaking changes to existing endpoints
- [ ] Rate limiting enabled on auth endpoints

#### Frontend Code
- [ ] `frontend/src/utils/webauthn.js` updated with new endpoints
- [ ] `frontend/src/api.js` has validateToken() and logoutUser()
- [ ] `frontend/src/components/BiometricPrompt.js` simplified (no phone input)
- [ ] Base64url conversion functions are correct
- [ ] No console.errors in development build

#### Frontend Components
- [ ] BiometricSetup component compatible with new registerBiometric()
- [ ] BiometricPrompt uses new authenticateWithBiometric()
- [ ] App.js has proper JWT validation flow
- [ ] Session storage is used correctly (not localStorage for tokens)
- [ ] Error messages are user-friendly and helpful

### ✅ Database Verification

```sql
-- Run in PostgreSQL
-- Should succeed without errors
\d user_credentials
```

- [ ] `user_credentials` table exists
- [ ] All columns present (credential_id, public_key, counter, etc.)
- [ ] Primary key is credential_id
- [ ] Foreign key to users table
- [ ] Indexes on user_id and credential_id
- [ ] Created_at and last_used columns are TIMESTAMP type
- [ ] is_active column is BOOLEAN type

### ✅ Redis Configuration

- [ ] Redis server is running in production
- [ ] Redis URL is configured in backend environment
- [ ] Test Redis connection: `redis-cli ping` returns "PONG"
- [ ] No sensitive data in Redis credentials
- [ ] Redis has enough memory (check: `INFO memory`)
- [ ] Redis persistence is configured properly

### ✅ Environment Variables

#### Backend `.env` or deployment config
```bash
[ ] WEBAUTHN_RP_ID=fdt-frontend.onrender.com
[ ] WEBAUTHN_RP_NAME=Fraud Detection Tool
[ ] REDIS_URL=<redirect to real Redis>
[ ] JWT_SECRET_KEY=<strong random key, NOT "fdt_jwt_secret_key_change_in_production">
[ ] JWT_EXPIRATION_HOURS=24
[ ] DB_URL=<PostgreSQL connection>
```

#### Frontend `.env` or deployment config
```bash
[ ] REACT_APP_USER_BACKEND_URL=https://fdt-admin-backend.onrender.com
[ ] REACT_APP_ADMIN_BACKEND_URL=https://fdt-admin-backend.onrender.com
[ ] NODE_ENV=production
```

### ✅ Security Review

- [ ] JWT_SECRET_KEY is NOT the default value
- [ ] All endpoints use HTTPS (not HTTP)
- [ ] CORS origins restricted to production domain
- [ ] No biometric data is logged
- [ ] No challenges logged in plain text
- [ ] No credentials logged in plain text
- [ ] Attack mitigation: counter increment checked
- [ ] Attack mitigation: challenge TTL enforced
- [ ] Attack mitigation: one-time challenge use

### ✅ API Endpoint Verification

Test with curl from production environment:

```bash
# Test 1: Health check
[ ] curl https://fdt-admin-backend.onrender.com/health

# Test 2: JWT Validation (need valid token)
[ ] curl -H "Authorization: Bearer <TOKEN>" \
     https://fdt-admin-backend.onrender.com/auth/validate

# Test 3: Register Options (need valid token)
[ ] curl -X POST \
     -H "Authorization: Bearer <TOKEN>" \
     https://fdt-admin-backend.onrender.com/auth/biometric/register/options

# Test 4: Auth Options (public endpoint)
[ ] curl -X POST \
     https://fdt-admin-backend.onrender.com/auth/biometric/authenticate/options

# Test 5: CORS preflight
[ ] curl -i -X OPTIONS \
     -H "Origin: https://fdt-frontend.onrender.com" \
     https://fdt-admin-backend.onrender.com/auth/validate
     [ ] Should return 200 with CORS headers
```

### ✅ Frontend Build Verification

```bash
# Build frontend
npm run build

[ ] Build completes without errors
[ ] Build completes without warnings
[ ] Build output is in ./build directory
[ ] webauthn.js compiled correctly
[ ] api.js compiled correctly
[ ] BiometricPrompt component compiled correctly
```

### ✅ Manual End-to-End Testing

#### Prerequisite
- [ ] Browser supports WebAuthn (Chrome, Safari, Edge, Firefox)
- [ ] Device has biometric capability (fingerprint, Face ID)
- [ ] Internet connection is stable

#### Test Flow
1. **Fresh User Scenario**
   - [ ] Open app (no prior session)
   - [ ] See login screen
   - [ ] Enter phone + password
   - [ ] Login succeeds
   - [ ] See biometric offer
   - [ ] Click "Enable Biometric"
   - [ ] Device prompts for biometric
   - [ ] Complete biometric (fingerprint/Face ID)
   - [ ] See success message
   - [ ] Dashboard opens

2. **Returning User Scenario**
   - [ ] Close app entirely (or clear browser cache)
   - [ ] Reopen app
   - [ ] See biometric unlock prompt
   - [ ] Complete biometric
   - [ ] Dashboard opens without password

3. **Token Expiry Scenario**
   - [ ] Manually set JWT_EXPIRATION_HOURS to 1 (in test)
   - [ ] Login to app
   - [ ] Wait 1+ hour (or manually edit JWT)
   - [ ] Close/reopen app
   - [ ] Token validation fails
   - [ ] See login screen
   - [ ] Can login again normally

4. **Biometric Failure Scenario**
   - [ ] Open app with valid JWT
   - [ ] See biometric prompt
   - [ ] Cancel biometric (don't complete)
   - [ ] See "Use Password Instead" button
   - [ ] Click button
   - [ ] See password login form
   - [ ] Can login with password

5. **Multiple Devices**
   - [ ] Device A: Register biometric
   - [ ] Device B: Register different biometric (same user)
   - [ ] Device A: Verify both credentials in security settings
   - [ ] Device B: Verify same
   - [ ] Each device can unlock independently

### ✅ Performance Testing

- [ ] JWT validation: < 500ms
- [ ] Register options endpoint: < 500ms
- [ ] Auth options endpoint: < 500ms
- [ ] Register verify endpoint: < 1000ms
- [ ] Auth verify endpoint: < 1000ms
- [ ] Biometric prompt appears: < 2 seconds
- [ ] Full login flow: < 5 minutes (includes user interaction)

### ✅ Error Scenario Testing

- [ ] Invalid JWT → 401 response
- [ ] Expired JWT → 401 response
- [ ] Expired challenge → 400 response
- [ ] Invalid credential → 401 response
- [ ] Network timeout → Proper error message
- [ ] WebAuthn not supported → Fallback works
- [ ] User cancels biometric → Password option shown
- [ ] Redis failing → Clear error message

### ✅ Browser Compatibility Testing

Test in each browser and mobile OS:
- [ ] Chrome (desktop)
- [ ] Chrome (mobile)
- [ ] Safari (desktop)
- [ ] Safari (iOS)
- [ ] Firefox (desktop)
- [ ] Firefox (mobile)
- [ ] Edge (desktop)

Expected result: Works or gracefully degrades to password login

### ✅ Documentation Review

- [ ] WEBAUTHN_IMPLEMENTATION.md is accurate
- [ ] WEBAUTHN_DEPLOYMENT.md has correct URLs
- [ ] WEBAUTHN_API_REFERENCE.md has working examples
- [ ] WEBAUTHN_ARCHITECTURE.md diagrams are correct
- [ ] IMPLEMENTATION_SUMMARY.md reflects actual code
- [ ] All code comments are accurate
- [ ] No TODO comments remain in production code

### ✅ Monitoring & Logging Setup

- [ ] Backend logs WebAuthn events
- [ ] Frontend console logs are clean (no errors)
- [ ] Redis commands can be monitored
- [ ] Database queries can be monitored
- [ ] API response times can be measured
- [ ] Error rates can be tracked

## Deployment Day (Launch)

### ✅ Final Pre-Flight Checks

- [ ] All team members aware of launch time
- [ ] Rollback plan documented and tested
- [ ] On-call support person assigned
- [ ] Monitoring dashboards are open
- [ ] Slack/communication channel is set up
- [ ] Database backup taken
- [ ] Read replicas are synced

### ✅ Backend Deployment

- [ ] Code pushed to main branch
- [ ] All tests passing
- [ ] Build logs show no errors
- [ ] Server starting logs show "healthy"
- [ ] Verify endpoints are responding
- [ ] Check database connectivity
- [ ] Check Redis connectivity

### ✅ Frontend Deployment

- [ ] Code pushed to main branch
- [ ] Build completes successfully
- [ ] Files deployed to CDN/hosting
- [ ] Cache invalidation working
- [ ] App loads in fresh tab
- [ ] All resources loading (console clear)

### ✅ Immediate Post-Deployment

**First 15 minutes:**
- [ ] Check error logs for any issues
- [ ] Monitor API response times
- [ ] Verify no database errors
- [ ] Check Redis memory usage

**First hour:**
- [ ] Have internal team test full flow
- [ ] Monitor error rates
- [ ] Check for any spike in latency
- [ ] Verify JWT validation working
- [ ] Verify biometric endpoints working

**First 24 hours:**
- [ ] Monitor biometric success rate
- [ ] Check for any crash reports
- [ ] Review user feedback
- [ ] Verify no unexpected errors
- [ ] Performance metrics stable

## Post-Deployment (First Weekly Check)

### ✅ Metrics Review

```sql
-- Check credential adoption
SELECT COUNT(*) as total_credentials
FROM user_credentials
WHERE is_active = TRUE AND created_at > NOW() - interval '7 days';

-- Check credential usage
SELECT Date(last_used) as date, COUNT(*) as authentications
FROM user_credentials
GROUP BY date
ORDER BY date DESC;
```

- [ ] Biometric registrations increasing
- [ ] Authentication success rate > 95%
- [ ] No unusual error patterns
- [ ] Response times stable
- [ ] Database performance acceptable

### ✅ User Feedback

- [ ] No critical bug reports
- [ ] Users finding feature helpful
- [ ] No misunderstanding about biometric role
- [ ] Password fallback working when needed
- [ ] Mobile browser support working

### ✅ Security Audit (Optional, First Month)

- [ ] No challenge reuse detected
- [ ] No signature verification bypasses
- [ ] No counter manipulation detected
- [ ] No unauthorized credential creation
- [ ] Database integrity verified

### ✅ Documentation Updates

- [ ] Any lessons learned documented
- [ ] FAQ updated with real user questions
- [ ] Troubleshooting expanded with new issues
- [ ] Performance characteristics documented
- [ ] Known issues documented

## Rollback Procedure (If Needed)

### ✅ Rollback Steps

1. **Disable WebAuthn endpoints**
   ```python
   # Comment out in backend/server.py
   # @app.post("/auth/biometric/...")
   # async def endpoints(...):
   ```

2. **Revert frontend changes**
   ```bash
   git revert <commit-hash>  # Revert to before WebAuthn
   npm run build
   deploy
   ```

3. **Notify users**
   - [ ] Clear message about why biometric is temporarily disabled
   - [ ] Assure users password login still works
   - [ ] Give ETA for re-enabling

4. **Investigate root cause**
   - [ ] Check backend logs
   - [ ] Check frontend console errors
   - [ ] Check database state
   - [ ] Check Redis state

### ✅ Rollback Testing (Do this before production)

- [ ] Actually test the rollback procedure
- [ ] Verify app works with reverted code
- [ ] Measure time to complete rollback
- [ ] Document actual time taken

---

## Appendix: Database Index Creation

If not already created:

```sql
-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_credentials_user_id 
ON user_credentials(user_id);

CREATE INDEX IF NOT EXISTS idx_user_credentials_active
ON user_credentials(user_id, is_active);

-- Check indexes were created
\di user_credentials
```

## Appendix: Test Credentials

For testing (use fake data, not production):
```
Phone: +919999999999
Password: TestPassword123!
```

Register this test user before launch day if needed.

---

**Checklist Version**: 1.0
**Last Updated**: February 18, 2026
**Status**: Ready for Review
**Sign-Off**: _____________________ (Approver)
