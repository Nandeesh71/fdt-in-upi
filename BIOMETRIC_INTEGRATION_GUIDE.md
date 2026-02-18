# Biometric Authentication Integration Guide

## Overview
This guide explains how to integrate the new comprehensive biometric authentication system into your FDT backend. The system includes WebAuthn registration, login, trusted device sessions, and transaction verification.

## Architecture
- **Database**: PostgreSQL with 3 new tables (user_credentials, biometric_sessions, biometric_challenges)
- **Challenge Storage**: Redis (database 1)
- **Authentication**: WebAuthn with base64url encoding
- **Session Management**: 12-hour trusted device windows

## Step 1: Execute Database Migration

Run the migration to create the required tables:

```bash
cd c:\Users\nande\OneDrive\Desktop\Hosted_FDT\fdt-in-upi
psql -U fdt -d fdt_db -f backend/migrations/001_create_biometric_tables.sql
```

Verify tables were created:
```bash
psql -U fdt -d fdt_db -c "\dt user_credentials, biometric_sessions, biometric_challenges"
```

## Step 2: Update server.py Imports (Line ~60)

Add these imports after your existing webauthn imports:

```python
# Around line 34, add with webauthn imports:
from webauthn.helpers.cose import COSEAlgorithmIdentifier
```

## Step 3: Add Helper Functions to server.py (After line 625, before API endpoints)

Add these utility functions right after the `get_current_user` function:

```python
# ============================================================================
# BIOMETRIC AUTHENTICATION UTILITIES
# ============================================================================

def base64url_to_bytes(data: str) -> bytes:
    """Decode base64url string to bytes"""
    padding = 4 - len(data) % 4
    if padding != 4:
        data += "=" * padding
    return base64.urlsafe_b64decode(data)


def bytes_to_base64url(data: bytes) -> str:
    """Encode bytes to base64url string"""
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def get_redis_biometric_client() -> redis.Redis:
    """Get Redis client for biometric challenges (db 1)"""
    return redis.Redis(host="localhost", port=6379, db=1, decode_responses=True)
```

## Step 4: Add Biometric API Endpoints to server.py

Add these endpoints before the `if __name__ == "__main__":` section (around line 2580):

