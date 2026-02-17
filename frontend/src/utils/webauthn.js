/**
 * WebAuthn Utility Functions for Biometric Authentication
 * Handles fingerprint / Face ID enrollment and authentication
 */

/* eslint-disable no-undef */
import { getAuthToken, setAuthToken, setStoredUser, TOKEN_KEY } from '../api';

// FIX: derive the WebSocket / fetch base URL from the same env var that api.js
//      uses so there is a single source of truth.
const BACKEND_URL =
  process.env.REACT_APP_USER_BACKEND_URL ||
  process.env.REACT_APP_BACKEND_URL ||
  'http://localhost:8001';

// ─── Environment Guards ──────────────────────────────────────────────────────
const isDevTunnel = () =>
  window.location.hostname.includes('devtunnels.ms') ||
  window.location.hostname.includes('localhost') ||
  window.location.hostname === '127.0.0.1';

// WebAuthn doesn't work reliably on devtunnel / localhost on mobile.
const WEBAUTHN_AVAILABLE = !isDevTunnel();

// ─── Feature Checks ──────────────────────────────────────────────────────────
export const isWebAuthnSupported = () => {
  if (!WEBAUTHN_AVAILABLE) {
    console.warn('ℹ️ WebAuthn not available on development domain. Works in production.');
    return false;
  }
  return (
    typeof window !== 'undefined' &&
    window.PublicKeyCredential !== undefined &&
    navigator.credentials !== undefined
  );
};

export const isPlatformAuthenticatorAvailable = async () => {
  if (!isWebAuthnSupported()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (error) {
    console.error('Error checking platform authenticator:', error);
    return false;
  }
};

// ─── Buffer Helpers ──────────────────────────────────────────────────────────
const base64urlToBuffer = (base64url) => {
  const base64  = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen  = (4 - (base64.length % 4)) % 4;
  const padded  = base64 + '='.repeat(padLen);
  const binary  = atob(padded);
  const bytes   = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

const bufferToBase64url = (buffer) => {
  const bytes  = new Uint8Array(buffer);
  let binary   = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

// ─── Registration ────────────────────────────────────────────────────────────
/**
 * Register a new biometric credential.
 * @param {string|null} deviceName
 * @returns {Promise<Object>}
 */
export const registerBiometric = async (deviceName = null) => {
  if (!isWebAuthnSupported()) throw new Error('WebAuthn is not supported in this browser');

  const available = await isPlatformAuthenticatorAvailable();
  if (!available) throw new Error('No biometric authenticator available on this device');

  // FIX: read token through the shared helper (sessionStorage) instead of
  //      localStorage – previously the token was never found here because
  //      login stored it in sessionStorage via api.js but this file read
  //      localStorage, so the check always failed.
  const token = getAuthToken();
  console.log('🔐 Token check:', { hasToken: !!token, tokenLength: token?.length });
  if (!token) throw new Error('User not authenticated – please log in again');

  // Get registration challenge
  console.log('🔐 Requesting challenge from:', BACKEND_URL);
  const challengeResponse = await fetch(`${BACKEND_URL}/api/auth/register-challenge`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });

  if (!challengeResponse.ok) {
    const errorData = await challengeResponse.json().catch(() => ({}));
    const errorMsg  = errorData.detail || `HTTP ${challengeResponse.status} – Failed to get registration challenge`;
    console.error('Challenge endpoint error:', { status: challengeResponse.status, error: errorMsg });
    throw new Error(errorMsg);
  }

  const { challenge, user_id } = await challengeResponse.json();
  console.log('🔐 WebAuthn Registration Starting:', {
    hostname: window.location.hostname,
    challenge: challenge.substring(0, 20) + '...'
  });

  // Create credential
  const publicKeyCredentialCreationOptions = {
    challenge:   base64urlToBuffer(challenge),
    rp: { name: 'FDT – Fraud Detection', id: window.location.hostname },
    user: {
      id:          new TextEncoder().encode(user_id),
      name:        user_id,
      displayName: user_id
    },
    pubKeyCredParams: [
      { alg: -7,   type: 'public-key' },  // ES256
      { alg: -257, type: 'public-key' }   // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      requireResidentKey:      false,
      userVerification:        'required'
    },
    timeout:     60000,
    attestation: 'none'
  };

  console.log('📱 Calling navigator.credentials.create()...');

  let credential;
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('WebAuthn request timed out – your device may not support this operation')), 5000)
    );
    credential = await Promise.race([
      navigator.credentials.create({ publicKey: publicKeyCredentialCreationOptions }),
      timeoutPromise
    ]);
  } catch (e) {
    console.error('❌ navigator.credentials.create() failed:', e);
    throw e;
  }

  if (!credential) throw new Error('Credential creation failed');
  console.log('✅ Credential created successfully');

  // Extract and send credential data
  let result;
  try {
    const credentialId = bufferToBase64url(credential.rawId);
    console.log('✅ Credential ID:', credentialId.substring(0, 20) + '...');

    let publicKey;
    try {
      publicKey = bufferToBase64url(credential.response.getPublicKey());
    } catch {
      console.warn('⚠️ getPublicKey() not available, falling back to attestationObject');
      publicKey = bufferToBase64url(new Uint8Array(credential.response.attestationObject));
    }

    const aaguid = credential.response.getAuthenticatorData
      ? bufferToBase64url(credential.response.getAuthenticatorData().slice(37, 53))
      : null;

    const transports = credential.response.getTransports ? credential.response.getTransports() : [];

    console.log('📤 Sending credential to server...');
    const registerResponse = await fetch(`${BACKEND_URL}/api/auth/register-credential`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential_id: credentialId, public_key: publicKey, device_name: deviceName, aaguid, transports })
    });

    console.log('📡 Server response status:', registerResponse.status);
    if (!registerResponse.ok) {
      const error = await registerResponse.json();
      throw new Error(error.detail || 'Failed to register credential');
    }

    result = await registerResponse.json();
    console.log('✅ Credential registered successfully:', result);

    // FIX: persist local credential record to sessionStorage for consistency,
    //      and keep localStorage copy only as a non-auth cache (no token stored there).
    const storedCredentials = JSON.parse(sessionStorage.getItem('fdt_credentials') || '[]');
    storedCredentials.push({
      id:      credentialId,
      name:    deviceName || result.credential?.credential_name,
      created: new Date().toISOString()
    });
    sessionStorage.setItem('fdt_credentials', JSON.stringify(storedCredentials));

  } catch (extractError) {
    console.error('❌ Error extracting/sending credential:', extractError);
    throw extractError;
  }

  return result;
};

