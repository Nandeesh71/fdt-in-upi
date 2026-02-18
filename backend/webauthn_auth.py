"""
WebAuthn (Biometric) Authentication Module
Handles WebAuthn credential registration and authentication flows
"""

import os
import json
import secrets
import base64
from typing import Optional, Tuple
from datetime import datetime, timedelta
from uuid import uuid4

import redis
from webauthn import generate_registration_options, verify_registration_response
from webauthn import generate_authentication_options, verify_authentication_response
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    UserVerificationRequirement,
    PublicKeyCredentialDescriptor,
    AuthenticatorTransport,
    ResidentKeyRequirement,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url


# Redis configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CHALLENGE_EXPIRY_SECONDS = 600  # 10 minutes
CHALLENGE_PREFIX = "webauthn_challenge:"


def get_redis_client():
    """Get or create Redis client for challenge storage"""
    try:
        client = redis.from_url(REDIS_URL, decode_responses=True)
        client.ping()
        return client
    except Exception as e:
        print(f"⚠ Redis connection failed: {e}")
        return None


def store_challenge(user_id: str, challenge: str, challenge_type: str) -> bool:
    """
    Store challenge in Redis with expiry
    
    Args:
        user_id: User identifier
        challenge: Base64url-encoded challenge
        challenge_type: 'registration' or 'authentication'
    
    Returns:
        True if stored successfully
    """
    try:
        redis_client = get_redis_client()
        if not redis_client:
            return False
        
        key = f"{CHALLENGE_PREFIX}{user_id}:{challenge_type}"
        redis_client.setex(
            key,
            CHALLENGE_EXPIRY_SECONDS,
            json.dumps({
                "challenge": challenge,
                "type": challenge_type,
                "timestamp": datetime.utcnow().isoformat()
            })
        )
        return True
    except Exception as e:
        print(f"⚠ Failed to store challenge: {e}")
        return False


def retrieve_challenge(user_id: str, challenge_type: str) -> Optional[str]:
    """
    Retrieve and delete challenge from Redis
    
    Args:
        user_id: User identifier
        challenge_type: 'registration' or 'authentication'
    
    Returns:
        Challenge string if valid and not expired, None otherwise
    """
    try:
        redis_client = get_redis_client()
        if not redis_client:
            return None
        
        key = f"{CHALLENGE_PREFIX}{user_id}:{challenge_type}"
        data = redis_client.get(key)
        
        if data:
            challenge_data = json.loads(data)
            # Delete after retrieval (one-time use)
            redis_client.delete(key)
            return challenge_data["challenge"]
        
        return None
    except Exception as e:
        print(f"⚠ Failed to retrieve challenge: {e}")
        return None


def generate_registration_challenge(
    user_id: str,
    user_email: str,
    user_name: str,
    rp_id: str = "fdt-frontend.onrender.com",
    rp_name: str = "Fraud Detection Tool"
) -> dict:
    """
    Generate WebAuthn registration challenge
    
    Args:
        user_id: User identifier
        user_email: User email for credential
        user_name: Display name for credential
        rp_id: Relying party ID (domain)
        rp_name: Relying party name
    
    Returns:
        Registration options dict with challenge
    """
    try:
        options = generate_registration_options(
            rp_id=rp_id,
            rp_name=rp_name,
            user_id=user_id,
            user_email=user_email,
            user_name=user_name,
            authenticator_selection=AuthenticatorSelectionCriteria(
                authenticator_attachment="platform",  # Built-in device (fingerprint, face, PIN)
                resident_key=ResidentKeyRequirement.PREFERRED,
                user_verification=UserVerificationRequirement.PREFERRED,
            ),
            supported_alg_ids=[-7, -257],  # ES256 and RS256
        )
        
        # Store challenge for verification
        challenge_str = options.challenge
        store_challenge(user_id, challenge_str, "registration")
        
        return {
            "challenge": challenge_str,
            "rp": {"id": rp_id, "name": rp_name},
            "user": {
                "id": base64url_to_bytes(user_id).hex(),
                "email": user_email,
                "name": user_name,
            },
            "pubKeyCredParams": options.pub_key_cred_params,
            "timeout": 60000,
            "attestation": "direct",
            "authenticatorSelection": {
                "authenticatorAttachment": "platform",
                "residentKey": "preferred",
                "userVerification": "preferred",
            }
        }
    except Exception as e:
        print(f"⚠ Failed to generate registration challenge: {e}")
        raise


