/**
 * WebAuthn Utility Functions for Biometric Authentication
 * Complete production-ready implementation with proper storage and endpoints
 */

/* eslint-disable no-undef */
import { getAuthToken, setAuthToken, setStoredUser } from '../api';

const BACKEND_URL =
  process.env.REACT_APP_USER_BACKEND_URL ||
  process.env.REACT_APP_BACKEND_URL ||
  'http://localhost:8001';

// ─── Environment Guards ──────────────────────────────────────────────────────
const isDevTunnel = () =>
  window.location.hostname.includes('devtunnels.ms') ||
  window.location.hostname.includes('localhost') ||
  window.location.hostname === '127.0.0.1';

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
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

const bufferToBase64url = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

const extractErrorDetail = (error, fallback = 'Request failed') => {
  const detail = error.detail || error.message;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail))
    return detail.map(d => d.msg || d.message || JSON.stringify(d)).join(', ');
  return fallback;
};

// ─── Registration ────────────────────────────────────────────────────────────
/**
 * Register a new biometric credential
 * @param {string|null} deviceName
 * @returns {Promise<Object>}
 */
export const registerBiometric = async (deviceName = null) => {
  if (!isWebAuthnSupported()) throw new Error('WebAuthn is not supported in this browser');

  const available = await isPlatformAuthenticatorAvailable();
  if (!available) throw new Error('No biometric authenticator available on this device');

  const token = getAuthToken();
  console.log('🔐 Token check:', { hasToken: !!token, tokenLength: token?.length });
  if (!token) throw new Error('User not authenticated – please log in again');

  try {
    // Step 1: Get registration options from backend
    console.log('📱 Requesting biometric registration options...');
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

    // Step 2: Create credential on device
    const publicKeyOptions = {
      challenge: base64urlToBuffer(options.challenge),
      rp: {
        id: options.rp.id,
        name: options.rp.name
      },
      user: {
        id: new TextEncoder().encode(options.user.id),
        name: options.user.name,
        displayName: options.user.displayName || options.user.name || 'User'
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

    console.log('🔐 Requesting biometric credential creation...');
    const credential = await navigator.credentials.create({
      publicKey: publicKeyOptions
    });

    if (!credential) {
      throw new Error('User cancelled biometric registration or credential creation failed');
    }

    console.log('✅ Credential created, ID:', bufferToBase64url(credential.rawId).substring(0, 20) + '...');

    // Step 3: Verify credential with backend
    console.log('📤 Verifying credential with backend...');
    const verifyResponse = await fetch(`${BACKEND_URL}/auth/biometric/register/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        credential_id: bufferToBase64url(credential.rawId),
        attestation_object: bufferToBase64url(credential.response.attestationObject),
        client_data_json: bufferToBase64url(credential.response.clientDataJSON),
        device_name: deviceName
      })
    });

    if (!verifyResponse.ok) {
      const error = await verifyResponse.json();
      throw new Error(extractErrorDetail(error, 'Credential verification failed'));
    }

    const result = await verifyResponse.json();
    console.log('✅ Biometric credential registered successfully:', result);

    // Store credential record in sessionStorage (not localStorage)
    const storedCredentials = JSON.parse(window.sessionStorage.getItem('fdt_credentials') || '[]');
    storedCredentials.push({
      id: bufferToBase64url(credential.rawId),
      name: deviceName || result.device_name,
      created: new Date().toISOString()
    });
    window.sessionStorage.setItem('fdt_credentials', JSON.stringify(storedCredentials));

    return result;
  } catch (error) {
    console.error('❌ Biometric registration failed:', error);
    throw error;
  }
};

// ─── Authentication ──────────────────────────────────────────────────────────
/**
 * Authenticate using biometric
 * @returns {Promise<Object>}
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
      throw new Error(extractErrorDetail(error, 'Failed to get authentication challenge'));
    }

    const challengeData = await challengeResponse.json();
    const options = challengeData.options;

    console.log('✓ Received authentication challenge:', options.challenge.substring(0, 20) + '...');

    // Step 2: Get assertion from device
    const publicKeyOptions = {
      challenge: base64urlToBuffer(options.challenge),
      timeout: options.timeout || 60000,
      userVerification: options.userVerification || 'preferred',
      mediation: 'optional'
    };

    console.log('🔐 Requesting biometric authentication...');
    const assertion = await navigator.credentials.get({
      publicKey: publicKeyOptions
    });

    if (!assertion) {
      throw new Error('User cancelled biometric authentication');
    }

    console.log('✓ Biometric verified, credential ID:', bufferToBase64url(assertion.rawId).substring(0, 20) + '...');

    // Step 3: Verify assertion with backend
    console.log('📤 Verifying assertion with backend...');
    const verifyResponse = await fetch(`${BACKEND_URL}/auth/biometric/authenticate/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credential_id: bufferToBase64url(assertion.rawId),
        authenticator_data: bufferToBase64url(assertion.response.authenticatorData),
        client_data_json: bufferToBase64url(assertion.response.clientDataJSON),
        signature: bufferToBase64url(assertion.response.signature)
      })
    });

    if (!verifyResponse.ok) {
      const error = await verifyResponse.json();
      throw new Error(extractErrorDetail(error, 'Authentication verification failed'));
    }

    const result = await verifyResponse.json();
    console.log('✅ Biometric authentication successful');

    // Store token and user via shared helpers (sessionStorage)
    if (result.token) setAuthToken(result.token);
    if (result.user) setStoredUser(result.user);

    return result;
  } catch (error) {
    console.error('❌ Biometric authentication failed:', error);
    throw error;
  }
};

// ─── Credential Helpers ──────────────────────────────────────────────────────
export const hasStoredCredentials = () => {
  const credentials = window.sessionStorage.getItem('fdt_credentials');
  return !!(credentials && JSON.parse(credentials).length > 0);
};

export const getRegisteredCredentials = async () => {
  const token = getAuthToken();
  if (!token) throw new Error('User not authenticated');

  console.log('🔑 Fetching registered credentials...');
  const response = await fetch(`${BACKEND_URL}/auth/biometric/credentials`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });

  console.log('📡 Response status:', response.status);
  if (!response.ok) throw new Error('Failed to fetch credentials');

  const data = await response.json();
  const credentials = data.credentials || [];
  console.log('✅ Loaded', credentials.length, 'credentials');
  return credentials;
};

export const revokeCredential = async (credentialId) => {
  const token = getAuthToken();
  if (!token) throw new Error('User not authenticated');

  const response = await fetch(`${BACKEND_URL}/auth/biometric/credentials/${encodeURIComponent(credentialId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(extractErrorDetail(error, 'Failed to revoke credential'));
  }

  const result = await response.json();

  // Remove from sessionStorage
  const storedCredentials = JSON.parse(window.sessionStorage.getItem('fdt_credentials') || '[]');
  window.sessionStorage.setItem('fdt_credentials', JSON.stringify(storedCredentials.filter(c => c.id !== credentialId)));

  return result;
};