// ─── Authentication ──────────────────────────────────────────────────────────
/**
 * Authenticate using a stored biometric credential.
 * @param {string} phone
 * @returns {Promise<Object>} result containing token and user
 */
export const authenticateWithBiometric = async (phone) => {
  if (!isWebAuthnSupported()) throw new Error('WebAuthn is not supported in this browser');

  const challengeResponse = await fetch(`${BACKEND_URL}/api/auth/login-challenge`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ phone })
  });

  if (!challengeResponse.ok) {
    const error = await challengeResponse.json();
    throw new Error(error.detail || 'Failed to get login challenge');
  }

  const { challenge, allowCredentials } = await challengeResponse.json();

  const publicKeyCredentialRequestOptions = {
    challenge: base64urlToBuffer(challenge),
    allowCredentials: allowCredentials.map(cred => ({
      id:         base64urlToBuffer(cred.id),
      type:       'public-key',
      transports: ['internal', 'hybrid']
    })),
    userVerification: 'required',
    timeout:          60000
  };

  const assertion = await navigator.credentials.get({ publicKey: publicKeyCredentialRequestOptions });
  if (!assertion) throw new Error('Authentication failed');

  const credentialId      = bufferToBase64url(assertion.rawId);
  const authenticatorData = bufferToBase64url(assertion.response.authenticatorData);
  const clientDataJSON    = bufferToBase64url(assertion.response.clientDataJSON);
  const signature         = bufferToBase64url(assertion.response.signature);
  const userHandle        = assertion.response.userHandle ? bufferToBase64url(assertion.response.userHandle) : null;

  const authResponse = await fetch(`${BACKEND_URL}/api/auth/authenticate-credential`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ credential_id: credentialId, authenticator_data: authenticatorData, client_data_json: clientDataJSON, signature, user_handle: userHandle })
  });

  if (!authResponse.ok) {
    const error = await authResponse.json();
    throw new Error(error.detail || 'Authentication failed');
  }

  const result = await authResponse.json();

  // FIX: store token + user via shared helpers (sessionStorage) so the axios
  //      interceptor in api.js picks them up on subsequent requests.
  if (result.token) setAuthToken(result.token);
  if (result.user)  setStoredUser(result.user);

  return result;
};

// ─── Credential Helpers ──────────────────────────────────────────────────────
/** Check if the user has any locally cached credentials */
export const hasStoredCredentials = () => {
  // FIX: read from sessionStorage to match where we now write them
  const credentials = sessionStorage.getItem('fdt_credentials');
  return !!(credentials && JSON.parse(credentials).length > 0);
};

/**
 * Fetch the list of registered credentials from the server.
 * @returns {Promise<Array>}
 */
export const getRegisteredCredentials = async () => {
  // FIX: use shared helper – was hitting localStorage, finding nothing, and
  //      throwing 'User not authenticated' even when the user was logged in.
  const token = getAuthToken();
  if (!token) throw new Error('User not authenticated');

  console.log('🔑 Fetching registered credentials...');
  const response = await fetch(`${BACKEND_URL}/api/auth/credentials`, {
    method:  'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });

  console.log('📡 Response status:', response.status);
  if (!response.ok) throw new Error('Failed to fetch credentials');

  const data        = await response.json();
  const credentials = data.credentials || [];
  console.log('✅ Loaded', credentials.length, 'credentials');
  return credentials;
};

/**
 * Revoke a registered credential.
 * @param {string} credentialId
 * @returns {Promise<Object>}
 */
export const revokeCredential = async (credentialId) => {
  const token = getAuthToken();
  if (!token) throw new Error('User not authenticated');

  const response = await fetch(`${BACKEND_URL}/api/auth/credentials/${credentialId}`, {
    method:  'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to revoke credential');
  }

  const result = await response.json();

  // FIX: remove from sessionStorage to match where we now write them
  const storedCredentials = JSON.parse(sessionStorage.getItem('fdt_credentials') || '[]');
  sessionStorage.setItem('fdt_credentials', JSON.stringify(storedCredentials.filter(c => c.id !== credentialId)));

  return result;
};
