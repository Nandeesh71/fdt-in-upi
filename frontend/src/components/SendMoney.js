import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createTransaction, searchUsers } from '../api';
import { useNotifications } from './NotificationSystem';
import cacheManager from '../utils/cacheManager';
import favoritesManager from '../utils/favoritesManager';
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

  // Auto-fill from QR scanner
  useEffect(() => {
    if (location.state) {
      const { recipientPhone, scannedUPI, amount } = location.state;
      // Use the scanned UPI if available, otherwise use phone number
      const recipientValue = scannedUPI || (recipientPhone ? `${recipientPhone}@upi` : '');
      
      if (recipientValue) {
        setFormData(prev => ({
          ...prev,
          recipient_vpa: recipientValue,
          amount: amount || ''
        }));
        console.log('✓ Auto-filled from QR scan:', recipientValue);
      }
    }
    // Clear location state after reading it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
    setRecipientUser(null);
    setShowDropdown(false);
  };

  const handleRecipientChange = async (value) => {
    setFormData(prev => ({
      ...prev,
      recipient_vpa: value
    }));
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
       } catch (error) {
         // Silent fail for search - don't show error as user is still typing
         errorHandler.logError(error, 'Search Users');
         setSearchResults([]);
       }
     } else {
       setSearchResults([]);
       setShowDropdown(false);
     }
   };

  const handleRecipientSelect = (user) => {
    setRecipientUser(user);
    setFormData(prev => ({
      ...prev,
      recipient_vpa: user.upi_id
    }));
    setShowDropdown(false);
  };

  const formatAmount = (value) => {
    const cleaned = value.replace(/[^\d.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) return value;
    const integerPart = parts[0] || '';
    const decimalPart = parts[1] || '';
    return decimalPart.length > 2 ? integerPart + '.' + decimalPart.slice(0, 2) : cleaned;
  };

  const handleAmountChange = (e) => {
    const formatted = formatAmount(e.target.value);
    setFormData(prev => ({
      ...prev,
      amount: formatted
    }));
    setError('');
  };

  const validateForm = () => {
    // Validate recipient
    if (!formData.recipient_vpa) {
      setError('Please enter a recipient UPI ID or phone number');
      return false;
    }

    // Check if it's a phone number or UPI ID and validate accordingly
    const isPhoneNumber = /^\d{10}$/.test(formData.recipient_vpa.replace(/\D/g, ''));
    const isUPI = formData.recipient_vpa.includes('@');

    if (!isPhoneNumber && !isUPI) {
      const { error } = errorHandler.validatePhoneNumber(formData.recipient_vpa);
      if (!error) {
        const upiValidation = errorHandler.validateUPI(formData.recipient_vpa);
        if (!upiValidation.isValid) {
          setError(upiValidation.error);
          return false;
        }
      }
    }

    // Validate amount
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setError('Please enter a valid amount greater than ₹0');
      return false;
    }

    // Balance check disabled for fraud detection demo

    return true;
  };

