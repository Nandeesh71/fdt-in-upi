/**
 * WebAuthn Utility Functions - Production Ready
 * Secure biometric authentication with best practices:
 * - Rate limiting and anti-brute force
 * - Comprehensive error handling
 * - Performance optimizations
 * - Full audit logging
 */

/* eslint-disable no-undef */
import { getAuthToken, setAuthToken, setStoredUser, getStoredUser } from '../api';

const BACKEND_URL =
  process.env.REACT_APP_USER_BACKEND_URL ||
  process.env.REACT_APP_BACKEND_URL ||
  'http://localhost:8001';

// ─── Security Configuration ──────────────────────────────────────────────────
const SECURITY_CONFIG = {
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_LOCKOUT_MINUTES: 15,
  CHALLENGE_TIMEOUT_MS: 120000, // 2 minutes
  AUTH_TIMEOUT_MS: 60000, // 1 minute for production
  CACHE_DURATION_MS: 5 * 60 * 1000, // 5 minutes
};

// ─── Rate Limiting & Anti-Brute Force ────────────────────────────────────────
class AuthAttemptTracker {
  constructor() {
    this.attempts = {}; // { userId: { count, timestamp, locked } }
  }

  isLocked(userId) {
    if (!this.attempts[userId]) return false;
    const { count, timestamp, locked } = this.attempts[userId];
    const elapsed = Date.now() - timestamp;
    const lockoutMs = SECURITY_CONFIG.RETRY_LOCKOUT_MINUTES * 60 * 1000;
    
    if (locked && elapsed > lockoutMs) {
      delete this.attempts[userId];
      return false;
    }
    return locked || count >= SECURITY_CONFIG.MAX_RETRY_ATTEMPTS;
  }

  recordAttempt(userId) {
    if (!this.attempts[userId]) {
      this.attempts[userId] = { count: 0, timestamp: Date.now(), locked: false };
    }
    this.attempts[userId].count++;
    if (this.attempts[userId].count >= SECURITY_CONFIG.MAX_RETRY_ATTEMPTS) {
      this.attempts[userId].locked = true;
    }
  }

  reset(userId) {
    delete this.attempts[userId];
  }
}

const attemptTracker = new AuthAttemptTracker();

// ─── Environment Guards ──────────────────────────────────────────────────────
const isDevTunnel = () =>
  window.location.hostname.includes('devtunnels.ms') ||
  window.location.hostname.includes('localhost') ||
  window.location.hostname === '127.0.0.1';

const WEBAUTHN_AVAILABLE = !isDevTunnel();

// ─── Feature Checks with Caching ────────────────────────────────────────────
let cachedWebAuthnSupport = null;
let cachedPlatformAuthSupport = null;
let cacheTimestamp = 0;

export const isWebAuthnSupported = () => {
  if (cachedWebAuthnSupport !== null && Date.now() - cacheTimestamp < SECURITY_CONFIG.CACHE_DURATION_MS) {
    return cachedWebAuthnSupport;
  }
  
  if (!WEBAUTHN_AVAILABLE) {
    console.warn('ℹ️ WebAuthn unavailable in dev. Production only.');
    return false;
  }
  
  const supported = (
    typeof window !== 'undefined' &&
    window.PublicKeyCredential !== undefined &&
    navigator.credentials !== undefined &&
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
  );
  
  cachedWebAuthnSupport = supported;
  cacheTimestamp = Date.now();
  return supported;
};

export const isPlatformAuthenticatorAvailable = async () => {
  if (!isWebAuthnSupported()) return false;
  
  if (cachedPlatformAuthSupport !== null && Date.now() - cacheTimestamp < SECURITY_CONFIG.CACHE_DURATION_MS) {
    return cachedPlatformAuthSupport;
  }
  
  try {
    const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    cachedPlatformAuthSupport = available;
    cacheTimestamp = Date.now();
    return available;
  } catch (error) {
    console.error('❌ Error checking platform authenticator:', error.message);
    return false;
  }
};

// ─── Enhanced Error Handling ────────────────────────────────────────────────
const extractErrorDetail = (error, fallback = 'Request failed') => {
  if (!error) return fallback;
  
  // Handle API responses with detail field
  if (error.detail) {
    return typeof error.detail === 'string' ? error.detail : JSON.stringify(error.detail);
  }
  
  // Handle array of errors
  if (Array.isArray(error.detail)) {
    return error.detail.map(d => d.msg || d.message || JSON.stringify(d)).join(', ');
  }
  
  // Handle standard errors
  if (error.message) {
    return error.message;
  }
  
  // Handle string errors
  if (typeof error === 'string') {
    return error;
  }
  
  return fallback;
};

