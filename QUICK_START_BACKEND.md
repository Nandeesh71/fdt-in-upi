# Quick Start - Manual Backend Integration

## Overview
This guide shows exactly what code to add to `backend/server.py` to integrate the biometric endpoints.

## Step 1: Add Import (Line ~34)

**FIND THIS SECTION** in `server.py` around line 30-40:
```python
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    UserVerificationRequirement,
    PublicKeyCredentialDescriptor,
    AuthenticatorTransport
)
```

**ADD THIS LINE** after it:
```python
from webauthn.helpers.cose import COSEAlgorithmIdentifier
```

**Result** (around line 40):
```python
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    UserVerificationRequirement,
    PublicKeyCredentialDescriptor,
    AuthenticatorTransport
)
from webauthn.helpers.cose import COSEAlgorithmIdentifier
```

## Step 2: Add Utility Functions (After Line ~625)

**FIND THIS FUNCTION** in `server.py` around line 613-625:
```python
async def get_current_user(request: Request) -> str:
    """Get current user from Authorization header"""
    # ... function body ...
    return payload["user_id"]
```

**ADD THESE FUNCTIONS** right after `get_current_user()` ends:

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

## Step 3: Add Biometric Endpoints (Before Line ~2580)

**FIND THIS SECTION** at the very end of `server.py` (around line 2578-2585):
```python
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
```

**ADD ALL THIS CODE** BEFORE the `if __name__ == "__main__":` section:

### 3.1 Registration Options Endpoint

```python
# ============================================================================
# BIOMETRIC AUTHENTICATION ENDPOINTS
# ============================================================================

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
```

### 3.2 Registration Verify Endpoint

```python
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

        conn = get_db_conn()
        try:
            cur = conn.cursor()
            
            cur.execute(
                """INSERT INTO user_credentials 
                   (user_id, credential_id, public_key, sign_count, transports, device_name)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   ON CONFLICT (credential_id) DO UPDATE SET
                   sign_count = EXCLUDED.sign_count,
                   updated_at = NOW()""",
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
```

### 3.3 Login Options Endpoint

```python
@app.post("/api/biometric/login/options")
async def biometric_login_options(request: Request):
    """Generate WebAuthn authentication options (no auth required)"""
    try:
        origin = request.headers.get("origin", "http://localhost:3000")
        rp_id = origin.split("://")[1].split(":")[0] if "://" in origin else "localhost"

        authentication_data, state = generate_authentication_options(rp_id=rp_id)

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
```

### 3.4 Login Verify Endpoint

```python
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

        conn = get_db_conn()
        try:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(
                """UPDATE user_credentials SET sign_count = %s, last_used = NOW() 
                   WHERE credential_id = %s""",
                (verification.new_sign_count, credential_id),
            )
            
            session_id = str(uuid.uuid4())
            cur.execute(
                """INSERT INTO biometric_sessions (user_id, session_id, trusted_until, device_name)
                   VALUES (%s, %s, NOW() + INTERVAL '12 hours', %s)""",
                (user_id, session_id, "Registered Device"),
            )
            
            conn.commit()
            
            cur.execute(
                "SELECT user_id, name, phone, email FROM users WHERE user_id = %s",
                (user_id,),
            )
            user_row = cur.fetchone()
            user_data = dict(user_row) if user_row else {}

        finally:
            conn.close()

        token = create_access_token(user_id)
        
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
```

### 3.5 Status Endpoint

```python
@app.get("/api/biometric/status")
async def get_biometric_status(user_id: str = Depends(get_current_user)):
    """Get current biometric status"""
    try:
        conn = get_db_conn()
        try:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            
            cur.execute(
                """SELECT biometric_enabled, last_biometric_registration 
                   FROM users WHERE user_id = %s""",
                (user_id,),
            )
            user_row = cur.fetchone()
            user_data = dict(user_row) if user_row else {}
            
            cur.execute(
                "SELECT COUNT(*) as count FROM user_credentials WHERE user_id = %s",
                (user_id,),
            )
            cred_count = dict(cur.fetchone()).get("count", 0)
            
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
```

### 3.6 Disable Endpoint

```python
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
                cur.execute(
                    "DELETE FROM user_credentials WHERE credential_id = %s AND user_id = %s",
                    (credential_id, user_id),
                )
                
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
                cur.execute("DELETE FROM user_credentials WHERE user_id = %s", (user_id,))
                cur.execute(
                    "UPDATE users SET biometric_enabled = FALSE WHERE user_id = %s",
                    (user_id,),
                )
            
            cur.execute("DELETE FROM biometric_sessions WHERE user_id = %s", (user_id,))
            
            conn.commit()

            return {"status": "success", "message": "Biometric disabled"}

        finally:
            conn.close()

    except Exception as e:
        print(f"❌ Disable biometric error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to disable biometric")
```

## Step 4: Verify Integration

```bash
# Restart server
python backend/server.py

# Test endpoints
curl -X POST http://localhost:8001/api/biometric/login/options \
  -H "Content-Type: application/json"

# Should return with challenge and status: "success"
```

## ✅ Completion Checklist

- [ ] Added import `from webauthn.helpers.cose import COSEAlgorithmIdentifier` (line ~40)
- [ ] Added utility functions `base64url_to_bytes`, `bytes_to_base64url`, `get_redis_biometric_client` (after line ~625)
- [ ] Added 6 biometric endpoints (before `if __name__ == "__main__"`)
- [ ] Restarted backend server
- [ ] Tested `/api/biometric/login/options` responds
- [ ] Database migration executed
- [ ] Frontend files updated

---

**Once all steps are complete**: Run tests from `BIOMETRIC_TESTING_GUIDE.md`
