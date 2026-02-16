/**
 * Favorites Manager - manages saved transaction templates
 */

class FavoritesManager {
  constructor() {
    this.STORAGE_KEY = 'fdt_favorites';
    this.favorites = this.loadFavorites();
  }

  /**
   * Load favorites from localStorage
   */
  loadFavorites() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading favorites:', error);
      return [];
    }
  }

  /**
   * Save favorites to localStorage
   */
  saveFavorites() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.favorites));
    } catch (error) {
      console.error('Error saving favorites:', error);
    }
  }

  /**
   * Add a new favorite
   * @param {Object} favorite - { id, name, vpa, amount, remarks }
   */
  addFavorite(favorite) {
    const id = favorite.id || Date.now().toString();
    const newFavorite = {
      id,
      name: favorite.name || favorite.vpa,
      vpa: favorite.vpa,
      amount: favorite.amount || null,
      remarks: favorite.remarks || '',
      createdAt: favorite.createdAt || new Date().toISOString(),
      frequency: favorite.frequency || 0
    };

    // Check if favorite already exists
    const existingIndex = this.favorites.findIndex(f => f.vpa === newFavorite.vpa);
    if (existingIndex >= 0) {
      this.favorites[existingIndex] = newFavorite;
    } else {
      this.favorites.push(newFavorite);
    }

    this.saveFavorites();
    return newFavorite;
  }

  /**
   * Get all favorites
   */
  getFavorites() {
    return this.favorites.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Get favorite by ID
   */
  getFavoriteById(id) {
    return this.favorites.find(f => f.id === id);
  }

  /**
   * Get favorite by VPA
   */
  getFavoriteByVPA(vpa) {
    return this.favorites.find(f => f.vpa === vpa);
  }

  /**
   * Update a favorite
   */
  updateFavorite(id, updates) {
    const index = this.favorites.findIndex(f => f.id === id);
    if (index >= 0) {
      this.favorites[index] = { ...this.favorites[index], ...updates };
      this.saveFavorites();
      return this.favorites[index];
    }
    return null;
  }

  /**
   * Delete a favorite
   */
  deleteFavorite(id) {
    const index = this.favorites.findIndex(f => f.id === id);
    if (index >= 0) {
      this.favorites.splice(index, 1);
      this.saveFavorites();
      return true;
    }
    return false;
  }

  /**
   * Increment frequency for a favorite (track usage)
   */
  incrementFrequency(id) {
    const favorite = this.getFavoriteById(id);
    if (favorite) {
      favorite.frequency = (favorite.frequency || 0) + 1;
      this.saveFavorites();
    }
  }

  /**
   * Get most frequently used favorites
   */
  getFrequentFavorites(limit = 5) {
    return this.getFavorites().slice(0, limit);
  }

  /**
   * Search favorites by name or VPA
   */
  searchFavorites(query) {
    const lowerQuery = query.toLowerCase();
    return this.favorites.filter(f =>
      f.name.toLowerCase().includes(lowerQuery) ||
      f.vpa.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Clear all favorites
   */
  clearAll() {
    this.favorites = [];
    this.saveFavorites();
  }

  /**
   * Export favorites as JSON
   */
  export() {
    return JSON.stringify(this.favorites, null, 2);
  }

  /**
   * Import favorites from JSON
   */
  import(jsonString) {
    try {
      const imported = JSON.parse(jsonString);
      if (Array.isArray(imported)) {
        this.favorites = imported;
        this.saveFavorites();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error importing favorites:', error);
      return false;
    }
  }
}

// Create and export singleton instance
const favoritesManager = new FavoritesManager();

export default favoritesManager;
