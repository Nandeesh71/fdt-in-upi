"""
FastAPI Biometric Authentication Routes
Implements WebAuthn registration, authentication, and transaction verification

INTEGRATION WITH server.py:

1. Add import (around line 60):
   from backend.biometric_routes import create_biometric_router

2. After app and other functions are defined (around line 625), add:
   biometric_router = create_biometric_router(
       get_current_user_func=get_current_user,
       get_db_conn_func=get_db_conn,
       create_access_token_func=create_access_token,
   )
   app.include_router(biometric_router)
"""

import json
import base64
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Callable

from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel, Field
import redis
import psycopg2.extras
from webauthn import (
    generate_registration_options,
    verify_registration_response,
    generate_authentication_options,
    verify_authentication_response,
)
from webauthn.helpers.cose import COSEAlgorithmIdentifier


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class BiometricRegisterOptionsRequest(BaseModel):
    device_name: Optional[str] = Field(None, description="Name of the device (e.g., 'My iPhone')")


class BiometricRegisterVerifyRequest(BaseModel):
    credential_id: str
    attestation_object: str
    client_data_json: str
    device_name: Optional[str] = None


class BiometricAuthenticateVerifyRequest(BaseModel):
    credential_id: str
    authenticator_data: str
    client_data_json: str
    signature: str


class BiometricDisableRequest(BaseModel):
    credential_id: Optional[str] = None


class TransactionBiometricVerifyRequest(BaseModel):
    tx_id: str
    credential_id: str
    authenticator_data: str
    client_data_json: str
    signature: str


class BiometricStatusResponse(BaseModel):
    biometric_enabled: bool
    credentials_count: int
    last_registration: Optional[str] = None
    trusted_device: bool
    trusted_until: Optional[str] = None



# ============================================================================
# UTILITY FUNCTIONS
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


def get_redis_client() -> redis.Redis:
    """Get Redis client (db 1 for challenges/sessions)"""
    return redis.Redis(host="localhost", port=6379, db=1, decode_responses=True)


# ============================================================================
# ROUTE FACTORY
# ============================================================================

def create_biometric_router(
    get_current_user_func: Callable,
    get_db_conn_func: Callable,
    create_access_token_func: Callable,
) -> APIRouter:
    """
    Factory function to create biometric router with injected dependencies
    
    Args:
        get_current_user_func: Dependency that extracts user_id from JWT token
        get_db_conn_func: Function that returns PostgreSQL connection
        create_access_token_func: Function that creates JWT token
    
    Returns:
        APIRouter configured with all biometric endpoints
    """
    
    router = APIRouter(prefix="/api/biometric", tags=["biometric"])


