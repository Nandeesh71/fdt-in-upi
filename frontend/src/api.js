// API utilities for backend communication
import axios from 'axios';
import cacheManager from './utils/cacheManager';

// ─── Environment / URL Configuration ────────────────────────────────────────
const USER_BACKEND_URL  = process.env.REACT_APP_USER_BACKEND_URL  || 'http://localhost:8001';
const ADMIN_BACKEND_URL = process.env.REACT_APP_ADMIN_BACKEND_URL || 'http://localhost:8000';
const API_BASE_URL = USER_BACKEND_URL;

if (process.env.NODE_ENV === 'development') {
  console.log('🔧 FDT API Configuration:');
  console.log('  User Backend URL :', USER_BACKEND_URL);
  console.log('  Admin Backend URL:', ADMIN_BACKEND_URL);
  console.log('  Environment      :', process.env.NODE_ENV);
  console.log('  Current Hostname :', window.location.hostname);
}

// ─── Token Helpers ───────────────────────────────────────────────────────────
// FIX: Centralise ALL token access here so every module reads/writes the same
//      key from the same storage layer.  webauthn.js was using localStorage
//      while api.js was using a sessionStorageManager wrapper – they never
//      saw each other's tokens.  We now use sessionStorage directly and export
//      helpers so webauthn.js (and any other file) can import them instead of
//      calling localStorage / sessionStorage directly.

export const TOKEN_KEY = 'fdt_token';
export const USER_KEY  = 'fdt_user';

export const getAuthToken  = ()        => sessionStorage.getItem(TOKEN_KEY);
export const setAuthToken  = (token)   => sessionStorage.setItem(TOKEN_KEY, token);
export const removeAuthToken = ()      => sessionStorage.removeItem(TOKEN_KEY);

export const getStoredUser  = ()       => {
  try { return JSON.parse(sessionStorage.getItem(USER_KEY)); }
  catch { return null; }
};
export const setStoredUser  = (user)   => sessionStorage.setItem(USER_KEY, JSON.stringify(user));
export const removeStoredUser = ()     => sessionStorage.removeItem(USER_KEY);

// ─── Axios Instance ──────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000
});

// Attach token to every request
api.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Global response handler
api.interceptors.response.use(
  (response) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ API Response:', response.config.url, response.status);
    }
    return response;
  },
  (error) => {
    if (process.env.NODE_ENV === 'development') {
      console.error('❌ API Error:', {
        url:        error.config?.url,
        method:     error.config?.method,
        status:     error.response?.status,
        statusText: error.response?.statusText,
        data:       error.response?.data,
        message:    error.message
      });
    }

    if (error.response?.status === 401) {
      console.warn('⚠ Received 401 – token invalid or expired');
      removeAuthToken();
      removeStoredUser();
      cacheManager.clear();
      window.dispatchEvent(new Event('logout'));
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

// ─── Auth APIs ───────────────────────────────────────────────────────────────
export const registerUser = async (userData) => {
  const response = await api.post('/api/register', userData);
  return response.data;
};

export const loginUser = async (credentials) => {
  const response = await api.post('/api/login', credentials);
  // FIX: persist token + user via the shared helpers so every module agrees
  if (response.data?.token) {
    setAuthToken(response.data.token);
  }
  if (response.data?.user) {
    setStoredUser(response.data.user);
  }
  return response.data;
};

/**
 * Validate JWT token with backend
 * 
 * Called on app load to check if stored JWT is still valid.
 * Returns {status: 'valid', user_id: ..., exp: ...} if valid
 * Throws 401 if invalid/expired
 */
export const validateToken = async () => {
  try {
    const response = await api.get('/auth/validate');
    return response.data;
  } catch (error) {
    // 401 will be caught by the response interceptor, but we can also throw here
    throw error;
  }
};

/**
 * Logout user by clearing tokens and user data
 */
export const logoutUser = async () => {
  removeAuthToken();
  removeStoredUser();
  cacheManager.clear();
  window.dispatchEvent(new Event('logout'));
};

// ─── User APIs ───────────────────────────────────────────────────────────────
export const getUserDashboard = async (forceRefresh = false) => {
  const cacheKey   = 'user_dashboard';
  const cachedData = forceRefresh ? null : cacheManager.get(cacheKey);
  if (cachedData) return cachedData;

  const response = await api.get('/api/user/dashboard');
  cacheManager.set(cacheKey, response.data, 'dashboard');
  return response.data;
};

export const getUserTransactions = async (limit = 20, statusFilter = null, forceRefresh = false) => {
  const params = { limit };
  if (statusFilter) params.status_filter = statusFilter;

  const cacheKey   = `transactions_${limit}_${statusFilter || 'all'}`;
  const cachedData = forceRefresh ? null : cacheManager.get(cacheKey);
  if (cachedData) return cachedData;

  const response = await api.get('/api/user/transactions', { params });
  cacheManager.set(cacheKey, response.data, 'transactions');
  return response.data;
};

// ─── Transaction APIs ────────────────────────────────────────────────────────
export const createTransaction  = async (transactionData) => (await api.post('/api/transaction', transactionData)).data;
export const submitUserDecision = async (decisionData)    => (await api.post('/api/user-decision', decisionData)).data;
export const confirmTransaction = async (txId)            => (await api.post('/api/transaction/confirm', { tx_id: txId })).data;
export const cancelTransaction  = async (txId)            => (await api.post('/api/transaction/cancel',  { tx_id: txId })).data;
export const getTransaction     = async (txId)            => (await api.get(`/api/transaction/${txId}`)).data;
export const searchUsers        = async (phone)           => (await api.get('/api/users/search', { params: { phone } })).data;
export const registerPushToken  = async (fcmToken, deviceId) =>
  (await api.post('/api/push-token', { fcm_token: fcmToken, device_id: deviceId })).data;
export const healthCheck        = async ()                => (await api.get('/api/health')).data;

export default api;
