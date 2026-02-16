import React, { useState } from 'react';
import favoritesManager from '../utils/favoritesManager';

const FavoritesModal = ({ isOpen, onClose, onSelectFavorite, onAddNew }) => {
  const [favorites, setFavorites] = useState(favoritesManager.getFavorites());
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFavorites = searchQuery.trim() 
    ? favoritesManager.searchFavorites(searchQuery)
    : favorites;

  const handleDeleteFavorite = (id) => {
    if (window.confirm('Delete this favorite?')) {
      favoritesManager.deleteFavorite(id);
      setFavorites(favoritesManager.getFavorites());
    }
  };

  const handleEditFavorite = (favorite) => {
    setEditingId(favorite.id);
    setEditName(favorite.name);
  };

  const handleSaveEdit = (id) => {
    if (editName.trim()) {
      favoritesManager.updateFavorite(id, { name: editName });
      setFavorites(favoritesManager.getFavorites());
      setEditingId(null);
    }
  };

  const handleSelectFavorite = (favorite) => {
    favoritesManager.incrementFrequency(favorite.id);
    onSelectFavorite(favorite);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-2xl p-6 max-w-2xl w-full mx-4 border border-white/20 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white flex items-center">
            <svg className="w-6 h-6 mr-2 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            Saved Recipients
          </h2>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="mb-4 relative">
          <input
            type="text"
            placeholder="Search favorites..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 pl-10 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
          />
          <svg className="absolute left-3 top-2.5 w-5 h-5 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Favorites List */}
        {filteredFavorites.length === 0 ? (
          <div className="text-center py-8">
            <svg className="w-12 h-12 mx-auto text-purple-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m0 0h6" />
            </svg>
            <p className="text-purple-300">No favorites saved yet</p>
            <p className="text-sm text-purple-400 mt-1">Add a new recipient to get started</p>
          </div>
        ) : (
          <div className="space-y-2 mb-6">
            {filteredFavorites.map((fav) => (
              <div
                key={fav.id}
                className="bg-white/10 hover:bg-white/20 rounded-lg p-4 flex items-center justify-between transition cursor-pointer group"
                onClick={() => handleSelectFavorite(fav)}
              >
                <div className="flex-1">
                  {editingId === fav.id ? (
                    <input
                      autoFocus
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-2 py-1 bg-white/20 border border-purple-400 rounded text-white focus:outline-none"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <p className="font-semibold text-white">{fav.name}</p>
                      <p className="text-sm text-purple-300">{fav.vpa}</p>
                      {fav.amount && (
                        <p className="text-xs text-purple-400">Amount: ₹{fav.amount.toLocaleString('en-IN')}</p>
                      )}
                      {fav.frequency > 0 && (
                        <p className="text-xs text-green-400">Used {fav.frequency} time{fav.frequency > 1 ? 's' : ''}</p>
                      )}
                    </>
                  )}
                </div>

                <div className="flex items-center space-x-2 ml-4" onClick={(e) => e.stopPropagation()}>
                  {editingId === fav.id ? (
                    <>
                      <button
                        onClick={() => handleSaveEdit(fav.id)}
                        className="p-2 text-green-400 hover:bg-green-400/20 rounded transition"
                        title="Save"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-2 text-gray-400 hover:bg-gray-400/20 rounded transition"
                        title="Cancel"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleEditFavorite(fav)}
                        className="p-2 text-blue-400 hover:bg-blue-400/20 rounded transition opacity-0 group-hover:opacity-100"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteFavorite(fav.id)}
                        className="p-2 text-red-400 hover:bg-red-400/20 rounded transition opacity-0 group-hover:opacity-100"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex space-x-3">
          <button
            onClick={() => {
              onAddNew();
              onClose();
            }}
            className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition flex items-center justify-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m0 0h6" />
            </svg>
            <span>Add New Recipient</span>
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition border border-white/20"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default FavoritesModal;
