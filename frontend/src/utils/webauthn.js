/**
 * WebAuthn Utility Functions for Biometric Authentication
 * Handles fingerprint/Face ID enrollment and authentication
 */

/* eslint-disable no-undef */
const BACKEND_URL = process.env.REACT_APP_USER_BACKEND_URL || process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

// Check if we're on a devtunnel (development domain)
const isDevTunnel = () => {
  return window.location.hostname.includes('devtunnels.ms') || 
         window.location.hostname.includes('localhost') ||
         window.location.hostname === '127.0.0.1';
};

// WebAuthn doesn't work reliably on devtunnel domains on mobile
// It will work fine in production on real domains
const WEBAUTHN_AVAILABLE = !isDevTunnel();

/**
 * Check if WebAuthn is supported in the current browser
 */
export const isWebAuthnSupported = () => {
  if (!WEBAUTHN_AVAILABLE) {
    console.warn('ℹ️ WebAuthn not available on development domain. Works in production.');
    return false;
  }
  return typeof window !== 'undefined' && 
         window.PublicKeyCredential !== undefined && 
         navigator.credentials !== undefined;
};

/**
 * Check if platform authenticator (fingerprint/Face ID) is available
 */
export const isPlatformAuthenticatorAvailable = async () => {
  if (!isWebAuthnSupported()) return false;
  
  try {
    const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return available;
  } catch (error) {
    console.error('Error checking platform authenticator:', error);
    return false;
  }
};

/**
 * Convert base64url string to ArrayBuffer
 */
const base64urlToBuffer = (base64url) => {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

/**
 * Convert ArrayBuffer to base64url string
 */
const bufferToBase64url = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

/**
 * Register a new biometric credential
 * @param {string} deviceName - Optional name for the device
 * @returns {Promise<Object>} Registration result
 */
export const registerBiometric = async (deviceName = null) => {
  try {
    // Check if WebAuthn is supported
    if (!isWebAuthnSupported()) {
      throw new Error('WebAuthn is not supported in this browser');
    }

    // Check for platform authenticator
    const available = await isPlatformAuthenticatorAvailable();
    if (!available) {
      throw new Error('No biometric authenticator available on this device');
    }

    // Get authentication token
    const token = localStorage.getItem('fdt_token');
    console.log('🔐 Token check:', { hasToken: !!token, tokenLength: token?.length });
    if (!token) {
      throw new Error('User not authenticated - no token found in localStorage');
    }

    // Request challenge from server
    console.log('🔐 Requesting challenge from:', BACKEND_URL);
    const challengeResponse = await fetch(`${BACKEND_URL}/api/auth/register-challenge`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!challengeResponse.ok) {
      const errorData = await challengeResponse.json().catch(() => ({}));
      const errorMsg = errorData.detail || `HTTP ${challengeResponse.status} - Failed to get registration challenge`;
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
      challenge: base64urlToBuffer(challenge),
      rp: {
        name: 'FDT - Fraud Detection',
        id: window.location.hostname
      },
      user: {
        id: new TextEncoder().encode(user_id),
        name: user_id,
        displayName: user_id
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },  // ES256
        { alg: -257, type: 'public-key' } // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        requireResidentKey: false,
        userVerification: 'required'
      },
      timeout: 60000,
      attestation: 'none'
    };

    console.log('📱 Calling navigator.credentials.create()...');
    
    let credential;
    try {
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => {
          console.error('⏱️ WebAuthn timeout after 5 seconds');
          reject(new Error('WebAuthn request timed out - your device may not support this operation'));
        }, 5000)
      );
      
      // Race between credential creation and timeout
      credential = await Promise.race([
        navigator.credentials.create({
          publicKey: publicKeyCredentialCreationOptions
        }),
        timeoutPromise
      ]);
    } catch (e) {
      console.error('❌ navigator.credentials.create() failed:', e);
      throw e;
    }
    
    console.log('✅ Credential created successfully');

    if (!credential) {
      throw new Error('Credential creation failed');
    }

    console.log('🔐 Extracting credential data...');
    
    try {
      // Extract credential data
      const credentialId = bufferToBase64url(credential.rawId);
      console.log('✅ Credential ID:', credentialId.substring(0, 20) + '...');
      
      let publicKey;
      try {
        publicKey = bufferToBase64url(credential.response.getPublicKey());
        console.log('✅ Public key extracted:', publicKey.substring(0, 20) + '...');
      } catch (pkError) {
        console.warn('⚠️ getPublicKey() not available, using attestationObject');
        // Fallback: encode the entire attestation object
        const attestationObject = credential.response.attestationObject;
        publicKey = bufferToBase64url(new Uint8Array(attestationObject));
      }
      
      const aaguid = credential.response.getAuthenticatorData ? 
        bufferToBase64url(credential.response.getAuthenticatorData().slice(37, 53)) : null;
      console.log('✅ AAGUID:', aaguid);

      // Get transports if available
      const transports = credential.response.getTransports ? 
        credential.response.getTransports() : [];
      console.log('✅ Transports:', transports);

      // Register credential with server
      console.log('📤 Sending credential to server...');
      const registerResponse = await fetch(`${BACKEND_URL}/api/auth/register-credential`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          credential_id: credentialId,
          public_key: publicKey,
          device_name: deviceName,
          aaguid: aaguid,
          transports: transports
        })
      });

      console.log('📡 Server response status:', registerResponse.status);

      if (!registerResponse.ok) {
        const error = await registerResponse.json();
        console.error('❌ Server error:', error);
        throw new Error(error.detail || 'Failed to register credential');
      }
      
      const result = await registerResponse.json();
      console.log('✅ Credential registered successfully:', result);
    } catch (extractError) {
      console.error('❌ Error extracting credential:', extractError);
      throw extractError;
    }
    storedCredentials.push({
      id: credentialId,
      name: deviceName || result.credential.credential_name,
      created: new Date().toISOString()
    });
    localStorage.setItem('fdt_credentials', JSON.stringify(storedCredentials));

    return result;
  } catch (error) {
    console.error('❌ Biometric registration error:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code
    });
    throw error;
  }
};

