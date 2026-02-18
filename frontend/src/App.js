import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import SplashScreen from './components/SplashScreen';
import LoginScreen from './components/LoginScreen';
import RegisterScreen from './components/RegisterScreen';
import Dashboard from './components/Dashboard';
import SendMoney from './components/SendMoney';
import TransactionHistory from './components/TransactionHistory';
import FraudAlertEnhanced from './components/FraudAlertEnhanced';
import RiskAnalysis from './components/RiskAnalysis';
import NotificationPanel from './components/NotificationPanel';
import BiometricPrompt from './components/BiometricPrompt';
import PasswordVerificationPrompt from './components/PasswordVerificationPrompt';
import ProfileScreen from './components/ProfileScreen';
import QRScanner from './components/QRScanner';
import { NotificationProvider } from './components/NotificationSystem';
import cacheManager from './utils/cacheManager';
// FIX: All storage now uses localStorage for JWT persistence across app restarts
// This enables biometric unlock - when user closes the app and reopens it,
// the JWT token is still available so biometric prompt can appear immediately

/**
 * Decode and validate JWT token expiry without verifying signature
 * (Signature verification happens on backend)
 */
const isTokenExpired = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;

    const decoded = JSON.parse(atob(parts[1]));
    const expiryTime = decoded.exp * 1000; // exp is in seconds
    const currentTime = Date.now();

    // Consider token expired if less than 1 minute remaining
    return currentTime > expiryTime - 60000;
  } catch (error) {
    console.warn('Could not decode token:', error);
    return true;
  }
};

