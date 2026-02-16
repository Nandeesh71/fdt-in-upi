import React, { useState, useEffect } from 'react';
import {
  getRegisteredCredentials,
  revokeCredential,
  isPlatformAuthenticatorAvailable
} from '../utils/webauthn';
import BiometricSetup from './BiometricSetup';

const BiometricSettings = () => {
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSetup, setShowSetup] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    checkSupport();
    loadCredentials();
  }, []);

  const checkSupport = async () => {
    const available = await isPlatformAuthenticatorAvailable();
    setIsSupported(available);
  };

  const loadCredentials = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('📱 Loading biometric credentials...');
      const creds = await getRegisteredCredentials();
      console.log('📱 Credentials loaded:', creds);
      setCredentials(creds);
      console.log('✅ State updated with credentials');
    } catch (err) {
      console.error('❌ Error loading credentials:', err);
      setError('Failed to load biometric devices');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (credentialId, credentialName) => {
    if (!window.confirm(`Remove "${credentialName}" from trusted devices?`)) {
      return;
    }

    try {
      await revokeCredential(credentialId);
      // Reload credentials
      await loadCredentials();
    } catch (err) {
      console.error('Error revoking credential:', err);
      alert('Failed to remove device. Please try again.');
    }
  };

  const handleSetupComplete = () => {
    setShowSetup(false);
    loadCredentials();
  };

  if (showSetup) {
    return (
      <div className="p-6">
        <BiometricSetup
          onComplete={handleSetupComplete}
          onSkip={() => setShowSetup(false)}
        />
      </div>
    );
  }

  return (
    <div className="bg-white/10 backdrop-blur-xl rounded-lg shadow-md p-6 border border-white/20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-2xl font-bold text-white">Biometric Authentication</h3>
          <p className="text-purple-200 mt-1">Manage your fingerprint and Face ID devices</p>
        </div>
        {isSupported && (
          <button
            onClick={() => setShowSetup(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Device
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/30 text-red-200 px-4 py-3 rounded-lg mb-4">
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400"></div>
          <p className="text-purple-200 mt-4">Loading devices...</p>
        </div>
      ) : credentials.length === 0 ? (
        <div className="text-center py-12 bg-white/5 rounded-lg">
          <div className="text-6xl mb-4">🔐</div>
          <h4 className="text-lg font-semibold text-white mb-2">
            No Biometric Devices Registered
          </h4>
          <p className="text-purple-200 mb-6">
            Enable fingerprint or Face ID for faster, more secure logins
          </p>
          {isSupported && (
            <button
              onClick={() => setShowSetup(true)}
              className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Enable Biometric Login
            </button>
          )}
          {!isSupported && (
            <p className="text-sm text-purple-300">
              Your device doesn't support biometric authentication
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-4 mb-4">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-green-300 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-green-200 font-medium">
                Biometric login is enabled ({credentials.length} device{credentials.length !== 1 ? 's' : ''})
              </p>
            </div>
          </div>

          {credentials.map((cred) => (
            <div
              key={cred.credential_id}
              className="border border-white/20 bg-white/5 rounded-lg p-4 hover:bg-white/10 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4">
                  <div className="bg-indigo-500/20 rounded-lg p-3">
                    <svg className="w-6 h-6 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white text-lg">
                      {cred.credential_name || 'Unnamed Device'}
                    </h4>
                    <div className="text-sm text-purple-200 space-y-1 mt-2">
                      <p>
                        <span className="font-medium">Added:</span>{' '}
                        {new Date(cred.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                      <p>
                        <span className="font-medium">Last used:</span>{' '}
                        {new Date(cred.last_used).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                      <p>
                        <span className="font-medium">Status:</span>{' '}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          cred.is_active
                            ? 'bg-green-500/20 text-green-300'
                            : 'bg-gray-500/20 text-gray-300'
                        }`}>
                          {cred.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(cred.credential_id, cred.credential_name)}
                  className="text-red-400 hover:text-red-300 font-medium text-sm px-4 py-2 rounded-lg hover:bg-red-500/20 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}

          <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-4 mt-4">
            <h5 className="font-semibold text-blue-200 mb-2">Security Tips:</h5>
            <ul className="text-sm text-blue-200 space-y-1">
              <li>✓ Only register devices you personally own and control</li>
              <li>✓ Remove devices you no longer use or have access to</li>
              <li>✓ Each device is independently secured with its own biometric data</li>
              <li>✓ Biometric data never leaves your device</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default BiometricSettings;
