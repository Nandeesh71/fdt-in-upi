class CacheManager {
  constructor() {
    this.cache = new Map();
    this.currentUserId = null;
    this.cacheConfig = {
      transactions: {
        ttl: 10 * 60 * 1000, // 10 minutes - increased for better performance
        maxSize: 100
      },
      dashboard: {
        ttl: 5 * 60 * 1000, // 5 minutes - increased to reduce API calls
        maxSize: 50
      },
      userProfile: {
        ttl: 30 * 60 * 1000, // 30 minutes
        maxSize: 10
      },
      notifications: {
        ttl: 10 * 60 * 1000, // 10 minutes
        maxSize: 200
      }
    };
  }

  setCurrentUser(userId) {
    // If user changed, clear all user-specific cache
    if (this.currentUserId && this.currentUserId !== userId) {
      this.clearUserCache();
    }
    this.currentUserId = userId;
  }

  clearUserCache() {
    const keysToDelete = [];
    for (const [key, item] of this.cache.entries()) {
      // Clear dashboard and transaction cache which are user-specific
      if (['dashboard', 'transactions', 'userProfile'].includes(item.category)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  set(key, data, category = 'default') {
    const config = this.cacheConfig[category] || { ttl: 5 * 60 * 1000, maxSize: 50 };
    
    // Check if we need to evict old entries
    if (this.cache.size >= config.maxSize) {
      this.evictOldest(category);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      category,
      ttl: config.ttl
    });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    // Check if expired
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  invalidate(pattern) {
    const keysToDelete = [];
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  invalidateCategory(category) {
    const keysToDelete = [];
    for (const [key, item] of this.cache.entries()) {
      if (item.category === category) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  evictOldest(category) {
    let oldestKey = null;
    let oldestTimestamp = Date.now();

    for (const [cacheKey, item] of this.cache.entries()) {
      if (item.category === category && item.timestamp < oldestTimestamp) {
        oldestTimestamp = item.timestamp;
        oldestKey = cacheKey;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  clear() {
    this.cache.clear();
    this.currentUserId = null;
  }

  getStats() {
    const stats = {
      total: this.cache.size,
      byCategory: {}
    };

    for (const [, item] of this.cache.entries()) {
      if (!stats.byCategory[item.category]) {
        stats.byCategory[item.category] = 0;
      }
      stats.byCategory[item.category]++;
    }

    return stats;
  }
}

const cacheManager = new CacheManager();

export default cacheManager;