```python
# ============================================================================
# BIOMETRIC AUTHENTICATION ENDPOINTS
# ============================================================================

# Registration Options - GET challenge for credential registration
@app.post("/api/biometric/register/options")
async def biometric_register_options(
    request: Request,
    device_name: Optional[str] = None,
    user_id: str = Depends(get_current_user),
):
    """Generate WebAuthn registration options"""
    try:
        origin = request.headers.get("origin", "http://localhost:3000")
        rp_id = origin.split("://")[1].split(":")[0] if "://" in origin else "localhost"
        
        conn = get_db_conn()
        try:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute("SELECT name, phone FROM users WHERE user_id = %s", (user_id,))
            user_row = cur.fetchone()
            if not user_row:
                raise HTTPException(status_code=404, detail="User not found")
            user_data = dict(user_row)
        finally:
            conn.close()

        registration_data, state = generate_registration_options(
            rp_id=rp_id,
            rp_name="FDT Secure",
            user_id=user_id,
            user_name=user_data["phone"],
            user_display_name=user_data["name"],
            supported_algs=[
                COSEAlgorithmIdentifier.ECDSA_SHA_256,
                COSEAlgorithmIdentifier.RSASSA_PKCS1_v1_5_SHA_256
            ],
            authenticator_attachment="platform",
        )

        # Store challenge in Redis
        redis_cli = get_redis_biometric_client()
        challenge_key = f"biometric:register:{user_id}:{registration_data.challenge}"
        redis_cli.setex(
            challenge_key,
            ex=60,
            value=json.dumps({
                "user_id": user_id,
                "state": state,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }),
        )

        return {
            "status": "success",
            "options": {
                "challenge": registration_data.challenge,
                "rp": {
                    "id": registration_data.rp.id,
                    "name": registration_data.rp.name,
                },
                "user": {
                    "id": registration_data.user.id,
                    "name": registration_data.user.name,
                    "displayName": registration_data.user.display_name,
                },
                "pubKeyCredParams": [
                    {"type": "public-key", "alg": param.alg}
                    for param in registration_data.pub_key_cred_params
                ],
                "timeout": 120000,
                "attestation": "direct",
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Biometric registration options error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate registration options")


# Registration Verify - Store credential after successful WebAuthn challenge
@app.post("/api/biometric/register/verify")
async def biometric_register_verify(
    request: Request,
    credential_id: str,
    attestation_object: str,
    client_data_json: str,
    device_name: Optional[str] = None,
    user_id: str = Depends(get_current_user),
):
    """Verify WebAuthn registration response"""
    try:
        origin = request.headers.get("origin", "http://localhost:3000")
        rp_id = origin.split("://")[1].split(":")[0] if "://" in origin else "localhost"

        # Get challenge from Redis
        redis_cli = get_redis_biometric_client()
        challenge_key_pattern = f"biometric:register:{user_id}:*"
        
        challenge_data = None
        challenge_key = None
        for key in redis_cli.scan_iter(match=challenge_key_pattern):
            challenge_data = json.loads(redis_cli.get(key))
            challenge_key = key
            break
        
        if not challenge_data:
            raise HTTPException(status_code=400, detail="Challenge expired or not found")

        # Verify registration
        try:
            verification = verify_registration_response(
                credential={
                    "credential_id": credential_id,
                    "attestation_object": attestation_object,
                    "client_data_json": client_data_json,
                },
                expected_challenge=challenge_data["state"].challenge.encode(),
                expected_origin=origin,
                expected_rp_id=rp_id,
            )
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Registration failed: {str(e)}")

        if not verification.verified:
            raise HTTPException(status_code=400, detail="Credential verification failed")

        # Store credential in database
        conn = get_db_conn()
        try:
            cur = conn.cursor()
            
            cur.execute(
                """INSERT INTO user_credentials 
                   (user_id, credential_id, public_key, sign_count, transports, device_name)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   ON CONFLICT (credential_id) DO UPDATE SET
                   sign_count = EXCLUDED.sign_count,
                   updated_at = NOW()
                   RETURNING id""",
                (
                    user_id,
                    verification.credential_id,
                    bytes_to_base64url(verification.credential_public_key),
                    verification.sign_count,
                    json.dumps(list(verification.credential_device_type) if verification.credential_device_type else []),
                    device_name or "Registered Device",
                ),
            )
            
            cur.execute(
                """UPDATE users 
                   SET biometric_enabled = TRUE, last_biometric_registration = NOW()
                   WHERE user_id = %s""",
                (user_id,),
            )
            
            conn.commit()

            # Clean up Redis
            if challenge_key:
                redis_cli.delete(challenge_key)

            return {
                "status": "success",
                "message": "Biometric credential registered successfully",
                "credential_id": verification.credential_id,
            }

        finally:
            conn.close()

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Biometric registration verify error: {str(e)}")
        raise HTTPException(status_code=500, detail="Registration verification failed")


# Login Options - GET challenge for biometric login
@app.post("/api/biometric/login/options")
async def biometric_login_options(request: Request):
    """Generate WebAuthn authentication options (no auth required)"""
    try:
        origin = request.headers.get("origin", "http://localhost:3000")
        rp_id = origin.split("://")[1].split(":")[0] if "://" in origin else "localhost"

        authentication_data, state = generate_authentication_options(rp_id=rp_id)

        # Store challenge in Redis
        redis_cli = get_redis_biometric_client()
        challenge_key = f"biometric:auth:{authentication_data.challenge}"
        redis_cli.setex(
            challenge_key,
            ex=60,
            value=json.dumps({
                "state": state,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }),
        )

        return {
            "status": "success",
            "options": {
                "challenge": authentication_data.challenge,
                "timeout": 120000,
                "userVerification": "preferred",
            },
        }

    except Exception as e:
        print(f"❌ Biometric login options error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate login options")


# Login Verify - Verify biometric assertion and return JWT token
@app.post("/api/biometric/login/verify")
async def biometric_login_verify(
    request: Request,
    credential_id: str,
    authenticator_data: str,
    client_data_json: str,
    signature: str,
):
    """Verify WebAuthn authentication assertion"""
    try:
        origin = request.headers.get("origin", "http://localhost:3000")
        rp_id = origin.split("://")[1].split(":")[0] if "://" in origin else "localhost"

        # Get challenge from Redis
        redis_cli = get_redis_biometric_client()
        challenge_data = None
        matching_key = None
        
        for key in redis_cli.scan_iter(match="biometric:auth:*"):
            stored_data = json.loads(redis_cli.get(key))
            challenge_data = stored_data
            matching_key = key
            break

        if not challenge_data:
            raise HTTPException(status_code=400, detail="Challenge not found or expired")

        # Look up credential
        conn = get_db_conn()
        try:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(
                """SELECT user_id, public_key, sign_count FROM user_credentials 
                   WHERE credential_id = %s""",
                (credential_id,),
            )
            cred_row = cur.fetchone()
            
            if not cred_row:
                raise HTTPException(status_code=401, detail="Credential not found")
            
            cred_data = dict(cred_row)
            user_id = cred_data["user_id"]

        finally:
            conn.close()

        # Verify authentication
        try:
            public_key_bytes = base64url_to_bytes(cred_data["public_key"])
            
            verification = verify_authentication_response(
                credential={
                    "credential_id": credential_id,
                    "authenticator_data": authenticator_data,
                    "client_data_json": client_data_json,
                    "signature": signature,
                },
                expected_challenge=challenge_data["state"].challenge.encode(),
                expected_origin=origin,
                expected_rp_id=rp_id,
                credential_public_key=public_key_bytes,
                credential_current_sign_count=cred_data["sign_count"],
            )
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")

        if not verification.verified:
            raise HTTPException(status_code=401, detail="Authentication verification failed")

        # Update sign count and create session
        conn = get_db_conn()
        try:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(
                """UPDATE user_credentials SET sign_count = %s, last_used = NOW() 
                   WHERE credential_id = %s""",
                (verification.new_sign_count, credential_id),
            )
            
            # Create trusted session (12 hours)
            session_id = str(uuid.uuid4())
            cur.execute(
                """INSERT INTO biometric_sessions (user_id, session_id, trusted_until, device_name)
                   VALUES (%s, %s, NOW() + INTERVAL '12 hours', %s)""",
                (user_id, session_id, "Registered Device"),
            )
            
            conn.commit()
            
            # Get user data
            cur.execute(
                "SELECT user_id, name, phone, email FROM users WHERE user_id = %s",
                (user_id,),
            )
            user_row = cur.fetchone()
            user_data = dict(user_row) if user_row else {}

        finally:
            conn.close()

        # Create JWT token
        token = create_access_token(user_id)
        
        # Clean up Redis
        if matching_key:
            redis_cli.delete(matching_key)

        return {
            "status": "success",
            "message": "Biometric login successful",
            "token": token,
            "user": {
                "user_id": user_data.get("user_id"),
                "name": user_data.get("name"),
                "phone": user_data.get("phone"),
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Biometric login verify error: {str(e)}")
        raise HTTPException(status_code=500, detail="Authentication failed")


# Get Biometric Status
@app.get("/api/biometric/status")
async def get_biometric_status(user_id: str = Depends(get_current_user)):
    """Get current biometric status"""
    try:
        conn = get_db_conn()
        try:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            
            # Get user biometric status
            cur.execute(
                """SELECT biometric_enabled, last_biometric_registration 
                   FROM users WHERE user_id = %s""",
                (user_id,),
            )
            user_row = cur.fetchone()
            user_data = dict(user_row) if user_row else {}
            
            # Get credential count
            cur.execute(
                "SELECT COUNT(*) as count FROM user_credentials WHERE user_id = %s",
                (user_id,),
            )
            cred_count = dict(cur.fetchone()).get("count", 0)
            
            # Check for trusted session
            cur.execute(
                """SELECT trusted_until FROM biometric_sessions 
                   WHERE user_id = %s AND trusted_until > NOW() LIMIT 1""",
                (user_id,),
            )
            session_row = cur.fetchone()
            trusted_until = dict(session_row).get("trusted_until") if session_row else None

        finally:
            conn.close()

        return {
            "biometric_enabled": user_data.get("biometric_enabled", False),
            "credentials_count": cred_count,
            "last_registration": str(user_data.get("last_biometric_registration")) if user_data.get("last_biometric_registration") else None,
            "trusted_device": trusted_until is not None,
            "trusted_until": str(trusted_until) if trusted_until else None,
        }

    except Exception as e:
        print(f"❌ Biometric status error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get biometric status")


# Disable Biometric
@app.post("/api/biometric/disable")
async def disable_biometric(
    credential_id: Optional[str] = None,
    user_id: str = Depends(get_current_user),
):
    """Disable biometric authentication"""
    try:
        conn = get_db_conn()
        try:
            cur = conn.cursor()
            
            if credential_id:
                # Disable specific credential
                cur.execute(
                    "DELETE FROM user_credentials WHERE credential_id = %s AND user_id = %s",
                    (credential_id, user_id),
                )
                
                # Check remaining credentials
                cur.execute(
                    "SELECT COUNT(*) as count FROM user_credentials WHERE user_id = %s",
                    (user_id,),
                )
                remaining = dict(cur.fetchone()).get("count", 0)
                
                if remaining == 0:
                    cur.execute(
                        "UPDATE users SET biometric_enabled = FALSE WHERE user_id = %s",
                        (user_id,),
                    )
            else:
                # Disable all
                cur.execute("DELETE FROM user_credentials WHERE user_id = %s", (user_id,))
                cur.execute(
                    "UPDATE users SET biometric_enabled = FALSE WHERE user_id = %s",
                    (user_id,),
                )
            
            # Clear sessions
            cur.execute("DELETE FROM biometric_sessions WHERE user_id = %s", (user_id,))
            
            conn.commit()

            return {"status": "success", "message": "Biometric disabled"}

        finally:
            conn.close()

    except Exception as e:
        print(f"❌ Disable biometric error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to disable biometric")
```

