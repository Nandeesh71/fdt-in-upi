import React, { useState, useEffect } from 'react';
import { 
  isPlatformAuthenticatorAvailable, 
  authenticateWithBiometric,
  hasStoredCredentials 
} from '../utils/webauthn';

const BiometricLogin = ({ onSuccess, onFallbackToPassword }) => {
  const [isSupported, setIsSupported] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState(null);
  const [hasCredentials, setHasCredentials] = useState(false);

  useEffect(() => {
    checkSupport();
  }, []);

  const checkSupport = async () => {
    const available = await isPlatformAuthenticatorAvailable();
    const stored = hasStoredCredentials();
    setIsSupported(available);
    setHasCredentials(stored);
  };

  const handleBiometricLogin = async () => {
    setIsAuthenticating(true);
    setError(null);

    try {
      // Call backend immediately - no delays
      const result = await authenticateWithBiometric();
      
      if (onSuccess) {
        onSuccess(result);
      }
    } catch (err) {
      console.error('Biometric login error:', err);
      
      // Extract message safely
      const errMsg = typeof err === 'string' ? err : (err?.message || '');
      let errorMessage = 'Authentication failed';
      
      if (errMsg.includes('Invalid or expired challenge')) {
        errorMessage = 'Challenge expired. Please tap the button again.';
      } else if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError')) {
        errorMessage = 'Cannot connect to server. Please check your connection.';
      } else if (errMsg.includes('not enabled') || errMsg.includes('No biometric')) {
        errorMessage = 'Biometric login not set up for this account';
      } else if (errMsg.includes('cancelled') || errMsg.includes('User cancelled')) {
        errorMessage = 'Authentication cancelled';
      } else {
        errorMessage = errMsg || errorMessage;
      }
      
      setError(errorMessage);
    } finally {
      setIsAuthenticating(false);
    }
  };

  if (!isSupported) {
    return null;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          <p className="font-medium">{error}</p>
          {error.includes('Challenge expired') && (
            <p className="text-xs mt-1">Just tap "Login with Fingerprint" again.</p>
          )}
        </div>
      )}

      <button
        onClick={handleBiometricLogin}
        disabled={isAuthenticating}
        className={`w-full py-3 px-4 rounded-lg font-semibold transition-all ${
          isAuthenticating
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 shadow-lg'
        }`}
      >
        {isAuthenticating ? (
          <span className="flex items-center justify-center">
            <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Authenticating...
          </span>
        ) : (
          <span className="flex items-center justify-center">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Login with Fingerprint
          </span>
        )}
      </button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white text-gray-500">or</span>
        </div>
      </div>

      {onFallbackToPassword && (
        <button
          onClick={onFallbackToPassword}
          className="w-full text-indigo-600 hover:text-indigo-700 font-medium text-sm"
        >
          Use password instead
        </button>
      )}
    </div>
  );
};

export default BiometricLogin;
