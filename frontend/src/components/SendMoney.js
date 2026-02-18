import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createTransaction, searchUsers } from '../api';
import { useNotifications } from './NotificationSystem';
import cacheManager from '../utils/cacheManager';
import errorHandler from '../utils/errorHandler';
import RecipientDropdown from './RecipientDropdown';
import TransactionResult from './TransactionResult';
import FavoritesModal from './FavoritesModal';

const SendMoney = ({ user, setUser, onBack, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [transactionResult, setTransactionResult] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showFavoritesModal, setShowFavoritesModal] = useState(false);
  const [recipientUser, setRecipientUser] = useState(null);

  const amountRef = useRef(null);
  const [formData, setFormData] = useState({
    recipient_vpa: '',
    amount: '',
    remarks: ''
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (location.state) {
      const { recipientPhone, scannedUPI, amount } = location.state;
      const recipientValue = scannedUPI || (recipientPhone ? `${recipientPhone}@upi` : '');
      if (recipientValue) {
        setFormData(prev => ({
          ...prev,
          recipient_vpa: recipientValue,
          amount: amount || ''
        }));
      }
    }
  }, []);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
    setRecipientUser(null);
  };

  const handleRecipientChange = async (value) => {
    setFormData(prev => ({ ...prev, recipient_vpa: value }));
    setError('');
    setRecipientUser(null);

    if (value.length >= 3) {
      try {
        const response = await searchUsers(value);
        if (response.status === 'success') {
          setSearchResults(response.results);
          setShowDropdown(true);
        } else {
          setSearchResults([]);
        }
      } catch {
        setSearchResults([]);
      }
    }
  };

  const validateForm = () => {
    if (!formData.recipient_vpa) {
      setError('Please enter a recipient UPI ID or phone number');
      return false;
    }
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setError('Please enter a valid amount greater than ₹0');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setError('');

    try {
      const response = await createTransaction({
        recipient_vpa: formData.recipient_vpa,
        amount: parseFloat(formData.amount),
        remarks: formData.remarks || 'Payment'
      });

      if (response.status === 'success' && response.transaction?.action === 'ALLOW') {
        const newBalance = user.balance - parseFloat(formData.amount);
        const updatedUser = { ...user, balance: newBalance };
        setUser(updatedUser);

        // ✅ FIX: was using localStorage — now uses window.sessionStorage
        //    to keep user data in sync with where api.js reads from.
        window.sessionStorage.setItem('fdt_user', JSON.stringify(updatedUser));
      }

      setTransactionResult({
        status: response.status,
        transaction: response.transaction,
        riskLevel: response.risk_level
      });

      cacheManager.invalidateCategory('dashboard');
      cacheManager.invalidateCategory('transactions');
    } catch (err) {
      const errorInfo = errorHandler.handleAPIError(err, 'Create Transaction');
      setError(errorInfo.message);
      addNotification({
        type: 'error',
        title: errorInfo.title,
        message: errorInfo.message
      });
    } finally {
      setLoading(false);
    }
  };

  if (transactionResult) {
    return (
      <TransactionResult
        result={transactionResult}
        onBack={() => setTransactionResult(null)}
        user={user}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 pb-20">
      {/* Animated background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-0 left-0 w-96 h-96 bg-purple-500 rounded-full filter blur-3xl opacity-20 animate-pulse"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-500 rounded-full filter blur-3xl opacity-20 animate-pulse delay-1000"></div>
      </div>

      {/* Header */}
      <div className="bg-black/20 backdrop-blur-xl border-b border-white/10 text-white p-6">
        <div className="flex items-center mb-2">
          <button
            onClick={() => navigate('/dashboard')}
            className="mr-4 text-purple-300 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold">Send Money</h1>
        </div>
      </div>

      {/* Form */}
      <div className="px-6 py-8">
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-xl p-6 border border-white/20">
          {error && (
            <div className="bg-red-500/20 border border-red-500/30 text-red-200 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Recipient */}
            <div className="relative">
              <label className="block text-sm font-medium text-purple-300 mb-2">
                Recipient UPI ID / Phone
              </label>
              <input
                type="text"
                name="recipient_vpa"
                value={formData.recipient_vpa}
                onChange={(e) => handleRecipientChange(e.target.value)}
                placeholder="phone@upi or +91XXXXXXXXXX"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                autoComplete="off"
              />
              {showDropdown && searchResults.length > 0 && (
                <RecipientDropdown
                  results={searchResults}
                  onSelect={(result) => {
                    setFormData(prev => ({ ...prev, recipient_vpa: result.upi_id }));
                    setRecipientUser(result);
                    setShowDropdown(false);
                  }}
                  onClose={() => setShowDropdown(false)}
                />
              )}
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-purple-300 mb-2">
                Amount (₹)
              </label>
              <input
                ref={amountRef}
                type="number"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                placeholder="0.00"
                min="1"
                step="0.01"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* Remarks */}
            <div>
              <label className="block text-sm font-medium text-purple-300 mb-2">
                Remarks (Optional)
              </label>
              <input
                type="text"
                name="remarks"
                value={formData.remarks}
                onChange={handleChange}
                placeholder="What's this for?"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* Favourites */}
            <button
              type="button"
              onClick={() => setShowFavoritesModal(true)}
              className="w-full py-2 text-purple-300 hover:text-white text-sm font-medium transition-colors"
            >
              ⭐ Choose from Favourites
            </button>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-4 rounded-xl font-semibold text-lg hover:from-green-700 hover:to-emerald-700 transition disabled:opacity-50 shadow-lg"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Processing...
                </span>
              ) : (
                `Send ₹${formData.amount || '0'}`
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Favourites Modal */}
      {showFavoritesModal && (
        <FavoritesModal
          onSelect={(fav) => {
            setFormData(prev => ({ ...prev, recipient_vpa: fav.upi_id }));
            setShowFavoritesModal(false);
          }}
          onClose={() => setShowFavoritesModal(false)}
        />
      )}
    </div>
  );
};

export default SendMoney;
