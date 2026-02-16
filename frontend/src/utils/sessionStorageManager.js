/**
 * Robust Session Storage Manager
 * Works on mobile browsers with stricter storage policies
 * Falls back gracefully if localStorage is disabled or restricted
 */

class SessionStorageManager {
  constructor() {
    this.storageType = this.detectStorageType();
    this.sessionData = {}; // In-memory fallback
    console.log(`📱 Using storage type: ${this.storageType}`);
  }

  /**
   * Detect which storage mechanism is available
   */
  detectStorageType() {
    // Check if localStorage is available and writable
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return 'localStorage';
    } catch (e) {
      console.warn('⚠ localStorage unavailable, falling back to memory storage');
      return 'memory';
    }
  }

  /**
   * Set a value in the best available storage
   */
  setItem(key, value) {
    try {
      const serialized = JSON.stringify(value);

      if (this.storageType === 'localStorage') {
        localStorage.setItem(key, serialized);
      } else {
        this.sessionData[key] = serialized;
      }

      console.log(`✓ Stored ${key} in ${this.storageType}`);
    } catch (error) {
      console.error(`❌ Failed to store ${key}:`, error);
      // Fallback to memory
      this.sessionData[key] = JSON.stringify(value);
    }
  }

  /**
   * Get a value from the best available storage
   */
  getItem(key) {
    try {
      let value;

      if (this.storageType === 'localStorage') {
        value = localStorage.getItem(key);
      } else {
        value = this.sessionData[key];
      }

      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`❌ Failed to retrieve ${key}:`, error);
      return null;
    }
  }

  /**
   * Remove a value from storage
   */
  removeItem(key) {
    try {
      if (this.storageType === 'localStorage') {
        localStorage.removeItem(key);
      } else {
        delete this.sessionData[key];
      }

      console.log(`✓ Removed ${key} from ${this.storageType}`);
    } catch (error) {
      console.error(`❌ Failed to remove ${key}:`, error);
    }
  }

  /**
   * Clear all session data
   */
  clear() {
    try {
      if (this.storageType === 'localStorage') {
        // Clear only FDT-related items
        localStorage.removeItem('fdt_token');
        localStorage.removeItem('fdt_user');
      } else {
        this.sessionData = {};
      }

      console.log(`✓ Cleared session data from ${this.storageType}`);
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
const sessionStorage = new SessionStorageManager();

export default sessionStorage;
