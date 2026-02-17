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
import ProfileScreen from './components/ProfileScreen';
import QRScanner from './components/QRScanner';
import { NotificationProvider } from './components/NotificationSystem';
import cacheManager from './utils/cacheManager';
// ✅ REMOVED: import sessionStorage from './utils/sessionStorageManager';
// That import was shadowing native sessionStorage, causing api.js (which uses
// native sessionStorage) to never see the token written here. All storage
// calls now use window.sessionStorage explicitly to avoid any shadowing.

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
  const [requireBiometricAuth, setRequireBiometricAuth] = useState(false);

  useEffect(() => {
    // Restore session from storage on app load
    const restoreSession = async () => {
      try {
        // ✅ FIX: use window.sessionStorage explicitly (not the imported wrapper)
        const token = window.sessionStorage.getItem('fdt_token');
        const userDataRaw = window.sessionStorage.getItem('fdt_user');
        const hasCredentials = window.sessionStorage.getItem('fdt_credentials');
        const credentialsArray = hasCredentials ? JSON.parse(hasCredentials) : [];

        // Check if user has biometric credentials registered
        const hasBiometricCredentials = credentialsArray && credentialsArray.length > 0;

        // If biometric credentials exist, mandatory biometric auth on every app load
        if (hasBiometricCredentials) {
          setRequireBiometricAuth(true);
          setShowBiometricPrompt(true);
          setIsLoading(false);
          return; // Don't set authenticated yet - wait for biometric verification
        }

        // No biometric credentials - proceed with token-based auth
        if (token && userDataRaw) {
          let userData = userDataRaw;
          if (typeof userDataRaw === 'string') {
            try {
              userData = JSON.parse(userDataRaw);
            } catch (e) {
              console.error('Failed to parse stored user data:', e);
              window.sessionStorage.removeItem('fdt_user');
              window.sessionStorage.removeItem('fdt_token');
              setIsLoading(false);
              return;
            }
          }

          // Check if token is expired
          if (isTokenExpired(token)) {
            console.warn('⚠ Token has expired, clearing session');
            window.sessionStorage.removeItem('fdt_token');
            window.sessionStorage.removeItem('fdt_user');
            setIsLoading(false);
            return;
          }

          setUser(userData);
          setIsAuthenticated(true);
          console.log('✓ Session restored from storage:', userData);
        } else {
          console.log('ℹ No session data found in storage');
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

    // ✅ FIX: write to native window.sessionStorage so api.js interceptor
    //         (which reads window.sessionStorage) can find the token.
    window.sessionStorage.setItem('fdt_token', token);
    window.sessionStorage.setItem('fdt_user', JSON.stringify(parsedUser));
    setUser(parsedUser);
    setIsAuthenticated(true);
    setShowBiometricPrompt(false);
  };

  const handleBiometricSuccess = (result) => {
    console.log('🎉 Biometric login successful:', result);
    handleLogin(result.user, result.token);
    setRequireBiometricAuth(false);
  };

  const handleBiometricCancel = () => {
    // User cancelled biometric - if biometric was mandatory, keep them logged out
    if (requireBiometricAuth) {
      console.warn('⚠ Biometric authentication is required to access the app');
      setShowBiometricPrompt(true); // Force prompt again
      return;
    }
    setShowBiometricPrompt(false);
  };

  const handleLogout = () => {
    // Clear all cache when logging out
    cacheManager.clear();

    // ✅ FIX: clear from native window.sessionStorage
    window.sessionStorage.removeItem('fdt_token');
    window.sessionStorage.removeItem('fdt_user');
    window.sessionStorage.removeItem('fdt_user_id');
    window.sessionStorage.removeItem('fdt_credentials');
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
