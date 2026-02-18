/**
 * WebAuthn Utility Functions for Biometric Authentication
 * Handles fingerprint / Face ID enrollment and authentication
 */

/* eslint-disable no-undef */
import { getAuthToken, setAuthToken, setStoredUser } from '../api';

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
 * Register a new biometric credential using the new production endpoint.
 * 
 * Step 1: Get registration options from backend
 * Step 2: Create credential on device
 * Step 3: Send attestation to backend for verification
 * 
 * @param {string|null} deviceName - Optional device name for credential
 * @returns {Promise<Object>}
 */
export const registerBiometric = async (deviceName = null) => {
  if (!isWebAuthnSupported()) throw new Error('WebAuthn is not supported in this browser');

  const available = await isPlatformAuthenticatorAvailable();
  if (!available) throw new Error('No biometric authenticator available on this device');

  // Read token from localStorage via the shared helper from api.js
  const token = getAuthToken();
  console.log('🔐 Token check:', { hasToken: !!token, tokenLength: token?.length });
  if (!token) throw new Error('User not authenticated – please log in again');

  try {
    // Step 1: Get registration options from the new production endpoint
    console.log('📱 Requesting biometric registration options from:', `${BACKEND_URL}/auth/biometric/register/options`);
    const optionsResponse = await fetch(`${BACKEND_URL}/auth/biometric/register/options`, {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${token}`, 
        'Content-Type': 'application/json' 
      }
    });

    if (!optionsResponse.ok) {
      const errorData = await optionsResponse.json().catch(() => ({}));
      const errorMsg = errorData.detail || `HTTP ${optionsResponse.status} – Failed to get registration options`;
      console.error('❌ Options endpoint error:', { status: optionsResponse.status, error: errorMsg });
      throw new Error(errorMsg);
    }

    const optionsData = await optionsResponse.json();
    const options = optionsData.options;

    console.log('✓ Received registration options with challenge:', options.challenge.substring(0, 20) + '...');

    // Convert challenge and user ID for credential creation
    const publicKeyOptions = {
      challenge: base64urlToBuffer(options.challenge),
      rp: { 
        id: options.rp.id, 
        name: options.rp.name 
      },
      user: {
        id: new TextEncoder().encode(options.user.id),
        email: options.user.email,
        name: options.user.name
      },
      pubKeyCredParams: options.pubKeyCredParams,
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'preferred'
      },
      timeout: options.timeout || 60000,
      attestation: options.attestation || 'direct'
    };

    // Step 2: Create credential on device (shows biometric prompt)
    console.log('🔐 Requesting biometric credential creation...');
    const credential = await navigator.credentials.create({
      publicKey: publicKeyOptions
    });

    if (!credential) {
      throw new Error('User cancelled biometric registration or credential creation failed');
    }

    console.log('✅ Credential created, credential ID:', bufferToBase64url(credential.id).substring(0, 20) + '...');

    // Step 3: Send attestation to backend for verification
    console.log('📤 Verifying credential with backend...');
    const verifyResponse = await fetch(`${BACKEND_URL}/auth/biometric/register/verify`, {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${token}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        credential_id: bufferToBase64url(credential.id),
        attestation_object: bufferToBase64url(credential.response.attestationObject),
        client_data_json: bufferToBase64url(credential.response.clientDataJSON),
        device_name: deviceName
      })
    });

    if (!verifyResponse.ok) {
      const error = await verifyResponse.json();
      throw new Error(error.detail || error.message || 'Credential verification failed');
    }

    const result = await verifyResponse.json();
    console.log('✅ Biometric credential registered successfully:', result);

    // Store credential record locally for reference
    const storedCredentials = JSON.parse(localStorage.getItem('fdt_credentials') || '[]');
    storedCredentials.push({
      id: bufferToBase64url(credential.id),
      name: deviceName || result.device_name,
      created: new Date().toISOString()
    });
    localStorage.setItem('fdt_credentials', JSON.stringify(storedCredentials));

    return result;
  } catch (error) {
    console.error('❌ Biometric registration failed:', error);
    throw error;
  }
};

// ─── Authentication ──────────────────────────────────────────────────────────
/**
 * Authenticate using the new production endpoint.
 * 
 * Step 1: Get authentication challenge from backend
 * Step 2: Request assertion from device (biometric prompt)
 * Step 3: Send assertion to backend for verification
 * 
 * @returns {Promise<Object>} result containing authentication status
 */
export const authenticateWithBiometric = async () => {
  if (!isWebAuthnSupported()) throw new Error('WebAuthn is not supported in this browser');

  try {
    // Step 1: Get authentication challenge
    console.log('📱 Requesting biometric authentication challenge...');
    const challengeResponse = await fetch(`${BACKEND_URL}/auth/biometric/authenticate/options`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!challengeResponse.ok) {
      const error = await challengeResponse.json();
      throw new Error(error.detail || 'Failed to get authentication challenge');
    }

    const challengeData = await challengeResponse.json();
    const options = challengeData.options;

    console.log('✓ Received authentication challenge:', options.challenge.substring(0, 20) + '...');

    // Convert challenge for assertion
    const publicKeyOptions = {
      challenge: base64urlToBuffer(options.challenge),
      timeout: options.timeout || 60000,
      userVerification: options.userVerification || 'preferred',
      mediation: 'optional'
    };

    // Step 2: Request assertion from device (shows biometric prompt)
    console.log('🔐 Requesting biometric authentication (device will prompt)...');
    const assertion = await navigator.credentials.get({
      publicKey: publicKeyOptions
    });

    if (!assertion) {
      throw new Error('User cancelled biometric authentication');
    }

    console.log('✓ Biometric verified, credential ID:', bufferToBase64url(assertion.id).substring(0, 20) + '...');

    // Step 3: Send assertion to backend for verification
    console.log('📤 Verifying assertion with backend...');
    const verifyResponse = await fetch(`${BACKEND_URL}/auth/biometric/authenticate/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credential_id: bufferToBase64url(assertion.id),
        authenticator_data: bufferToBase64url(assertion.response.authenticatorData),
        client_data_json: bufferToBase64url(assertion.response.clientDataJSON),
        signature: bufferToBase64url(assertion.response.signature)
      })
    });

    if (!verifyResponse.ok) {
      const error = await verifyResponse.json();
      throw new Error(error.detail || 'Authentication verification failed');
    }

    const result = await verifyResponse.json();
    console.log('✅ Biometric authentication successful');

    return result;
  } catch (error) {
    console.error('❌ Biometric authentication failed:', error);
    throw error;
  }
};


// ─── Credential Helpers ──────────────────────────────────────────────────────
/** Check if the user has any locally cached credentials */
export const hasStoredCredentials = () => {
  // FIX: read from localStorage to match where we now write them
  const credentials = localStorage.getItem('fdt_credentials');
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

  // FIX: remove from localStorage to match where we now write them
  const storedCredentials = JSON.parse(localStorage.getItem('fdt_credentials') || '[]');
  localStorage.setItem('fdt_credentials', JSON.stringify(storedCredentials.filter(c => c.id !== credentialId)));

  return result;
};
