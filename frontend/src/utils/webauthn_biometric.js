/**
 * WebAuthn Biometric Authentication Utilities
 * Handles WebAuthn operations with production-grade error handling
 */

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8001';

/**
 * Base64URL encode
 */
function base64urlEncode(buffer) {
  if (typeof buffer === 'string') {
    buffer = new TextEncoder().encode(buffer);
  }
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64URL decode
 */
function base64urlDecode(str) {
  let padded = str;
  const padLength = (4 - (padded.length % 4)) % 4;
  padded += '='.repeat(padLength);
  
  const decoded = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) {
    bytes[i] = decoded.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Check if platform authenticator is available
 */
async function isPlatformAuthenticatorAvailable() {
  if (!window.PublicKeyCredential) {
    console.warn('WebAuthn not supported in this browser');
    return false;
  }

  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (error) {
    console.error('Error checking platform authenticator:', error);
    return false;
  }
}

/**
 * Get biometric registration options from server
 */
async function getRegistrationOptions(deviceName = null) {
  try {
    const token = localStorage.getItem('fdt_token');
    if (!token) {
      throw new Error('No authentication token. Please log in first.');
    }

    const response = await fetch(`${BASE_URL}/api/biometric/register/options`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        device_name: deviceName || 'Registered Device',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to get registration options');
    }

    const data = await response.json();
    if (data.status !== 'success') {
      throw new Error('Server returned error status');
    }

    return data.options;
  } catch (error) {
    console.error('Error getting registration options:', error);
    throw error;
  }
}

/**
 * Register biometric credential
 */
async function registerBiometricCredential(deviceName = null) {
  try {
    // Check if biometric is available
    const available = await isPlatformAuthenticatorAvailable();
    if (!available) {
      throw new Error('Biometric authentication not available on this device');
    }

    // Get challenge from server
    const options = await getRegistrationOptions(deviceName);

    // Convert challenge to buffer
    const optionsWithBuffers = {
      ...options,
      challenge: new Uint8Array(base64urlDecode(options.challenge)),
      user: {
        ...options.user,
        id: new Uint8Array(base64urlDecode(options.user.id)),
      },
    };

    // Create credential
    const credential = await navigator.credentials.create({
      publicKey: optionsWithBuffers,
    });

    if (!credential) {
      throw new Error('User cancelled registration or credential creation failed');
    }

    // Send verification to server
    const response = await fetch(`${BASE_URL}/api/biometric/register/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('fdt_token')}`,
      },
      body: JSON.stringify({
        credential_id: base64urlEncode(credential.id),
        attestation_object: base64urlEncode(credential.response.attestationObject),
        client_data_json: base64urlEncode(credential.response.clientDataJSON),
        device_name: deviceName || 'Registered Device',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Registration verification failed');
    }

    const data = await response.json();
    console.log('✅ Biometric registration successful');
    return data;
  } catch (error) {
    console.error('Biometric registration error:', error);
    throw error;
  }
}

/**
 * Get biometric login options
 */
async function getLoginOptions() {
  try {
    const response = await fetch(`${BASE_URL}/api/biometric/login/options`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to get login options');
    }

    const data = await response.json();
    return data.options;
  } catch (error) {
    console.error('Error getting login options:', error);
    throw error;
  }
}

/**
 * Authenticate with biometric
 */
async function authenticateWithBiometric() {
  try {
    // Check platform authenticator availability
    const available = await isPlatformAuthenticatorAvailable();
    if (!available) {
      throw new Error('Biometric authentication not available');
    }

    // Get challenge
    const options = await getLoginOptions();

    // Convert challenge to buffer
    const optionsWithBuffers = {
      ...options,
      challenge: new Uint8Array(base64urlDecode(options.challenge)),
    };

    // Get credential
    const credential = await navigator.credentials.get({
      publicKey: optionsWithBuffers,
    });

    if (!credential) {
      throw new Error('User cancelled authentication or credential not found');
    }

    // Send verification to server
    const response = await fetch(`${BASE_URL}/api/biometric/login/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        credential_id: base64urlEncode(credential.id),
        authenticator_data: base64urlEncode(credential.response.authenticatorData),
        client_data_json: base64urlEncode(credential.response.clientDataJSON),
        signature: base64urlEncode(credential.response.signature),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Authentication failed');
    }

    const data = await response.json();
    console.log('✅ Biometric login successful');
    
    // Store token and user data
    localStorage.setItem('fdt_token', data.token);
    localStorage.setItem('fdt_user', JSON.stringify(data.user));
    
    return data;
  } catch (error) {
    console.error('Biometric authentication error:', error);
    throw error;
  }
}

/**
 * Get biometric status
 */
async function getBiometricStatus() {
  try {
    const token = localStorage.getItem('fdt_token');
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${BASE_URL}/api/biometric/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to get status');
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting biometric status:', error);
    throw error;
  }
}

/**
 * Disable biometric
 */
async function disableBiometric(credentialId = null) {
  try {
    const token = localStorage.getItem('fdt_token');
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${BASE_URL}/api/biometric/disable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        credential_id: credentialId,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to disable biometric');
    }

    return await response.json();
  } catch (error) {
    console.error('Error disabling biometric:', error);
    throw error;
  }
}

/**
 * Verify biometric for transaction
 */
async function verifyBiometricForTransaction(txId, credentialId) {
  try {
    const token = localStorage.getItem('fdt_token');
    if (!token) {
      throw new Error('Not authenticated');
    }

    // Get challenge from server
    const challengeResponse = await fetch(`${BASE_URL}/api/biometric/transaction/challenge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ tx_id: txId }),
    });

    if (!challengeResponse.ok) {
      throw new Error('Failed to get transaction challenge');
    }

    const challengeData = await challengeResponse.json();
    const options = challengeData.options;

    // Convert challenge to buffer
    const optionsWithBuffers = {
      ...options,
      challenge: new Uint8Array(base64urlDecode(options.challenge)),
    };

    // Get assertion
    const credential = await navigator.credentials.get({
      publicKey: optionsWithBuffers,
    });

    if (!credential) {
      throw new Error('User cancelled biometric verification');
    }

    // Verify with server
    const verifyResponse = await fetch(`${BASE_URL}/api/biometric/transaction/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        tx_id: txId,
        credential_id: credentialId,
        authenticator_data: base64urlEncode(credential.response.authenticatorData),
        client_data_json: base64urlEncode(credential.response.clientDataJSON),
        signature: base64urlEncode(credential.response.signature),
      }),
    });

    if (!verifyResponse.ok) {
      const error = await verifyResponse.json();
      throw new Error(error.detail || 'Transaction verification failed');
    }

    return await verifyResponse.json();
  } catch (error) {
    console.error('Transaction verification error:', error);
    throw error;
  }
}

export {
  isPlatformAuthenticatorAvailable,
  registerBiometricCredential,
  authenticateWithBiometric,
  getBiometricStatus,
  disableBiometric,
  verifyBiometricForTransaction,
  base64urlEncode,
  base64urlDecode,
};
