/**
 * BiometricSetup Component - Updated Version
 * Modal for registering biometric credentials (fingerprint/face)
 * Used on user dashboard after login
 */

import React, { useState, useEffect } from 'react';
import {
  isPlatformAuthenticatorAvailable,
  registerBiometricCredential,
} from '../utils/webauthn_biometric';

const BiometricSetup = ({ onComplete, onSkip }) => {
  const [isSupported, setIsSupported] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [error, setError] = useState(null);
  const [deviceName, setDeviceName] = useState('');
  const [checkingSupport, setCheckingSupport] = useState(true);

  useEffect(() => {
    checkSupport();
  }, []);

  const checkSupport = async () => {
    try {
      const available = await isPlatformAuthenticatorAvailable();
      setIsSupported(available);
      
      if (available) {
        // Generate default device name
        const now = new Date();
        const dateStr = now.toLocaleDateString();
        setDeviceName(`Device - ${dateStr}`);
      }
    } catch (err) {
      console.error('Error checking biometric support:', err);
      setIsSupported(false);
    } finally {
      setCheckingSupport(false);
    }
  };

  const handleEnroll = async () => {
    setIsEnrolling(true);
    setError(null);

    try {
      console.log('Starting biometric enrollment...');
      const result = await registerBiometricCredential(deviceName || 'Registered Device');
      
      console.log('Enrollment successful:', result);
      
      if (onComplete) {
        onComplete();
      }
    } catch (err) {
      console.error('Enrollment error:', err);
      
      // Parse error message
      const errMsg = typeof err === 'string' ? err : (err?.message || '');
      let errorMessage = 'Failed to enable biometric authentication';
      
      if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError')) {
        errorMessage = 'Cannot connect to server. Please check your internet connection.';
      } else if (errMsg.includes('not authenticated') || errMsg.includes('No authentication token')) {
        errorMessage = 'Please log in first before setting up biometric.';
      } else if (errMsg.includes('cancelled')) {
        errorMessage = 'Biometric enrollment cancelled';
      } else if (errMsg.includes('not available')) {
        errorMessage = 'Biometric authentication is not available on this device';
      } else if (errMsg.includes('timeout')) {
        errorMessage = 'Registration timed out. Please try again.';
      } else {
        errorMessage = errMsg || errorMessage;
      }
      
      setError(errorMessage);
    } finally {
      setIsEnrolling(false);
    }
  };

  if (checkingSupport) {
    return (
      <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
        <div className="text-center">
          <div className="animate-spin inline-block h-8 w-8 border-4 border-indigo-600 border-r-transparent rounded-full"></div>
          <p className="mt-4 text-gray-600">Checking biometric support...</p>
        </div>
      </div>
    );
  }

  if (!isSupported) {
    return (
      <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
        <div className="text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h3 className="text-xl font-semibold text-gray-800 mb-3">
            Biometric Not Available
          </h3>
          <p className="text-gray-600 mb-6">
            Your device doesn't support fingerprint or Face ID authentication.
            You can continue using password login.
          </p>
          <button
            onClick={onSkip}
            className="w-full bg-gray-500 text-white py-3 px-4 rounded-lg hover:bg-gray-600 transition-colors"
          >
            Continue with Password
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <div className="text-center mb-6">
        <div className="text-6xl mb-4">👆</div>
        <h3 className="text-2xl font-semibold text-gray-800 mb-2">
          Enable Biometric Login
        </h3>
        <p className="text-gray-600">
          Register your fingerprint or face for faster, secure authentication
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Device Name (Optional)
          </label>
          <input
            type="text"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="e.g., My iPhone, Work Laptop"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            disabled={isEnrolling}
            autoFocus
          />
          <p className="text-xs text-gray-500 mt-1">
            Helps you identify this device in security settings
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            <p className="text-sm">⚠️ {error}</p>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 mb-2">Benefits:</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>✓ Login in seconds with biometric</li>
            <li>✓ No need to remember passwords</li>
            <li>✓ More secure than passwords</li>
            <li>✓ 12-hour trusted device session</li>
          </ul>
        </div>

        <button
          onClick={handleEnroll}
          disabled={isEnrolling}
          className={`w-full py-3 px-4 rounded-lg text-white font-semibold transition-colors ${
            isEnrolling
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-700'
          }`}
        >
          {isEnrolling ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Registering...
            </span>
          ) : (
            'Register Biometric'
          )}
        </button>

        <button
          onClick={onSkip}
          disabled={isEnrolling}
          className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Skip for Now
        </button>

        <p className="text-xs text-gray-500 text-center">
          You can enable biometric later in Security Settings
        </p>
      </div>
    </div>
  );
};

export default BiometricSetup;