@router.post("/register/options")
async def biometric_register_options(
    request: Request,
    req_body: BiometricRegisterOptionsRequest,
    user_id: str = Depends(get_current_user),
):
    """
    GET registration options for biometric enrollment
    Returns challenge and RP details
    """
    try:
        # Get RP ID from request origin
        origin = request.headers.get("origin", "http://localhost:3000")
        rp_id = origin.split("://")[1].split(":")[0]  # Extract domain
        
        # Get user info from database
        conn = get_db_conn()
        try:
            cur = conn.cursor()
            cur.execute("SELECT name, phone FROM users WHERE user_id = %s", (user_id,))
            user_row = cur.fetchone()
            if not user_row:
                raise HTTPException(status_code=404, detail="User not found")
            user_data = dict(user_row)
        finally:
            conn.close()

        # Generate registration options
        registration_data, state = generate_registration_options(
            rp_id=rp_id,
            rp_name="FDT Secure",
            user_id=user_id,
            user_name=user_data["phone"],
            user_display_name=user_data["name"],
            supported_algs=[COSEAlgorithmIdentifier.ECDSA_SHA_256, COSEAlgorithmIdentifier.RSASSA_PKCS1_v1_5_SHA_256],
            authenticator_attachment="platform",
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        )

        # Store challenge in Redis with 60-second TTL
        redis_client = get_redis_client()
        challenge_key = f"biometric:register:{user_id}:{registration_data.challenge}"
        redis_client.setex(
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
        print(f"❌ Registration options error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate registration options")


@router.post("/register/verify")
async def biometric_register_verify(
    request: Request,
    req_body: BiometricRegisterVerifyRequest,
    user_id: str = Depends(get_current_user),
):
    """
    Verify registration response and store credential
    """
    try:
        origin = request.headers.get("origin", "http://localhost:3000")
        rp_id = origin.split("://")[1].split(":")[0]

        # Get the challenge state from Redis
        redis_client = get_redis_client()
        challenge_key_pattern = f"biometric:register:{user_id}:*"
        
        # Find the matching challenge key
        challenge_data = None
        for key in redis_client.scan_iter(match=challenge_key_pattern):
            challenge_data = json.loads(redis_client.get(key))
            redis_client.delete(key)
            break
        
        if not challenge_data:
            raise HTTPException(status_code=400, detail="Challenge expired or not found")

        # Verify registration response
        try:
            verification = verify_registration_response(
                credential=req_body.dict(),
                expected_challenge=challenge_data["state"].challenge.encode(),
                expected_origin=origin,
                expected_rp_id=rp_id,
            )
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Registration verification failed: {str(e)}")

        if not verification.verified:
            raise HTTPException(status_code=400, detail="Credential verification failed")

        # Store credential in database
        credential_data = {
            "id": verification.credential_id,
            "publicKey": verification.credential_public_key,
            "signCount": verification.sign_count,
            "transports": verification.credential_device_type,
            "backup_eligible": verification.credential_backup_eligible,
            "backup_state": verification.credential_backup_state,
        }

        conn = get_db_conn()
        try:
            cur = conn.cursor()
            
            # Insert credential
            cur.execute(
                """INSERT INTO user_credentials 
                   (user_id, credential_id, public_key, sign_count, transports, device_name)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   ON CONFLICT (credential_id) DO UPDATE SET
                   sign_count = EXCLUDED.sign_count,
                   updated_at = NOW(),
                   last_used = NOW()
                   RETURNING id""",
                (
                    user_id,
                    verification.credential_id,
                    bytes_to_base64url(verification.credential_public_key),
                    verification.sign_count,
                    json.dumps(list(verification.credential_device_type)),
                    req_body.device_name or "Unknown Device",
                ),
            )
            
            # Update user to enable biometric
            cur.execute(
                """UPDATE users 
                   SET biometric_enabled = TRUE, last_biometric_registration = NOW()
                   WHERE user_id = %s""",
                (user_id,),
            )
            
            conn.commit()

            return {
                "status": "success",
                "message": "Biometric credential registered successfully",
                "credential_id": verification.credential_id,
                "device_name": req_body.device_name or "Unknown Device",
                "registered_at": datetime.now(timezone.utc).isoformat(),
            }

        finally:
            conn.close()

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Registration verification error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to register credential")


# ============================================================================
# AUTHENTICATION ENDPOINTS
# ============================================================================

@router.post("/login/options")
async def biometric_login_options(request: Request):
    """
    Generate authentication challenge (no auth required)
    Used when user hasn't logged in yet
    """
    try:
        origin = request.headers.get("origin", "http://localhost:3000")
        rp_id = origin.split("://")[1].split(":")[0]

        # Generate authentication options (empty user list for usernameless flow)
        authentication_data, state = generate_authentication_options(
            rp_id=rp_id,
            user_verification=UserVerificationRequirement.PREFERRED,
        )

        # Store challenge in Redis with 60-second TTL
        redis_client = get_redis_client()
        challenge_key = f"biometric:auth:{authentication_data.challenge}"
        redis_client.setex(
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
        print(f"❌ Authentication options error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate authentication options")


@router.post("/login/verify")
async def biometric_login_verify(
    request: Request,
    req_body: BiometricAuthenticateVerifyRequest,
):
    """
    Verify authentication assertion and return JWT token
    """
    try:
        origin = request.headers.get("origin", "http://localhost:3000")
        rp_id = origin.split("://")[1].split(":")[0]

        # Get challenge from Redis
        redis_client = get_redis_client()
        challenge_key_pattern = f"biometric:auth:{req_body.authenticator_data[:30]}*"
        
        # Find all auth challenges and check each
        challenge_data = None
        matching_key = None
        for key in redis_client.scan_iter(match="biometric:auth:*"):
            stored_data = json.loads(redis_client.get(key))
            # We'll verify the challenge inside verify_authentication_response
            challenge_data = stored_data
            matching_key = key
            break

        if not challenge_data:
            raise HTTPException(status_code=400, detail="Challenge not found or expired")

        # Look up credential by credential_id
        conn = get_db_conn()
        try:
            cur = conn.cursor()
            cur.execute(
                """SELECT user_id, public_key, sign_count FROM user_credentials 
                   WHERE credential_id = %s""",
                (req_body.credential_id,),
            )
            cred_row = cur.fetchone()
            
            if not cred_row:
                raise HTTPException(status_code=401, detail="Credential not found")
            
            cred_data = dict(cred_row)
            user_id = cred_data["user_id"]

        finally:
            conn.close()

        # Verify authentication response
        try:
            public_key_bytes = base64url_to_bytes(cred_data["public_key"])
            
            verification = verify_authentication_response(
                credential=req_body.dict(),
                expected_challenge=challenge_data["state"].challenge.encode(),
                expected_origin=origin,
                expected_rp_id=rp_id,
                credential_public_key=public_key_bytes,
                credential_current_sign_count=cred_data["sign_count"],
                require_cross_origin_none=False,
            )
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")

        if not verification.verified:
            raise HTTPException(status_code=401, detail="Authentication verification failed")

        # Check for cloned credential (sign count should increase)
        if verification.new_sign_count <= cred_data["sign_count"]:
            print(f"⚠️ Possible cloned credential for user {user_id}")
            # Optionally disable the credential, but allow this time
        
        # Update sign count
        conn = get_db_conn()
        try:
            cur = conn.cursor()
            cur.execute(
                """UPDATE user_credentials SET sign_count = %s, last_used = NOW() 
                   WHERE credential_id = %s""",
                (verification.new_sign_count, req_body.credential_id),
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

        # Create and return JWT token
        token = create_access_token(user_id)
        
        # Clean up challenge
        if matching_key:
            redis_client.delete(matching_key)

        return {
            "status": "success",
            "message": "Biometric authentication successful",
            "token": token,
            "user": {
                "user_id": user_data.get("user_id"),
                "name": user_data.get("name"),
                "phone": user_data.get("phone"),
                "email": user_data.get("email"),
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Authentication verification error: {str(e)}")
        raise HTTPException(status_code=500, detail="Biometric authentication failed")


# ============================================================================
# STATUS & MANAGEMENT ENDPOINTS
# ============================================================================

@router.get("/status")
async def biometric_status(user_id: str = Depends(get_current_user)):
    """
    Get biometric status for current user
    Returns whether biometric is enabled and trusted device info
    """
    try:
        conn = get_db_conn()
        try:
            cur = conn.cursor()
            
            # Get biometric status
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
            trusted_session = None
            cur.execute(
                """SELECT session_id, trusted_until, device_name 
                   FROM biometric_sessions 
                   WHERE user_id = %s AND trusted_until > NOW()
                   LIMIT 1""",
                (user_id,),
            )
            session_row = cur.fetchone()
            if session_row:
                trusted_session = dict(session_row)

        finally:
            conn.close()

        return BiometricStatusResponse(
            biometric_enabled=user_data.get("biometric_enabled", False),
            credentials_count=cred_count,
            last_registration=user_data.get("last_biometric_registration"),
            trusted_device=trusted_session is not None,
            trusted_until=trusted_session.get("trusted_until") if trusted_session else None,
        )

    except Exception as e:
        print(f"❌ Status check error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get biometric status")


@router.post("/disable")
async def biometric_disable(
    request: Request,
    req_body: BiometricDisableRequest,
    user_id: str = Depends(get_current_user),
):
    """
    Disable biometric authentication
    """
    try:
        conn = get_db_conn()
        try:
            cur = conn.cursor()
            
            if req_body.credential_id:
                # Disable specific credential
                cur.execute(
                    "DELETE FROM user_credentials WHERE credential_id = %s AND user_id = %s",
                    (req_body.credential_id, user_id),
                )
                
                # Check if user has any remaining credentials
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
                # Disable all credentials
                cur.execute("DELETE FROM user_credentials WHERE user_id = %s", (user_id,))
                cur.execute(
                    "UPDATE users SET biometric_enabled = FALSE WHERE user_id = %s",
                    (user_id,),
                )
            
            # Clear trusted sessions
            cur.execute("DELETE FROM biometric_sessions WHERE user_id = %s", (user_id,))
            
            conn.commit()

            return {
                "status": "success",
                "message": "Biometric authentication disabled",
            }

        finally:
            conn.close()

    except Exception as e:
        print(f"❌ Disable biometric error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to disable biometric")


# ============================================================================
# TRANSACTION VERIFICATION
# ============================================================================

@router.post("/transaction/verify")
async def biometric_transaction_verify(
    request: Request,
    req_body: TransactionBiometricVerifyRequest,
    user_id: str = Depends(get_current_user),
):
    """
    Verify biometric for high-risk transactions
    Called when transaction risk level is MEDIUM or HIGH
    """
    try:
        origin = request.headers.get("origin", "http://localhost:3000")
        rp_id = origin.split("://")[1].split(":")[0]

        # Look up credential
        conn = get_db_conn()
        try:
            cur = conn.cursor()
            cur.execute(
                """SELECT public_key, sign_count FROM user_credentials 
                   WHERE credential_id = %s AND user_id = %s""",
                (req_body.credential_id, user_id),
            )
            cred_row = cur.fetchone()
            
            if not cred_row:
                raise HTTPException(status_code=401, detail="Credential not found")
            
            cred_data = dict(cred_row)

        finally:
            conn.close()

        # Get challenge from Redis
        redis_client = get_redis_client()
        matching_key = None
        challenge_data = None
        
        for key in redis_client.scan_iter(match="biometric:txn:*"):
            stored_data = json.loads(redis_client.get(key))
            challenge_data = stored_data
            matching_key = key
            break
        
        if not challenge_data:
            # Handle case where challenge is requested first
            raise HTTPException(status_code=400, detail="Challenge not found. Request challenge first.")

        # Verify assertion
        try:
            public_key_bytes = base64url_to_bytes(cred_data["public_key"])
            
            verification = verify_authentication_response(
                credential=req_body.dict(),
                expected_challenge=challenge_data["state"].challenge.encode(),
                expected_origin=origin,
                expected_rp_id=rp_id,
                credential_public_key=public_key_bytes,
                credential_current_sign_count=cred_data["sign_count"],
            )
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Transaction verification failed: {str(e)}")

        if not verification.verified:
            raise HTTPException(status_code=401, detail="Verification failed")

        # Update sign count
        conn = get_db_conn()
        try:
            cur = conn.cursor()
            cur.execute(
                """UPDATE user_credentials SET sign_count = %s, last_used = NOW() 
                   WHERE credential_id = %s""",
                (verification.new_sign_count, req_body.credential_id),
            )
            conn.commit()

        finally:
            conn.close()

        # Clean up challenge
        if matching_key:
            redis_client.delete(matching_key)

        return {
            "status": "success",
            "verified": True,
            "message": "Transaction verified with biometric",
            "tx_id": req_body.tx_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Transaction verification error: {str(e)}")
        raise HTTPException(status_code=500, detail="Transaction verification failed")


def init_biometric_routes(get_current_user_func, get_db_conn_func, create_access_token_func):
    """
    Initialize biometric routes with dependencies from server.py
    Call this from server.py after app initialization
    """
    global get_current_user, get_db_conn, create_access_token
    get_current_user = get_current_user_func
    get_db_conn = get_db_conn_func
    create_access_token = create_access_token_func


# Export router to be included in main FastAPI app
# In your server.py: 
#   from backend.biometric_routes import router as biometric_router, init_biometric_routes
#   app.include_router(biometric_router)
#   init_biometric_routes(get_current_user, get_db_conn, create_access_token)