const handleSubmit = async (e) => {
     e.preventDefault();
     
     if (!validateForm()) {
       return;
     }

     setLoading(true);
     setError('');
     
     try {
       const response = await createTransaction({
         recipient_vpa: formData.recipient_vpa,
         amount: parseFloat(formData.amount),
         remarks: formData.remarks || 'Payment'
       });

       // Update user balance only when the transaction is allowed
       if (response.status === 'success' && response.transaction?.action === 'ALLOW') {
         const newBalance = user.balance - parseFloat(formData.amount);
         const updatedUser = { ...user, balance: newBalance };
         setUser(updatedUser);
         localStorage.setItem('fdt_user', JSON.stringify(updatedUser));
       }

        // Set transaction result
        setTransactionResult({
          status: response.status,
          transaction: response.transaction,
          requiresConfirmation: response.requires_confirmation,
          riskLevel: response.risk_level,
          receiverUserId: response.receiver_user_id
        });

       // Clear cache
       cacheManager.invalidateCategory('dashboard');
       cacheManager.invalidateCategory('transactions');

      } catch (err) {
        // Use error handler for comprehensive error management
        const errorInfo = errorHandler.handleAPIError(err, 'Create Transaction');
        setError(errorInfo.message);
        
        addNotification({
          type: 'error',
          title: errorInfo.title,
          message: errorInfo.message,
          category: 'error'
        });
      } finally {
       setLoading(false);
      }
    };

  const handleSelectFavorite = (favorite) => {
    setFormData(prev => ({
      ...prev,
      recipient_vpa: favorite.vpa,
      amount: favorite.amount ? favorite.amount.toString() : '',
      remarks: favorite.remarks || ''
    }));
    setRecipientUser(null);
    if (amountRef.current && favorite.amount) {
      amountRef.current.focus();
    }
   };

   const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Show transaction result if available
  if (transactionResult) {
    return (
      <TransactionResult 
        result={transactionResult}
        onBack={() => setTransactionResult(null)}
        senderUser={user}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-green-900 to-slate-900">
      {/* Animated background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-0 left-0 w-96 h-96 bg-green-500 rounded-full filter blur-3xl opacity-20 animate-pulse"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-teal-500 rounded-full filter blur-3xl opacity-20 animate-pulse delay-1000"></div>
      </div>

       {/* Header */}
       <div className="bg-black/20 backdrop-blur-xl border-b border-white/10 text-white p-6">
         <div className="flex items-center justify-between">
           <div className="flex items-center">
            <button
              onClick={() => {
                if (onLogout) onLogout();
                navigate('/login');
              }}
              className="mr-4 p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
           <h1 className="text-2xl font-bold">Send Money</h1>
           </div>
           
           {/* Switch to Fraud Detection */}
           <button
             onClick={() => navigate('/dashboard')}
             className="flex items-center space-x-2 px-4 py-2 bg-purple-600/80 hover:bg-purple-600 text-white rounded-lg transition-colors"
           >
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m7 0a9 9 0 11-18 0 9 9 0 0118 0z" />
             </svg>
             <span className="text-sm font-medium">Fraud Detection</span>
           </button>
         </div>
       </div>

      {/* Form */}
      <div className="p-6">
        <div className="max-w-md mx-auto">
           {/* Transaction Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
             {/* Recipient UPI ID */}
             <div className="bg-white/10 backdrop-blur-xl rounded-xl p-5 border border-white/20 relative z-10">
               <label className="text-white/80 text-sm mb-2 block">Recipient</label>
               <div className="relative">
                <input
                  type="text"
                  name="recipient_vpa"
                  value={formData.recipient_vpa}
                  onChange={(e) => handleRecipientChange(e.target.value)}
                  placeholder="Phone number or UPI ID"
                  className="w-full bg-white/10 text-white placeholder-white/40 rounded-lg px-4 py-3 border border-white/20 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/50"
                  disabled={loading}
                  autoComplete="off"
                />
                
                <RecipientDropdown
                  show={showDropdown}
                  results={searchResults}
                  onSelect={handleRecipientSelect}
                  onClose={() => setShowDropdown(false)}
                />
              </div>
              
              {/* Show selected recipient info */}
              {recipientUser && (
                <div className="mt-3 bg-green-500/20 border border-green-500/30 px-3 py-2 rounded-lg">
                  <div className="flex items-center">
                    <svg className="w-4 h-4 text-green-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <div>
                      <div className="text-white font-semibold">{recipientUser.name}</div>
                      <div className="text-green-300 text-sm">{recipientUser.upi_id}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Amount */}
            <div className="bg-white/10 backdrop-blur-xl rounded-xl p-5 border border-white/20">
              <label className="text-white/80 text-sm mb-2 block">Amount (₹)</label>
              <input
                ref={amountRef}
                type="text"
                name="amount"
                value={formData.amount}
                onChange={handleAmountChange}
                placeholder="0.00"
                className="w-full bg-white/10 text-white placeholder-white/40 rounded-lg px-4 py-3 border border-white/20 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/50 text-2xl font-semibold"
                disabled={loading}
              />
              <div className="mt-3 flex space-x-3">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, amount: '500' }))}
                  className="px-3 py-1 bg-white/20 text-white/80 rounded-lg hover:bg-white/30 text-sm"
                  disabled={loading}
                >
                  ₹500
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, amount: '1000' }))}
                  className="px-3 py-1 bg-white/20 text-white/80 rounded-lg hover:bg-white/30 text-sm"
                  disabled={loading}
                >
                  ₹1,000
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, amount: '5000' }))}
                  className="px-3 py-1 bg-white/20 text-white/80 rounded-lg hover:bg-white/30 text-sm"
                  disabled={loading}
                >
                  ₹5,000
                </button>
              </div>
            </div>

            {/* Remarks */}
            <div className="bg-white/10 backdrop-blur-xl rounded-xl p-5 border border-white/20">
              <label className="text-white/80 text-sm mb-2 block">Remarks (Optional)</label>
              <input
                type="text"
                name="remarks"
                value={formData.remarks}
                onChange={handleChange}
                placeholder="Add a note..."
                className="w-full bg-white/10 text-white placeholder-white/40 rounded-lg px-4 py-3 border border-white/20 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/50"
                disabled={loading}
              />
             </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 gap-3">
                <button
                  type="button"
                  onClick={() => setShowFavoritesModal(true)}
                  className="flex items-center justify-center space-x-2 px-4 py-3 bg-yellow-600/80 hover:bg-yellow-600 text-white rounded-lg transition-colors text-sm font-medium"
                  disabled={loading}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  <span>Saved Recipients</span>
                </button>
              </div>

             {/* Error Message */}
            {error && (
              <div className="bg-red-500/20 backdrop-blur-xl border border-red-500/50 rounded-xl p-4">
                <div className="flex items-center">
                  <svg className="w-5 h-5 text-red-400 mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="text-red-100">{error}</span>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold py-4 rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Processing...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  Send Money
                </>
              )}
            </button>
          </form>

          {/* Security Info */}
          <div className="mt-6 p-4 bg-white/5 backdrop-blur-xl rounded-xl border border-white/10">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-purple-400 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div className="text-white/60 text-sm">
                <strong className="text-white/80">Protected by AI:</strong> All transactions are analyzed in real-time for fraud detection to keep your money safe.
              </div>
            </div>
          </div>
         </div>
       </div>
       
       {/* Favorites Modal */}
       <FavoritesModal
         isOpen={showFavoritesModal}
         onClose={() => setShowFavoritesModal(false)}
         onSelectFavorite={handleSelectFavorite}
         onAddNew={() => setShowFavoritesModal(false)}
       />
     </div>
   );
 };
 
 export default SendMoney;
