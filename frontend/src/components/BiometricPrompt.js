import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authenticateWithBiometric, isPlatformAuthenticatorAvailable } from '../utils/webauthn';

const BiometricPrompt = ({ onSuccess, onCancel }) => {
  const navigate = useNavigate();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState(null);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    checkSupport();
  }, []);

  const checkSupport = async () => {
    const available = await isPlatformAuthenticatorAvailable();
    setIsSupported(available);
  };

  const handleBiometricAuth = async () => {
    setIsAuthenticating(true);
    setError(null);

    try {
      // Call backend immediately - no delays
      const result = await authenticateWithBiometric();
      
      if (onSuccess) {
        onSuccess(result);
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      console.error('Biometric auth error:', err);
      
      // Extract message safely
      const errMsg = typeof err === 'string' ? err : (err?.message || '');
      let errorMessage = 'Authentication failed';
      
      if (errMsg.includes('Invalid or expired challenge')) {
        errorMessage = 'Challenge expired. Please tap "Verify Biometric" again.';
      } else if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError')) {
        errorMessage = 'Cannot connect to server. Please check your connection.';
      } else if (errMsg.includes('not enabled')) {
        errorMessage = 'Biometric login not set up for this account. Please use password.';
      } else if (errMsg.includes('User cancelled') || errMsg.includes('cancelled')) {
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-3xl shadow-2xl w-full max-w-md p-8 border border-purple-500/30 animate-fade-in">
        <div className="text-center mb-6">
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center mb-4 shadow-lg">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Welcome Back!</h2>
          <p className="text-purple-200">Tap the button below to authenticate</p>
        </div>

        <div className="mb-6">
          {isAuthenticating ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4">
                <svg className="w-full h-full text-purple-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                </svg>
              </div>
              <p className="text-white font-semibold">Verifying Biometric...</p>
              <p className="text-sm text-purple-300 mt-2">Use your fingerprint or face</p>
            </div>
          ) : (
            <button
              onClick={handleBiometricAuth}
              disabled={isAuthenticating}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-4 rounded-lg font-semibold hover:from-purple-700 hover:to-indigo-700 transition duration-200 shadow-lg flex items-center justify-center space-x-3 disabled:opacity-50"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Verify Biometric</span>
            </button>
          )}
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/30 text-red-200 px-4 py-3 rounded-lg mb-4">
            <p className="text-sm font-medium">{error}</p>
            {error.includes('Challenge expired') && (
              <p className="text-xs mt-1 text-red-300">The authentication window timed out. Just tap the button again.</p>
            )}
          </div>
        )}

        <div className="pt-4 border-t border-white/20">
          <button
            onClick={onCancel}
            className="w-full text-purple-200 hover:text-white py-2 text-sm font-medium transition"
          >
            Use Password Instead
          </button>
        </div>

        <div className="mt-4 text-center">
          <p className="text-xs text-purple-300">
            Your biometric data never leaves your device
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default BiometricPrompt;
