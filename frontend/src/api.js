// API utilities for backend communication
import axios from 'axios';
import cacheManager from './utils/cacheManager';
import sessionStorage from './utils/sessionStorageManager';

// Determine backend URL - with fallback for devtunnel deployments
const getBackendUrl = () => {
  // First, try environment variable
  if (process.env.REACT_APP_BACKEND_URL) {
    return process.env.REACT_APP_BACKEND_URL;
  }
  
  // If running on devtunnel domain, infer backend URL from current location
  if (window.location.hostname.includes('devtunnels.ms')) {
    // Extract the unique ID from devtunnel domain
    // e.g., "w1r757gb-8001.inc1.devtunnels.ms" -> infer backend is same domain but on 8001
    const devtunnelDomain = window.location.hostname;
    return `https://${devtunnelDomain}`;
  }
  
  // Default fallback for local development
  return 'http://localhost:8001';
};

const API_BASE_URL = getBackendUrl();

// Log the API URL being used
if (process.env.NODE_ENV === 'development') {
  console.log('🔧 FDT API Configuration:');
  console.log('  Backend URL:', API_BASE_URL);
  console.log('  Environment:', process.env.NODE_ENV);
  console.log('  REACT_APP_BACKEND_URL:', process.env.REACT_APP_BACKEND_URL);
  console.log('  Current Hostname:', window.location.hostname);
}


// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 30000 // 30 second timeout for better reliability on slow connections
});

// Add auth token to requests
api.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem('fdt_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle auth errors
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
        url: error.config?.url,
        method: error.config?.method,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
    }
    
    if (error.response?.status === 401) {
      // Token expired or invalid
      console.warn('⚠ Received 401 - token invalid or expired');
      sessionStorage.removeItem('fdt_token');
      sessionStorage.removeItem('fdt_user');
      cacheManager.clear();
      
      // Dispatch custom event so App component can respond
      window.dispatchEvent(new Event('logout'));
      
      // Only redirect if not already on login page
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth APIs
export const registerUser = async (userData) => {
  const response = await api.post('/api/register', userData);
  return response.data;
};

export const loginUser = async (credentials) => {
  const response = await api.post('/api/login', credentials);
  return response.data;
};

// User APIs
export const getUserDashboard = async (forceRefresh = false) => {
  const cacheKey = 'user_dashboard';
  const cachedData = forceRefresh ? null : cacheManager.get(cacheKey);
  
  if (cachedData) {
    return cachedData;
  }

  const response = await api.get('/api/user/dashboard');
  const data = response.data;
  cacheManager.set(cacheKey, data, 'dashboard');
  return data;
};

export const getUserTransactions = async (limit = 20, statusFilter = null, forceRefresh = false) => {
  const params = { limit };
  if (statusFilter) params.status_filter = statusFilter;
  
  const cacheKey = `transactions_${limit}_${statusFilter || 'all'}`;
  const cachedData = forceRefresh ? null : cacheManager.get(cacheKey);
  
  if (cachedData) {
    return cachedData;
  }

  const response = await api.get('/api/user/transactions', { params });
  const data = response.data;
  cacheManager.set(cacheKey, data, 'transactions');
  return data;
};

// Transaction APIs
export const createTransaction = async (transactionData) => {
  const response = await api.post('/api/transaction', transactionData);
  return response.data;
};

export const submitUserDecision = async (decisionData) => {
  const response = await api.post('/api/user-decision', decisionData);
  return response.data;
};

// Send Money specific APIs
export const searchUsers = async (phone) => {
  const response = await api.get('/api/users/search', { params: { phone } });
  return response.data;
};

export const confirmTransaction = async (txId) => {
  const response = await api.post('/api/transaction/confirm', { tx_id: txId });
  return response.data;
};

export const cancelTransaction = async (txId) => {
  const response = await api.post('/api/transaction/cancel', { tx_id: txId });
  return response.data;
};

export const getTransaction = async (txId) => {
  const response = await api.get(`/api/transaction/${txId}`);
  return response.data;
};

// Push notification APIs
export const registerPushToken = async (fcmToken, deviceId) => {
  const response = await api.post('/api/push-token', { fcm_token: fcmToken, device_id: deviceId });
  return response.data;
};

// Health check
export const healthCheck = async () => {
  const response = await api.get('/api/health');
  return response.data;
};

export default api;
