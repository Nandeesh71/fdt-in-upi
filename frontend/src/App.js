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
import { NotificationProvider } from './components/NotificationSystem';
import cacheManager from './utils/cacheManager';
import sessionStorage from './utils/sessionStorageManager';

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

  useEffect(() => {
    // Restore session from storage on app load
    const restoreSession = async () => {
      try {
        const token = sessionStorage.getItem('fdt_token');
        const userData = sessionStorage.getItem('fdt_user');

        // Only restore if both token and user data exist
        if (token && userData) {
          // Check if token is expired
          if (isTokenExpired(token)) {
            console.warn('⚠ Token has expired, clearing session');
            sessionStorage.removeItem('fdt_token');
            sessionStorage.removeItem('fdt_user');
            
            // Show biometric prompt for re-authentication if credentials exist
            const hasCredentials = localStorage.getItem('fdt_credentials');
            if (hasCredentials && JSON.parse(hasCredentials).length > 0) {
              setShowBiometricPrompt(true);
            }
            setIsLoading(false);
            return;
          }

          setUser(userData);
          setIsAuthenticated(true);
          console.log('✓ Session restored from storage');
        } else {
          // No active session - check if user has biometric credentials
          const hasCredentials = localStorage.getItem('fdt_credentials');
          if (hasCredentials && JSON.parse(hasCredentials).length > 0) {
            setShowBiometricPrompt(true);
          }
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

  // Listen for logout events from API interceptor
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
    
    // Use robust storage that works on mobile
    sessionStorage.setItem('fdt_token', token);
    sessionStorage.setItem('fdt_user', userData);
    setUser(userData);
    setIsAuthenticated(true);
    setShowBiometricPrompt(false);
  };

  const handleBiometricSuccess = (result) => {
    console.log('🎉 Biometric login successful:', result);
    handleLogin(result.user, result.token);
  };

  const handleBiometricCancel = () => {
    setShowBiometricPrompt(false);
  };

  const handleLogout = () => {
    // Clear all cache when logging out
    cacheManager.clear();
    
    // Use robust storage that works on mobile
    sessionStorage.removeItem('fdt_token');
    sessionStorage.removeItem('fdt_user');
    setUser(null);
    setIsAuthenticated(false);
  };

  if (isLoading) {
    return <SplashScreen />;
  }

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="min-h-screen bg-gray-50">
        {/* Biometric Prompt Overlay */}
        {showBiometricPrompt && !isAuthenticated && (
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