def verify_registration(
    user_id: str,
    credential_id: str,
    attestation_object: str,
    client_data_json: str,
    rp_id: str = "fdt-frontend.onrender.com",
) -> Tuple[bool, Optional[dict]]:
    """
    Verify WebAuthn registration attestation
    
    Args:
        user_id: User identifier
        credential_id: Credential ID from client
        attestation_object: Base64url-encoded attestation object
        client_data_json: Base64url-encoded client data JSON
        rp_id: Relying party ID (domain)
    
    Returns:
        Tuple of (success: bool, credential_data: dict or None)
    """
    try:
        # Retrieve stored challenge
        challenge = retrieve_challenge(user_id, "registration")
        if not challenge:
            return False, {"error": "Invalid or expired challenge"}
        
        # Verify registration
        verification = verify_registration_response(
            credential=credential_id,
            attestation_object=base64url_to_bytes(attestation_object),
            client_data_json=base64url_to_bytes(client_data_json),
            origin="https://fdt-frontend.onrender.com",
            rp_id=rp_id,
            expected_challenge=base64url_to_bytes(challenge),
        )
        
        # Return credential data for storage
        return True, {
            "credential_id": bytes_to_base64url(verification.credential_id),
            "public_key": bytes_to_base64url(verification.credential_public_key),
            "sign_count": verification.sign_count,
            "counter": verification.sign_count,
        }
    
    except Exception as e:
        print(f"⚠ Registration verification failed: {e}")
        return False, {"error": str(e)}


def generate_authentication_challenge(
    user_id: str,
    rp_id: str = "fdt-frontend.onrender.com"
) -> dict:
    """
    Generate WebAuthn authentication challenge
    
    Args:
        user_id: User identifier
        rp_id: Relying party ID (domain)
    
    Returns:
        Authentication options dict with challenge
    """
    try:
        options = generate_authentication_options(
            rp_id=rp_id,
            user_verification=UserVerificationRequirement.PREFERRED,
        )
        
        # Store challenge for verification
        challenge_str = options.challenge
        store_challenge(user_id, challenge_str, "authentication")
        
        return {
            "challenge": challenge_str,
            "timeout": 60000,
            "userVerification": "preferred",
        }
    except Exception as e:
        print(f"⚠ Failed to generate authentication challenge: {e}")
        raise


def verify_authentication(
    user_id: str,
    credential_id: str,
    authenticator_data: str,
    client_data_json: str,
    signature: str,
    public_key: str,
    current_sign_count: int,
    rp_id: str = "fdt-frontend.onrender.com",
) -> Tuple[bool, Optional[dict]]:
    """
    Verify WebAuthn authentication assertion
    
    Args:
        user_id: User identifier
        credential_id: Credential ID used for authentication
        authenticator_data: Base64url-encoded authenticator data
        client_data_json: Base64url-encoded client data JSON
        signature: Base64url-encoded signature
        public_key: Base64url-encoded public key from registration
        current_sign_count: Current counter value from database
        rp_id: Relying party ID (domain)
    
    Returns:
        Tuple of (success: bool, new_sign_count: int or error_dict)
    """
    try:
        # Retrieve stored challenge
        challenge = retrieve_challenge(user_id, "authentication")
        if not challenge:
            return False, {"error": "Invalid or expired challenge"}
        
        # Verify authentication
        verification = verify_authentication_response(
            credential_id=base64url_to_bytes(credential_id),
            authenticator_data=base64url_to_bytes(authenticator_data),
            client_data_json=base64url_to_bytes(client_data_json),
            signature=base64url_to_bytes(signature),
            credential_public_key=base64url_to_bytes(public_key),
            origin="https://fdt-frontend.onrender.com",
            rp_id=rp_id,
            expected_challenge=base64url_to_bytes(challenge),
            credential_current_sign_count=current_sign_count,
        )
        
        # Return updated sign count
        return True, {
            "new_sign_count": verification.new_sign_count
        }
    
    except Exception as e:
        print(f"⚠ Authentication verification failed: {e}")
        return False, {"error": str(e)}