function AppContent() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [requireBiometricAuth, setRequireBiometricAuth] = useState(false);

  useEffect(() => {
    // Restore session from storage on app load
    const restoreSession = async () => {
      try {
        // ── One-time migration: move tokens from sessionStorage → localStorage ──
        // Previous deploys stored tokens in sessionStorage which clears on browser close.
        // Migrate any surviving data so existing sessions aren't lost.
        ['fdt_token', 'fdt_user', 'fdt_credentials'].forEach(key => {
          if (!localStorage.getItem(key) && sessionStorage.getItem(key)) {
            localStorage.setItem(key, sessionStorage.getItem(key));
            sessionStorage.removeItem(key);
          }
        });

        // ✅ FIX: use localStorage for token persistence across app restart (biometric unlock)
        const token = localStorage.getItem('fdt_token');
        const userDataRaw = localStorage.getItem('fdt_user');
        const hasCredentials = localStorage.getItem('fdt_credentials');
        const credentialsArray = hasCredentials ? JSON.parse(hasCredentials) : [];

        // Check if user has biometric credentials registered
        const hasBiometricCredentials = credentialsArray && credentialsArray.length > 0;

        // CORRECT FLOW:
        // 1. Check if we have a valid token first
        // 2. Then decide whether to use biometric or direct login
        
        if (token && userDataRaw) {
          // We have token + user data from previous session
          let userData = userDataRaw;
          if (typeof userDataRaw === 'string') {
            try {
              userData = JSON.parse(userDataRaw);
            } catch (e) {
              console.error('Failed to parse stored user data:', e);
              localStorage.removeItem('fdt_user');
              localStorage.removeItem('fdt_token');
              setIsLoading(false);
              return;
            }
          }

          // Check if token is expired
          if (isTokenExpired(token)) {
            console.warn('⚠ Token has expired, clearing session');
            localStorage.removeItem('fdt_token');
            localStorage.removeItem('fdt_user');
            localStorage.removeItem('fdt_credentials');
            setIsLoading(false);
            return; // Show login screen (no token)
          }

          // ✅ Token is valid!
          // Now check if user has biometric credentials
          if (hasBiometricCredentials) {
            // User has biometric enrolled - show biometric prompt to verify identity
            console.log('✓ Valid token found + biometric credentials exist, showing biometric prompt');
            setRequireBiometricAuth(true);
            setShowBiometricPrompt(true);
            setIsLoading(false);
            return; // Wait for biometric verification
          } else {
            // User has valid token but no biometric - skip to dashboard
            console.log('✓ Session restored from storage (no biometric):', userData);
            setUser(userData);
            setIsAuthenticated(true);
            setIsLoading(false);
            return;
          }
        } else {
          // No token found - user must login
          console.log('ℹ No session/token found, showing login screen');
          setIsLoading(false);
          return;
        }
      } catch (error) {
        console.error('Error restoring session:', error);
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []);

  // Listen for logout events dispatched by the axios 401 interceptor in api.js
  useEffect(() => {
    const handleLogoutEvent = () => {
      console.log('🚪 Logout event received from API');
      setUser(null);
      setIsAuthenticated(false);
    };

    window.addEventListener('logout', handleLogoutEvent);
    return () => window.removeEventListener('logout', handleLogoutEvent);
  }, []);

  const handleLogin = (userData, token) => {
    // Clear all cache when logging in to prevent stale data
    cacheManager.clear();

    let parsedUser = userData;
    if (typeof userData === 'string') {
      try {
        parsedUser = JSON.parse(userData);
      } catch (e) {
        console.error('Failed to parse user data in handleLogin:', e);
        parsedUser = userData;
      }
    }

    // ✅ FIX: write to localStorage for persistence across app restarts.
    //         api.js interceptor reads from localStorage to attach token to requests.
    localStorage.setItem('fdt_token', token);
    localStorage.setItem('fdt_user', JSON.stringify(parsedUser));
    setUser(parsedUser);
    setIsAuthenticated(true);
    setShowBiometricPrompt(false);
  };

  const handleBiometricSuccess = (result) => {
    console.log('🎉 Biometric verification successful:', result);
    // Biometric verify is a lock-screen check — the JWT is already valid in localStorage.
    // Restore user/token from storage or from the verify response
    const storedToken = result?.token || localStorage.getItem('fdt_token');
    const storedUser  = result?.user ? result.user : JSON.parse(localStorage.getItem('fdt_user') || 'null');
    
    if (storedToken && storedUser) {
      setUser(storedUser);
      setIsAuthenticated(true);
    } else {
      console.warn('⚠️ No token/user after biometric success');
      setShowBiometricPrompt(false);
    }
    setShowBiometricPrompt(false);
    setRequireBiometricAuth(false);
  };

  const handleBiometricCancel = () => {
    // User clicked "Use Password Instead" - show password verification
    console.log('ℹ️ User requested password verification instead of biometric');
    setShowBiometricPrompt(false);
    setShowPasswordPrompt(true);
  };

  const handlePasswordVerificationSuccess = (result) => {
    console.log('✅ Password verification successful');
    setShowPasswordPrompt(false);
    setRequireBiometricAuth(false);
    
    // Get user from result or localStorage
    const userData = result?.user || JSON.parse(localStorage.getItem('fdt_user') || 'null');
    
    if (userData) {
      setUser(userData);
      setIsAuthenticated(true);
    } else {
      console.warn('⚠️ No user data after password verification');
      handleLogout();
    }
  };

  const handlePasswordVerificationCancel = () => {
    // User wants to go back to biometric
    console.log('ℹ️ User returned to biometric prompt');
    setShowPasswordPrompt(false);
    setShowBiometricPrompt(true);
  };

  const handleLogout = () => {
    // Clear all cache when logging out
    cacheManager.clear();

    // ✅ FIX: clear from localStorage (persistent storage layer)
    localStorage.removeItem('fdt_token');
    localStorage.removeItem('fdt_user');
    localStorage.removeItem('fdt_user_id');
    localStorage.removeItem('fdt_credentials');
    setUser(null);
    setIsAuthenticated(false);
  };

  if (isLoading) {
    return <SplashScreen />;
  }

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="min-h-screen bg-gray-50">
        {/* Biometric Prompt Overlay - Mandatory if requireBiometricAuth is true */}
        {showBiometricPrompt && (
          <BiometricPrompt
            onSuccess={handleBiometricSuccess}
            onCancel={handleBiometricCancel}
          />
        )}

        {/* Password Verification Prompt - Shows when user chooses password over biometric */}
        {showPasswordPrompt && (
          <PasswordVerificationPrompt
            onSuccess={handlePasswordVerificationSuccess}
            onCancel={handlePasswordVerificationCancel}
            username={user?.phone || user?.name || 'User'}
          />
        )}

        <Routes>
          <Route
            path="/login"
            element={
              isAuthenticated ? (
                <Navigate to="/dashboard" />
              ) : (
                <LoginScreen onLogin={handleLogin} />
              )
            }
          />
          <Route
            path="/send-money-login"
            element={
              isAuthenticated ? (
                <Navigate to="/send-money" />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/register"
            element={
              isAuthenticated ? (
                <Navigate to="/dashboard" />
              ) : (
                <RegisterScreen onRegister={handleLogin} />
              )
            }
          />
          <Route
            path="/dashboard"
            element={
              isAuthenticated ? (
                <Dashboard user={user} onLogout={handleLogout} />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/send-money"
            element={
              isAuthenticated ? (
                <SendMoney user={user} setUser={setUser} onLogout={handleLogout} />
              ) : (
                <Navigate to="/send-money-login" />
              )
            }
          />
          <Route
            path="/transactions"
            element={
              isAuthenticated ? (
                <TransactionHistory user={user} />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/profile"
            element={
              isAuthenticated ? (
                <ProfileScreen user={user} />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/scan-qr"
            element={
              isAuthenticated ? (
                <QRScanner />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/fraud-alert/:txId"
            element={
              isAuthenticated ? (
                <FraudAlertEnhanced user={user} />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/risk-analysis"
            element={
              isAuthenticated ? (
                <RiskAnalysis user={user} />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/"
            element={
              isAuthenticated ? (
                <Navigate to="/dashboard" />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
        </Routes>
        <NotificationPanel />
      </div>
    </Router>
  );
}

function App() {
  return (
    <NotificationProvider>
      <AppContent />
    </NotificationProvider>
  );
}

export default App;