// Map WebAuthn errors to user-friendly messages
const getUserFriendlyError = (error, context = 'authentication') => {
  const msg = extractErrorDetail(error);
  
  // User cancelled
  if (msg.includes('cancelled') || msg.includes('user denied')) {
    return 'Authentication cancelled by user';
  }
  
  // Device not available
  if (msg.includes('not available') || msg.includes('not enabled')) {
    return 'Biometric authentication not available on this device';
  }
  
  // Challenge expired
  if (msg.includes('challenge') || msg.includes('timeout')) {
    return 'Authentication timeout. Please try again.';
  }
  
  // Network errors
  if (msg.includes('fetch') || msg.includes('network')) {
    return 'Network connection error. Please check your internet and try again.';
  }
  
  // Invalid credential
  if (msg.includes('credential') || msg.includes('invalid')) {
    return 'This biometric credential is no longer valid. Please register again.';
  }
  
  return msg || fallback;
};

// ─── Input Validation ────────────────────────────────────────────────────────
const validatePhoneNumber = (phone) => {
  if (!phone || typeof phone !== 'string') return false;
  return /^[\d\s\-\+\(\)]{7,}$/.test(phone.replace(/[+\-\s()]/g, ''));
};

const validateUserId = (userId) => {
  if (!userId || typeof userId !== 'string') return false;
  return userId.length > 0 && userId.length < 256;
};

