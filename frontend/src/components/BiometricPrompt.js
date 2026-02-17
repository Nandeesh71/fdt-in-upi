import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authenticateWithBiometric, isPlatformAuthenticatorAvailable } from '../utils/webauthn';

const BiometricPrompt = ({ onSuccess, onCancel }) => {
  const navigate = useNavigate();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState(null);
  const [isSupported, setIsSupported] = useState(false);
  const [phone, setPhone] = useState('');
  const [showPhoneInput, setShowPhoneInput] = useState(false);

  useEffect(() => {
    checkSupportAndAutoAuthenticate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkSupportAndAutoAuthenticate = async () => {
    const available = await isPlatformAuthenticatorAvailable();
    setIsSupported(available);
    
    if (available) {
      // Try to get saved phone number
      const savedPhone = localStorage.getItem('fdt_last_phone');
      if (savedPhone) {
        setPhone(savedPhone);
        // Auto-trigger biometric after a short delay
        setTimeout(() => {
          handleBiometricAuth(savedPhone);
        }, 500);
      } else {
        setShowPhoneInput(true);
      }
    }
  };

  const handleBiometricAuth = async (phoneNumber = phone) => {
    if (!phoneNumber) {
      setError('Please enter your phone number');
      setShowPhoneInput(true);
      return;
    }

    setIsAuthenticating(true);
    setError(null);

    try {
      const result = await authenticateWithBiometric(phoneNumber);
      
      // Save phone for next time
      localStorage.setItem('fdt_last_phone', phoneNumber);
      
      if (onSuccess) {
        onSuccess(result);
      } else {
        // Fallback navigation
        navigate('/dashboard');
      }
    } catch (err) {
      console.error('Biometric auth error:', err);
      
      let errorMessage = 'Authentication failed';
      
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        errorMessage = 'Cannot connect to server. Please check your connection.';
      } else if (err.message.includes('not enabled')) {
        errorMessage = 'Biometric login not set up for this account. Please use password.';
      } else if (err.message.includes('User cancelled') || err.message.includes('cancelled')) {
        errorMessage = 'Authentication cancelled';
      } else {
        errorMessage = err.message || errorMessage;
      }
      
      setError(errorMessage);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handlePhoneSubmit = (e) => {
    e.preventDefault();
    handleBiometricAuth();
  };

  if (!isSupported) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-3xl shadow-2xl w-full max-w-md p-8 border border-purple-500/30 animate-fade-in">
        <div className="text-center mb-6">
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center mb-4 shadow-lg animate-pulse-slow">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Welcome Back!</h2>
          <p className="text-purple-200">Use your fingerprint to login</p>
        </div>

        {showPhoneInput ? (
          <form onSubmit={handlePhoneSubmit} className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-purple-200 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setError(null);
                }}
                placeholder="+91XXXXXXXXXX"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white placeholder-purple-300 backdrop-blur-sm"
                required
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={isAuthenticating}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-indigo-700 transition duration-200 disabled:opacity-50 shadow-lg"
            >
              Continue with Fingerprint
            </button>
          </form>
        ) : (
          <div className="mb-6">
            {isAuthenticating ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4">
                  <svg className="w-full h-full text-purple-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                  </svg>
                </div>
                <p className="text-white font-semibold">Authenticating...</p>
                <p className="text-sm text-purple-300 mt-2">Touch your fingerprint sensor</p>
              </div>
            ) : (
              <button
                onClick={() => handleBiometricAuth()}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-4 rounded-lg font-semibold hover:from-purple-700 hover:to-indigo-700 transition duration-200 shadow-lg flex items-center justify-center space-x-3"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>Unlock with Fingerprint</span>
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-500/20 border border-red-500/30 text-red-200 px-4 py-3 rounded-lg mb-4">
            <p className="text-sm">{error}</p>
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

        @keyframes pulse-slow {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
        }

        .animate-pulse-slow {
          animation: pulse-slow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default BiometricPrompt;
