// Use environment variables set by Render during build
const USER_API_BASE =
  process.env.REACT_APP_USER_BACKEND_URL || "http://localhost:8001";

const ADMIN_API_BASE =
  process.env.REACT_APP_ADMIN_BACKEND_URL || "http://localhost:8000";

export const userApi = axios.create({
  baseURL: USER_API_BASE,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

export const adminApi = axios.create({
  baseURL: ADMIN_API_BASE,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});