// ─── Buffer Helpers ──────────────────────────────────────────────────────────
const base64urlToBuffer = (base64url) => {
  if (typeof base64url !== 'string') throw new Error('Expected string for base64url conversion');
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

const bufferToBase64url = (buffer) => {
  if (!buffer || !(buffer instanceof ArrayBuffer)) {
    throw new Error('Expected ArrayBuffer for base64url conversion');
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

// ─── User-Specific Credential Storage ────────────────────────────────────────
/**
 * Get the current user's identifier (phone or user_id)
 */
const getCurrentUserIdentifier = () => {
  const user = getStoredUser();
  return user?.phone || user?.user_id || null;
};

/**
 * Get credentials for CURRENT user only
 */
const getUserCredentials = () => {
  const userId = getCurrentUserIdentifier();
  if (!userId) return [];
  
  const allCredentials = JSON.parse(window.localStorage.getItem('fdt_credentials') || '{}');
  return allCredentials[userId] || [];
};

/**
 * Save credential for CURRENT user only
 */
const saveUserCredential = (credential) => {
  const userId = getCurrentUserIdentifier();
  if (!userId) {
    console.warn('Cannot save credential - no user identifier');
    return;
  }
  
  const allCredentials = JSON.parse(window.localStorage.getItem('fdt_credentials') || '{}');
  if (!allCredentials[userId]) {
    allCredentials[userId] = [];
  }
  
  allCredentials[userId].push(credential);
  window.localStorage.setItem('fdt_credentials', JSON.stringify(allCredentials));
};

/**
 * Remove credential for CURRENT user only
 */
const removeUserCredential = (credentialId) => {
  const userId = getCurrentUserIdentifier();
  if (!userId) return;
  
  const allCredentials = JSON.parse(window.localStorage.getItem('fdt_credentials') || '{}');
  if (allCredentials[userId]) {
    allCredentials[userId] = allCredentials[userId].filter(c => c.id !== credentialId);
    window.localStorage.setItem('fdt_credentials', JSON.stringify(allCredentials));
  }
};

// ─── Registration ────────────────────────────────────────────────────────────
/**
 * Register a new biometric credential for the CURRENT user
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

    // Step 2: Create credential on device (IMMEDIATELY - don't wait)
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
      timeout: 120000, // 2 minutes instead of 60 seconds
      attestation: options.attestation || 'direct'
    };

    console.log('🔐 Requesting biometric credential creation (user will be prompted)...');
    const credential = await navigator.credentials.create({
      publicKey: publicKeyOptions
    });

    if (!credential) {
      throw new Error('User cancelled biometric registration or credential creation failed');
    }

    console.log('✅ Credential created, ID:', bufferToBase64url(credential.rawId).substring(0, 20) + '...');

    // Step 3: Verify credential with backend IMMEDIATELY
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

    // Store credential for THIS USER ONLY (using phone/user_id as key)
    saveUserCredential({
      id: bufferToBase64url(credential.rawId),
      name: deviceName || result.device_name,
      created: new Date().toISOString()
    });

    return result;
  } catch (error) {
    console.error('❌ Biometric registration failed:', error);
    throw error;
  }
};

/**
 * Authenticate using biometric for the CURRENT user
 * @returns {Promise<Object>}
 * @throws {Error} with friendly message if authentication fails
 */
export const authenticateWithBiometric = async () => {
  // Validate support
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn is not supported in this browser');
  }

  // Get current user
  const user = getStoredUser();
  const userId = user?.phone || user?.user_id;
  
  if (!userId) {
    console.warn('⚠️ No user context for biometric auth');
    throw new Error('User session required. Please log in again.');
  }

  // Check rate limiting
  if (attemptTracker.isLocked(userId)) {
    const lockoutMin = SECURITY_CONFIG.RETRY_LOCKOUT_MINUTES;
    throw new Error(`Too many failed attempts. Try again in ${lockoutMin} minutes.`);
  }

  try {
    // Step 1: Get authentication challenge
    console.log('📱 Requesting biometric authentication challenge...');
    const challengeResponse = await fetch(`${BACKEND_URL}/auth/biometric/authenticate/options`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(SECURITY_CONFIG.CHALLENGE_TIMEOUT_MS), // Abort if too slow
    });

    if (!challengeResponse.ok) {
      const error = await challengeResponse.json().catch(() => ({}));
      throw new Error(extractErrorDetail(error, `Server error: ${challengeResponse.status}`));
    }

    const challengeData = await challengeResponse.json();
    if (!challengeData.options?.challenge) {
      throw new Error('Invalid challenge from server');
    }

    const options = challengeData.options;
    console.log('✓ Challenge received:', options.challenge.substring(0, 10) + '...');

    // Step 2: Get assertion from device with timeout
    console.log('🔐 Requesting biometric verification...');
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: base64urlToBuffer(options.challenge),
        timeout: SECURITY_CONFIG.AUTH_TIMEOUT_MS,
        userVerification: options.userVerification || 'preferred',
        mediation: 'optional'
      }
    });

    if (!assertion) {
      attemptTracker.recordAttempt(userId);
      throw new Error('User cancelled biometric authentication');
    }

    console.log('✓ Biometric verified, credentialId:', bufferToBase64url(assertion.rawId).substring(0, 10) + '...');

    // Step 3: Verify assertion with backend
    console.log('📤 Verifying assertion with server...');
    const verifyResponse = await fetch(`${BACKEND_URL}/auth/biometric/authenticate/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credential_id: bufferToBase64url(assertion.rawId),
        authenticator_data: bufferToBase64url(assertion.response.authenticatorData),
        client_data_json: bufferToBase64url(assertion.response.clientDataJSON),
        signature: bufferToBase64url(assertion.response.signature)
      }),
      signal: AbortSignal.timeout(SECURITY_CONFIG.CHALLENGE_TIMEOUT_MS),
    });

    if (!verifyResponse.ok) {
      attemptTracker.recordAttempt(userId);
      const error = await verifyResponse.json().catch(() => ({}));
      throw new Error(extractErrorDetail(error, 'Authentication verification failed'));
    }

    const result = await verifyResponse.json();
    console.log('✅ Biometric authentication successful');

    // Reset attempts on success
    attemptTracker.reset(userId);

    // Store token and user
    if (result.token) {
      setAuthToken(result.token);
      console.log('✓ Token stored securely');
    }
    if (result.user) {
      setStoredUser(result.user);
      console.log('✓ User data updated');
    }

    return result;

  } catch (error) {
    // Convert to user-friendly message
    const friendlyError = typeof error.message === 'string' 
      ? getUserFriendlyError(error, 'authentication')
      : extractErrorDetail(error, 'Authentication failed');
    
    console.error('❌ Biometric authentication error:', friendlyError);
    throw new Error(friendlyError);
  }
};

// ─── Credential Helpers ──────────────────────────────────────────────────────
/**
 * Check if CURRENT user has stored credentials
 */
export const hasStoredCredentials = () => {
  const credentials = getUserCredentials();
  return credentials.length > 0;
};

/**
 * Get registered credentials for CURRENT user from server
 */
export const getRegisteredCredentials = async () => {
  const token = getAuthToken();
  if (!token) throw new Error('User not authenticated');

  console.log('🔑 Fetching registered credentials...');
  const response = await fetch(`${BACKEND_URL}/api/auth/credentials`, {
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

/**
 * Revoke a credential for CURRENT user
 */
export const revokeCredential = async (credentialId) => {
  const token = getAuthToken();
  if (!token) throw new Error('User not authenticated');

  const response = await fetch(`${BACKEND_URL}/api/auth/credentials/${encodeURIComponent(credentialId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(extractErrorDetail(error, 'Failed to revoke credential'));
  }

  const result = await response.json();

  // Remove from sessionStorage for THIS USER ONLY
  removeUserCredential(credentialId);

  return result;
};