/**
 * Authenticate using biometric credential
 * @param {string} phone - User's phone number
 * @returns {Promise<Object>} Authentication result with token
 */
export const authenticateWithBiometric = async (phone) => {
  try {
    // Check if WebAuthn is supported
    if (!isWebAuthnSupported()) {
      throw new Error('WebAuthn is not supported in this browser');
    }

    // Request challenge from server
    const challengeResponse = await fetch(`${BACKEND_URL}/api/auth/login-challenge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ phone })
    });

    if (!challengeResponse.ok) {
      const error = await challengeResponse.json();
      throw new Error(error.detail || 'Failed to get login challenge');
    }

    const { challenge, allowCredentials } = await challengeResponse.json();

    // Prepare credential request
    const publicKeyCredentialRequestOptions = {
      challenge: base64urlToBuffer(challenge),
      allowCredentials: allowCredentials.map(cred => ({
        id: base64urlToBuffer(cred.id),
        type: 'public-key',
        transports: ['internal', 'hybrid']
      })),
      userVerification: 'required',
      timeout: 60000
    };

    // Get credential
    const assertion = await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions
    });

    if (!assertion) {
      throw new Error('Authentication failed');
    }

    // Extract assertion data
    const credentialId = bufferToBase64url(assertion.rawId);
    const authenticatorData = bufferToBase64url(assertion.response.authenticatorData);
    const clientDataJSON = bufferToBase64url(assertion.response.clientDataJSON);
    const signature = bufferToBase64url(assertion.response.signature);
    const userHandle = assertion.response.userHandle ? 
      bufferToBase64url(assertion.response.userHandle) : null;

    // Send to server for verification
    const authResponse = await fetch(`${BACKEND_URL}/api/auth/authenticate-credential`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        credential_id: credentialId,
        authenticator_data: authenticatorData,
        client_data_json: clientDataJSON,
        signature: signature,
        user_handle: userHandle
      })
    });

    if (!authResponse.ok) {
      const error = await authResponse.json();
      throw new Error(error.detail || 'Authentication failed');
    }

    const result = await authResponse.json();

    // Store token and user data
    localStorage.setItem('fdt_token', result.token);
    localStorage.setItem('fdt_user', JSON.stringify(result.user));

    return result;
  } catch (error) {
    console.error('Biometric authentication error:', error);
    throw error;
  }
};

/**
 * Check if user has stored credentials
 * @returns {boolean}
 */
export const hasStoredCredentials = () => {
  const credentials = localStorage.getItem('fdt_credentials');
  return credentials && JSON.parse(credentials).length > 0;
};

/**
 * Get list of registered credentials from server
 * @returns {Promise<Array>}
 */
export const getRegisteredCredentials = async () => {
  try {
    const token = localStorage.getItem('fdt_token');
    if (!token) {
      throw new Error('User not authenticated');
    }

    console.log('🔑 Fetching registered credentials...');
    const response = await fetch(`${BACKEND_URL}/api/auth/credentials`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('📡 Response status:', response.status);

    if (!response.ok) {
      throw new Error('Failed to fetch credentials');
    }

    const data = await response.json();
    console.log('📋 Credentials data:', data);
    
    const credentials = data.credentials || [];
    console.log('✅ Loaded', credentials.length, 'credentials');
    
    return credentials;
  } catch (error) {
    console.error('❌ Error fetching credentials:', error);
    throw error;
  }
};

/**
 * Revoke a credential
 * @param {string} credentialId
 * @returns {Promise<Object>}
 */
export const revokeCredential = async (credentialId) => {
  try {
    const token = localStorage.getItem('fdt_token');
    if (!token) {
      throw new Error('User not authenticated');
    }

    const response = await fetch(`${BACKEND_URL}/api/auth/credentials/${credentialId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to revoke credential');
    }

    const result = await response.json();

    // Remove from local storage
    const storedCredentials = JSON.parse(localStorage.getItem('fdt_credentials') || '[]');
    const updated = storedCredentials.filter(c => c.id !== credentialId);
    localStorage.setItem('fdt_credentials', JSON.stringify(updated));

    return result;
  } catch (error) {
    console.error('Error revoking credential:', error);
    throw error;
  }
};