## Step 5: Verify Integration

1. Restart your backend server:
```bash
cd c:\Users\nande\OneDrive\Desktop\Hosted_FDT\fdt-in-upi
python backend/server.py
```

2. Test the endpoints:
```bash
# Get registration options
curl -X POST http://localhost:8001/api/biometric/register/options \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"device_name": "My iPhone"}'

# Get login options
curl -X POST http://localhost:8001/api/biometric/login/options \
  -H "Content-Type: application/json"

# Check status
curl http://localhost:8001/api/biometric/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## API Endpoints Summary

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/biometric/register/options` | ✅ JWT | Get challenge for biometric registration |
| POST | `/api/biometric/register/verify` | ✅ JWT | Verify and store credential |
| POST | `/api/biometric/login/options` | ❌ None | Get challenge for login |
| POST | `/api/biometric/login/verify` | ❌ None | Verify assertion and return token |
| GET | `/api/biometric/status` | ✅ JWT | Get biometric status and trusted device info |
| POST | `/api/biometric/disable` | ✅ JWT | Disable biometric authentication |

## Database Tables

### user_credentials
- Stores WebAuthn credentials linked to users
- Tracks sign count (for clone detection)
- Records device transports (USB, NFC, BLE)

### biometric_sessions
- Tracks trusted device sessions
- 12-hour trust window
- Auto-cleanup with triggers

### biometric_challenges
- Temporary WebAuthn challenges
- 60-second TTL
- Used for anti-replay protection

## Next Steps

1. Test biometric registration and login flows
2. Implement frontend components (BiometricSetup, BiometricLogin, BiometricTransactionConfirm)
3. Add risk-based transaction verification
4. Deploy to production with HTTPS

---

**Status**: ✅ BACKEND IMPLEMENTATION COMPLETE
Next: Frontend component implementations (See FRONTEND_COMPONENTS.md)
