import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import favoritesManager from '../utils/favoritesManager';

const TransactionResult = ({ result, onBack, senderUser }) => {
  const navigate = useNavigate();

  // Auto-save recipient if transaction is ALLOW
  useEffect(() => {
    if (result.status === 'success' && !result.requiresConfirmation && result.transaction) {
      try {
        const newFavorite = {
          name: result.transaction.recipient_vpa,
          vpa: result.transaction.recipient_vpa,
          amount: result.transaction.amount ? parseFloat(result.transaction.amount) : null,
          remarks: ''
        };
        favoritesManager.addFavorite(newFavorite);
        console.log(`✓ Auto-saved recipient: ${result.transaction.recipient_vpa}`);
      } catch (error) {
        console.error('Error auto-saving recipient:', error);
      }
    }
  }, [result]);

  const getStatusIcon = () => {
    if (result.status === 'success' && !result.requiresConfirmation) {
      return (
        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      );
    }
    
    if (result.requiresConfirmation) {
      return (
        <div className="w-16 h-16 bg-yellow-500 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 3.161-3.158a4.822 4.822 0 00-2.094-2.327A4.972 4.972 0 0012 17c-1.775 0-3.39-.602-4.493-1.603" />
          </svg>
        </div>
      );
    }
    
    return (
      <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center">
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    );
  };

   const getStatusMessage = () => {
    if (result.status === 'success' && !result.requiresConfirmation) {
      return {
        title: 'Payment Successful!',
        message: `₹${parseFloat(result.transaction.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })} sent successfully to ${result.transaction.recipient_vpa}`,
        subtitle: 'Your payment has been completed and the recipient should receive the funds shortly.',
        type: 'success'
      };
    }
    
    if (result.transaction?.action === 'BLOCK') {
      return {
        title: 'Transaction Blocked',
        message: `Your transaction of ₹${parseFloat(result.transaction.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })} to ${result.transaction.recipient_vpa} has been blocked.`,
        subtitle: 'For security reasons, this transaction cannot be processed. Please contact support for assistance.',
        type: 'error'
      };
    }
    
    if (result.requiresConfirmation) {
      return {
        title: 'Transaction Pending Review',
        message: `Your transaction of ₹${parseFloat(result.transaction.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })} has been delayed for security review.`,
        subtitle: `Risk Level: ${result.riskLevel?.toUpperCase() || 'MEDIUM'}. Please confirm this transaction in your fraud detection interface.`,
        type: 'warning'
      };
    }
    
    return {
      title: 'Transaction Failed',
      message: 'Your transaction could not be processed at this time.',
      subtitle: 'Please check your account and try again.',
      type: 'error'
    };
  };

  const message = getStatusMessage();

  const handleGoToDashboard = () => {
    navigate('/dashboard');
  };

  const handleGoToFraudInterface = () => {
    navigate(`/fraud-alert/${result.transaction.tx_id}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-green-900 to-slate-900">
      {/* Header */}
      <div className="bg-white/10 backdrop-blur-sm border-b border-white/20">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={onBack}
              className="text-green-200 hover:text-white flex items-center"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <h1 className="text-xl font-bold text-white ml-4">Transaction Result</h1>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex items-center justify-center min-h-screen py-12">
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-md p-8 border border-white/20">
          {/* Status icon and message */}
          <div className="text-center mb-8">
            {getStatusIcon()}
            <h2 className={`text-2xl font-bold mt-4 mb-2 ${
              message.type === 'success' ? 'text-green-200' :
              message.type === 'warning' ? 'text-yellow-200' :
              'text-red-200'
            }`}>
              {message.title}
            </h2>
            <p className={`text-lg mb-4 ${
              message.type === 'success' ? 'text-green-100' :
              message.type === 'warning' ? 'text-yellow-100' :
              'text-red-100'
            }`}>
              {message.message}
            </p>
            {message.subtitle && (
              <p className={`text-sm ${
                message.type === 'success' ? 'text-green-200' :
                message.type === 'warning' ? 'text-yellow-200' :
                'text-red-200'
              }`}>
                {message.subtitle}
              </p>
            )}
          </div>

          {/* Transaction details */}
          <div className="bg-white/5 backdrop-blur-sm rounded-lg p-6 border border-white/10">
            <h3 className="text-white font-semibold mb-4">Transaction Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Transaction ID:</span>
                <span className="text-white font-mono">{result.transaction.tx_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Recipient:</span>
                <span className="text-white">{result.transaction.recipient_vpa}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Amount:</span>
                <span className="text-white font-semibold">
                  ₹{parseFloat(result.transaction.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Status:</span>
                <span className={`font-semibold ${
                  message.type === 'success' ? 'text-green-400' :
                  message.type === 'warning' ? 'text-yellow-400' :
                  'text-red-400'
                }`}>
                  {message.type === 'success' ? 'Successful' :
                   message.type === 'warning' ? 'Pending Confirmation' : 'Failed'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Risk Level:</span>
                <span className={`font-semibold ${
                  result.riskLevel === 'low' ? 'text-green-400' :
                  result.riskLevel === 'medium' ? 'text-yellow-400' :
                  result.riskLevel === 'high' ? 'text-red-400' :
                  'text-gray-400'
                }`}>
                  {result.riskLevel?.toUpperCase() || 'N/A'}
                </span>
              </div>
            </div>
          </div>

           {/* Action buttons */}
           <div className="mt-6 space-y-3">
             {result.transaction?.action === 'DELAY' ? (
               <button
                 onClick={handleGoToFraudInterface}
                 className="w-full bg-gradient-to-r from-yellow-600 to-orange-600 text-white py-3 rounded-lg font-semibold hover:from-yellow-700 hover:to-orange-700 transition duration-200"
               >
                 Review Transaction Now
               </button>
             ) : result.transaction?.action === 'ALLOW' ? (
               <button
                 onClick={handleGoToDashboard}
                 className="w-full bg-gradient-to-r from-green-600 to-teal-600 text-white py-3 rounded-lg font-semibold hover:from-green-700 hover:to-teal-700 transition duration-200"
               >
                 Go to Dashboard
               </button>
             ) : null}
             
             <button
               onClick={onBack}
               className="w-full bg-white/20 text-green-200 py-3 rounded-lg font-semibold hover:bg-white/30 transition duration-200 border border border-white/20"
             >
               Send Another Payment
             </button>
           </div>
        </div>
      </div>
    </div>
  );
};

export default TransactionResult;