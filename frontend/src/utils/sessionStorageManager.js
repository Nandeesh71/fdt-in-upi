/**
 * Robust Session Storage Manager
 * ✅ FIXED: Now uses native sessionStorage (not localStorage) as primary store.
 *    This keeps it consistent with api.js which reads/writes window.sessionStorage.
 *    Previously this class used localStorage as its primary store, which meant
 *    tokens written here were invisible to api.js and vice versa.
 */
class SessionStorageManager {
  constructor() {
    this.storageType = this.detectStorageType();
    this.memoryData = {}; // In-memory fallback only
    console.log(`✅ Using storage type: ${this.storageType}`);
  }

  /**
   * Detect which storage mechanism is available
   * ✅ FIX: Test sessionStorage first (not localStorage)
   */
  detectStorageType() {
    try {
      const test = '__storage_test__';
      window.sessionStorage.setItem(test, test);
      window.sessionStorage.removeItem(test);
      return 'sessionStorage';
    } catch (e) {
      console.warn('⚠ sessionStorage unavailable, falling back to memory storage');
      return 'memory';
    }
  }

  /**
   * Set a value in the best available storage
   * ✅ FIX: writes to window.sessionStorage (was localStorage)
   */
  setItem(key, value) {
    try {
      // Store strings as-is, everything else as JSON
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      if (this.storageType === 'sessionStorage') {
        window.sessionStorage.setItem(key, serialized);
      } else {
        this.memoryData[key] = serialized;
      }
    } catch (error) {
      console.error(`❌ Failed to store ${key}:`, error);
      this.memoryData[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
  }

  /**
   * Get a value from the best available storage
   * ✅ FIX: reads from window.sessionStorage (was localStorage)
   */
  getItem(key) {
    try {
      let value;
      if (this.storageType === 'sessionStorage') {
        value = window.sessionStorage.getItem(key);
      } else {
        value = this.memoryData[key];
      }

      if (value === null || value === undefined) return null;

      // Try to parse as JSON; if it fails return raw string (e.g. JWT tokens)
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      console.error(`❌ Failed to retrieve ${key}:`, error);
      return null;
    }
  }

  /**
   * Remove a value from storage
   * ✅ FIX: removes from window.sessionStorage (was localStorage)
   */
  removeItem(key) {
    try {
      if (this.storageType === 'sessionStorage') {
        window.sessionStorage.removeItem(key);
      } else {
        delete this.memoryData[key];
      }
    } catch (error) {
      console.error(`❌ Failed to remove ${key}:`, error);
    }
  }

  /**
   * Clear all FDT session data
   * ✅ FIX: clears from window.sessionStorage (was localStorage)
   * Note: fdt_credentials is stored in localStorage for persistence
   */
  clear() {
    try {
      if (this.storageType === 'sessionStorage') {
        window.sessionStorage.removeItem('fdt_token');
        window.sessionStorage.removeItem('fdt_user');
        window.sessionStorage.removeItem('fdt_user_id');
      } else {
        this.memoryData = {};
      }
      // Always clear credentials from localStorage for consistency
      window.localStorage.removeItem('fdt_credentials');
    } catch (error) {
      console.error('❌ Failed to clear session data:', error);
    }
  }

  /**
   * Check if storage is available
   */
  isAvailable() {
    return this.storageType !== 'memory';
  }
}

// Create singleton instance
const sessionStorageManager = new SessionStorageManager();
export default sessionStorageManager;
