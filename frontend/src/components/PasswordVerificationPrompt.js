import React, { useState, useRef } from 'react';
import { getAuthToken } from '../api';

const BACKEND_URL =
  process.env.REACT_APP_USER_BACKEND_URL ||
  process.env.REACT_APP_BACKEND_URL ||
  'http://localhost:8001';

const PasswordVerificationPrompt = ({ onSuccess, onCancel, username = '' }) => {
  const [password, setPassword] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState(null);
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const passwordInputRef = useRef(null);

  const MAX_ATTEMPTS = 3;
  const LOCKOUT_TIME = 5 * 60 * 1000; // 5 minutes

  const handlePasswordVerify = async (e) => {
    e.preventDefault();
    
    if (isLocked) {
      setError('Too many failed attempts. Try again in 5 minutes.');
      return;
    }

    if (!password.trim()) {
      setError('Please enter your password');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error('Session expired. Please log in again.');
      }

      // Verify password against backend
      const response = await fetch(`${BACKEND_URL}/api/user/verify-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          password: password
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 401) {
          // Invalid password
          const newAttempts = attempts + 1;
          setAttempts(newAttempts);
          setPassword('');

          if (newAttempts >= MAX_ATTEMPTS) {
            setIsLocked(true);
            setError('Too many failed attempts. Account locked for 5 minutes.');
            
            // Auto-unlock after lockout time
            setTimeout(() => {
              setIsLocked(false);
              setAttempts(0);
              setError(null);
              passwordInputRef.current?.focus();
            }, LOCKOUT_TIME);
          } else {
            const remaining = MAX_ATTEMPTS - newAttempts;
            setError(`Invalid password. ${remaining} attempt${remaining > 1 ? 's' : ''} remaining.`);
          }
          return;
        }

        throw new Error(errorData.detail || `Verification failed (${response.status})`);
      }

      const result = await response.json();
      console.log('✅ Password verified successfully');
      
      // Reset attempts on success
      setAttempts(0);
      setPassword('');

      // Call success callback
      if (onSuccess) {
        onSuccess(result);
      }

    } catch (err) {
      console.error('❌ Verification error:', err);
      const errorMsg = err.message || 'Verification failed. Please try again.';
      setError(errorMsg);
      setPassword('');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-3xl shadow-2xl w-full max-w-md p-8 border border-purple-500/30 animate-fade-in">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center mb-4 shadow-lg">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Verify Your Password</h2>
          <p className="text-purple-200 text-sm">For your security, please enter your password to continue</p>
        </div>

        {/* Form */}
        <form onSubmit={handlePasswordVerify} className="mb-6 space-y-4">
          {/* Username Display */}
          {username && (
            <div className="flex items-center bg-white/10 rounded-lg px-4 py-3 border border-white/20">
              <svg className="w-5 h-5 text-purple-300 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-white font-medium">{username}</span>
            </div>
          )}

          {/* Password Input */}
          <div>
            <label className="block text-white/80 text-sm mb-2 font-medium">Password</label>
            <input
              ref={passwordInputRef}
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error && !error.includes('Too many')) setError(null);
              }}
              placeholder="Enter your password"
              disabled={isVerifying || isLocked}
              autoFocus
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className={`rounded-lg p-3 text-sm ${
              isLocked 
                ? 'bg-red-500/20 border border-red-500/30 text-red-200' 
                : 'bg-yellow-500/20 border border-yellow-500/30 text-yellow-200'
            }`}>
              <div className="flex items-start">
                <svg className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* Verify Button */}
          <button
            type="submit"
            disabled={isVerifying || isLocked || !password.trim()}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-indigo-700 transition duration-200 shadow-lg flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isVerifying ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Verifying...
              </>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Verify Password
              </>
            )}
          </button>
        </form>

        {/* Cancel Button */}
        <button
          onClick={onCancel}
          disabled={isVerifying || isLocked}
          className="w-full text-purple-200 hover:text-white py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Try Biometric Again
        </button>

        {/* Security Note */}
        <div className="mt-6 pt-4 border-t border-white/20 text-center">
          <p className="text-xs text-purple-300">
            🔒 Your password is transmitted securely and never stored in plain text
          </p>
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
    </div>
  );
};

export default PasswordVerificationPrompt;
