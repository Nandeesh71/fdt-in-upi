import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { 
  isPlatformAuthenticatorAvailable, 
  getRegisteredCredentials,
  revokeCredential,
  registerBiometric 
} from '../utils/webauthn';
import { formatUPIId } from '../utils/helpers';
import BiometricSetup from './BiometricSetup';

const ProfileScreen = ({ user }) => {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Biometric states
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricCredentials, setBiometricCredentials] = useState([]);
  const [loadingBiometric, setLoadingBiometric] = useState(true);
  const [showBiometricSetup, setShowBiometricSetup] = useState(false);

  // Generate UPI ID from phone - use same formatting as Dashboard
  const upiId = user?.phone ? formatUPIId(user.phone) : 'user@upi';

  useEffect(() => {
    checkBiometricSupport();
    loadBiometricCredentials();
  }, []);

  const checkBiometricSupport = async () => {
    const available = await isPlatformAuthenticatorAvailable();
    setBiometricSupported(available);
  };

  const loadBiometricCredentials = async () => {
    try {
      setLoadingBiometric(true);
      const creds = await getRegisteredCredentials();
      setBiometricCredentials(creds || []);
    } catch (err) {
      console.error('Error loading biometric credentials:', err);
    } finally {
      setLoadingBiometric(false);
    }
  };

  const handleSaveName = async () => {
    if (!name.trim()) {
      setError('Name cannot be empty');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${process.env.REACT_APP_USER_BACKEND_URL || 'http://localhost:8001'}/api/user/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('fdt_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name })
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      const data = await response.json();
      
      // Update session storage
      const userData = JSON.parse(sessionStorage.getItem('fdt_user') || '{}');
      userData.name = name;
      sessionStorage.setItem('fdt_user', JSON.stringify(userData));
      
      setSuccess('Profile updated successfully!');
      setIsEditing(false);
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error updating profile:', err);
      setError('Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveBiometric = async (credentialId, deviceName) => {
    if (!window.confirm(`Remove "${deviceName}" from your account?`)) {
      return;
    }

    try {
      await revokeCredential(credentialId);
      await loadBiometricCredentials();
    } catch (err) {
      console.error('Error removing biometric:', err);
      alert('Failed to remove device. Please try again.');
    }
  };

  const handleBiometricSetupComplete = () => {
    setShowBiometricSetup(false);
    loadBiometricCredentials();
  };

  if (showBiometricSetup) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 pb-20">
        <div className="fixed inset-0 -z-10">
          <div className="absolute top-0 left-0 w-96 h-96 bg-purple-500 rounded-full filter blur-3xl opacity-20 animate-pulse"></div>
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-500 rounded-full filter blur-3xl opacity-20 animate-pulse delay-1000"></div>
        </div>

        <div className="bg-black/20 backdrop-blur-xl border-b border-white/10 text-white p-6 pb-8">
          <div className="flex items-center mb-4">
            <button
              onClick={() => setShowBiometricSetup(false)}
              className="mr-4 text-purple-300 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl font-bold">Add Biometric Device</h1>
          </div>
        </div>

        <div className="px-6 py-8">
          <BiometricSetup
            onComplete={handleBiometricSetupComplete}
            onSkip={() => setShowBiometricSetup(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 pb-20">
      {/* Animated background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-0 left-0 w-96 h-96 bg-purple-500 rounded-full filter blur-3xl opacity-20 animate-pulse"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-500 rounded-full filter blur-3xl opacity-20 animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-pink-500 rounded-full filter blur-3xl opacity-10 animate-pulse delay-500"></div>
      </div>

      {/* Header */}
      <div className="bg-black/20 backdrop-blur-xl border-b border-white/10 text-white p-6 pb-8">
        <div className="flex items-center mb-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="mr-4 text-purple-300 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold">My Profile</h1>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 -mt-4 space-y-6">
        {/* Profile Info Card */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-xl p-6 border border-white/20">
          <div className="flex items-center justify-center mb-6">
            <div className="w-24 h-24 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-lg">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/30 text-red-200 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-500/20 border border-green-500/30 text-green-200 px-4 py-3 rounded-lg mb-4">
              {success}
            </div>
          )}

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-purple-300 mb-2">Name</label>
              {isEditing ? (
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  autoFocus
                />
              ) : (
                <p className="text-white text-lg font-semibold">{user?.name || 'Not set'}</p>
              )}
            </div>

            {/* Phone (Read-only) */}
            <div>
              <label className="block text-sm font-medium text-purple-300 mb-2">Phone Number</label>
              <div className="flex items-center space-x-2">
                <p className="text-white text-lg font-semibold">{user?.phone || 'Not available'}</p>
                <span className="text-xs text-purple-300 bg-purple-500/20 px-2 py-1 rounded">Cannot be changed</span>
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-purple-300 mb-2">Email</label>
              <p className="text-white text-lg">{user?.email || 'Not set'}</p>
            </div>

            {/* Edit Button */}
            <div className="pt-4">
              {isEditing ? (
                <div className="flex space-x-3">
                  <button
                    onClick={handleSaveName}
                    disabled={saving}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-semibold transition disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setName(user?.name || '');
                      setError(null);
                    }}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-3 rounded-lg font-semibold transition"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-semibold transition flex items-center justify-center space-x-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span>Edit Profile</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* UPI QR Code Card */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-xl p-6 border border-white/20">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center">
            <svg className="w-6 h-6 mr-2 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            My Payment QR Code
          </h3>
          
          <div className="text-center">
            <div className="bg-white p-6 rounded-xl inline-block mb-4">
              <QRCodeSVG 
                value={`upi://pay?pa=${upiId}&pn=${encodeURIComponent(user?.name || 'User')}&cu=INR`}
                size={200}
                level="H"
                includeMargin={true}
              />
            </div>
            
            <div className="bg-purple-500/20 border border-purple-500/30 rounded-lg p-4">
              <p className="text-sm text-purple-300 mb-1">Your UPI ID</p>
              <p className="text-white font-mono text-lg font-semibold">{upiId}</p>
              <p className="text-xs text-purple-300 mt-2">Scan this QR code to pay you</p>
            </div>
          </div>
        </div>

        {/* Biometric Authentication Card */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-xl p-6 border border-white/20">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-white flex items-center">
              <svg className="w-6 h-6 mr-2 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Biometric Login
            </h3>
            {biometricSupported && biometricCredentials.length > 0 && (
              <button
                onClick={() => setShowBiometricSetup(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
              >
                Add Device
              </button>
            )}
          </div>

          {!biometricSupported ? (
            <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-4">
              <p className="text-yellow-200 text-sm">Biometric authentication is not available on this device.</p>
            </div>
          ) : loadingBiometric ? (
            <div className="text-center py-4">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
            </div>
          ) : biometricCredentials.length === 0 ? (
            <div className="text-center py-6">
              <svg className="w-16 h-16 mx-auto text-purple-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <p className="text-purple-200 mb-4">No biometric devices registered</p>
              <button
                onClick={() => setShowBiometricSetup(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-semibold transition"
              >
                Enable Biometric Login
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-3 mb-4">
                <p className="text-green-200 text-sm flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Biometric login enabled ({biometricCredentials.length} device{biometricCredentials.length !== 1 ? 's' : ''})
                </p>
              </div>

              {biometricCredentials.map((cred) => (
                <div
                  key={cred.credential_id}
                  className="border border-white/20 bg-white/5 rounded-lg p-4 hover:bg-white/10 transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className="bg-indigo-500/20 rounded-lg p-2">
                        <svg className="w-5 h-5 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-white font-semibold">{cred.credential_name || 'Unnamed Device'}</p>
                        <p className="text-xs text-purple-300 mt-1">
                          Added: {new Date(cred.created_at).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-purple-300">
                          Last used: {new Date(cred.last_used).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveBiometric(cred.credential_id, cred.credential_name)}
                      className="text-red-400 hover:text-red-300 text-sm font-medium px-3 py-1 rounded hover:bg-red-500/20 transition"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-xl p-6 border border-white/20">
          <h3 className="text-xl font-bold text-white mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate('/send-money')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-lg font-semibold transition flex flex-col items-center space-y-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              <span>Send Money</span>
            </button>
            <button
              onClick={() => navigate('/transactions')}
              className="bg-purple-600 hover:bg-purple-700 text-white py-4 rounded-lg font-semibold transition flex flex-col items-center space-y-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span>History</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileScreen;
