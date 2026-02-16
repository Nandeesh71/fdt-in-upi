import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { submitUserDecision, getTransaction, confirmTransaction, cancelTransaction } from '../api';
import { useNotifications } from './NotificationSystem';
import { formatAmount, getRiskColor, getRiskLabel } from '../utils/helpers';

const FraudAlert = () => {
  const { txId } = useParams();
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTransaction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txId]);

  const fetchTransaction = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // First try to fetch from API
      const response = await getTransaction(txId);
      if (response && response.transaction) {
        setTransaction(response.transaction);
      } else {
        setError('Transaction not found');
      }
    } catch (err) {
      console.error('Error fetching transaction:', err);
      setError(err.response?.data?.detail || 'Failed to load transaction details');
    } finally {
      setLoading(false);
    }
  };

  const handleDecision = async (decision) => {
    setProcessing(true);
    try {
      if (decision === 'confirm') {
        await confirmTransaction(txId);
      } else if (decision === 'cancel') {
        await cancelTransaction(txId);
      } else {
        await submitUserDecision({ tx_id: txId, decision });
      }
      
      addNotification({
        type: 'transaction_resolved',
        title: `Transaction ${decision === 'confirm' ? 'Confirmed' : 'Cancelled'}`,
        message: `Transaction to ${transaction.recipient_vpa} has been ${decision === 'confirm' ? 'confirmed' : 'cancelled'}.`,
        category: 'success'
      });
      
      // Redirect back after a short delay
      setTimeout(() => {
        navigate('/dashboard');
      }, 1500);
    } catch (error) {
      console.error('Decision error:', error);
      addNotification({
        type: 'error',
        title: 'Action Failed',
        message: error.response?.data?.detail || 'Unable to process your decision. Please try again.',
        category: 'error'
      });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="w-16 h-16 border-4 border-purple-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-xl">Analyzing transaction...</p>
        </div>
      </div>
    );
  }

  if (error || !transaction) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 flex items-center justify-center">
        <div className="text-center text-white">
          <svg className="w-24 h-24 mx-auto mb-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h1 className="text-3xl font-bold mb-2">Transaction Not Found</h1>
          <p className="text-gray-300 mb-6">{error || 'The transaction you\'re looking for doesn\'t exist or has been resolved.'}</p>
          <Link
            to="/dashboard"
            className="inline-flex items-center px-6 py-3 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition duration-200"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const riskLevel = getRiskColor(transaction.risk_score, transaction.risk_level);
  const riskLabel = getRiskLabel(transaction.risk_score, transaction.risk_level);
  
  // Determine action based on transaction status
  const isDelayed = transaction.action === 'DELAY' || transaction.db_status === 'pending';
  const isBlocked = transaction.action === 'BLOCK' || transaction.db_status === 'blocked';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900">
      {/* Header */}
      <div className="bg-black/20 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <Link to="/dashboard" className="text-white/80 hover:text-white flex items-center">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Security Dashboard
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Alert Header */}
        <div className={`text-center mb-8 ${riskLevel === 'red' ? 'animate-pulse' : ''}`}>
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${
            riskLevel === 'red' ? 'bg-red-500' : 
            riskLevel === 'yellow' ? 'bg-amber-500' : 'bg-green-500'
          }`}>
           <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isBlocked ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              )}
            </svg>
          </div>
           <h1 className={`text-4xl font-bold mb-2 ${
             riskLevel === 'red' ? 'text-red-400' : 
             riskLevel === 'yellow' ? 'text-amber-400' : 'text-green-400'
           }`}>
             {isBlocked ? 'TRANSACTION BLOCKED' : 'TRANSACTION REQUIRES VERIFICATION'}
           </h1>
          <p className="text-white/60 text-lg">
            Risk Level: <span className={`font-semibold ${
              riskLevel === 'red' ? 'text-red-400' : 
              riskLevel === 'yellow' ? 'text-amber-400' : 'text-green-400'
            }`}>{riskLabel}</span>
          </p>
        </div>

        {/* Transaction Details Card */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-8 mb-8">
          <h2 className="text-2xl font-bold text-white mb-6">Transaction Details</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <p className="text-white/60 text-sm mb-2">Amount</p>
              <p className="text-3xl font-bold text-white">{formatAmount(transaction.amount)}</p>
            </div>
            <div>
              <p className="text-white/60 text-sm mb-2">Recipient</p>
              <p className="text-xl font-semibold text-white">{transaction.recipient_vpa}</p>
            </div>
            <div>
              <p className="text-white/60 text-sm mb-2">Transaction ID</p>
              <p className="text-lg font-mono text-white/80">{transaction.tx_id}</p>
            </div>
            <div>
              <p className="text-white/60 text-sm mb-2">Time</p>
              <p className="text-lg text-white/80">
                {new Date(transaction.created_at + 'Z').toLocaleString()}
              </p>
            </div>
          </div>
          
          {transaction.remarks && (
            <div className="bg-black/20 rounded-lg p-4">
              <p className="text-white/60 text-sm mb-2">Remarks</p>
              <p className="text-white italic">"{transaction.remarks}"</p>
            </div>
          )}
        </div>

         {/* Risk Analysis */}
         {transaction.risk_factors && (
         <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-8 mb-8">
           <h2 className="text-2xl font-bold text-white mb-6">Risk Analysis</h2>
           
           <div className="space-y-4">
             {Object.entries(transaction.risk_factors).map(([factor, analysis]) => {
               const [category, level] = analysis.split(' - ');
               const isHigh = level.includes('HIGH');
               const isMedium = level.includes('MEDIUM');
               
               return (
                 <div key={factor} className={`border-l-4 p-4 rounded-r-lg ${
                   isHigh ? 'border-red-500 bg-red-500/10' : 
                   isMedium ? 'border-amber-500 bg-amber-500/10' : 
                   'border-green-500 bg-green-500/10'
                 }`}>
                   <div className="flex items-start">
                     <div className={`w-2 h-2 rounded-full mr-3 ${
                       isHigh ? 'bg-red-500' : 
                       isMedium ? 'bg-amber-500' : 'bg-green-500'
                     }`}></div>
                     <div className="flex-1">
                       <p className="text-white/80 text-sm font-medium">{category.replace('_', ' ').toUpperCase()}</p>
                       <p className="text-white/60 text-sm">{analysis}</p>
                     </div>
                   </div>
                 </div>
               );
             })}
           </div>
         </div>
         )}

         {/* Why This Action Was Taken */}
         {transaction.fraud_reasons && transaction.fraud_reasons.length > 0 && (
         <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-8 mb-8">
           <h2 className="text-2xl font-bold text-white mb-4">Why This Action Was Taken</h2>
           
           <div className="space-y-3">
             {transaction.fraud_reasons.map((reason, index) => (
               <div key={index} className="flex items-start bg-white/5 rounded-lg p-4">
                 <svg className="w-5 h-5 text-amber-400 mr-3 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                 </svg>
                 <p className="text-white/80">{reason}</p>
               </div>
             ))}
           </div>
         </div>
         )}

         {/* Action Buttons */}
         {isDelayed && (
           <div className="flex flex-col sm:flex-row gap-4">
             <button
               onClick={() => handleDecision('confirm')}
               disabled={processing}
               className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold py-4 px-8 rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:transform-none flex items-center justify-center"
             >
               {processing ? (
                 <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin mr-3"></div>
               ) : (
                 <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                 </svg>
               )}
               Confirm Transaction
             </button>
             
             <button
               onClick={() => handleDecision('cancel')}
               disabled={processing}
               className="flex-1 bg-gradient-to-r from-red-500 to-pink-600 text-white font-semibold py-4 px-8 rounded-xl hover:from-red-600 hover:to-pink-700 transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:transform-none flex items-center justify-center"
             >
               {processing ? (
                 <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin mr-3"></div>
               ) : (
                 <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                 </svg>
               )}
               Cancel Transaction
             </button>
           </div>
         )}

         {isBlocked && (
           <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
             <svg className="w-16 h-16 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
             </svg>
             <h3 className="text-xl font-bold text-red-400 mb-2">Transaction Blocked</h3>
             <p className="text-white/80 mb-4">
               This transaction was blocked for your security. If you believe this is an error, please contact our support team immediately.
             </p>
             <div className="flex flex-col sm:flex-row gap-4">
               <Link
                 to="/dashboard"
                 className="flex-1 bg-white/20 text-white font-semibold py-3 px-6 rounded-xl hover:bg-white/30 transition duration-200 text-center"
               >
                 Go to Dashboard
               </Link>
              <a
                href="mailto:teamfdt2@gmail.com"
                className="flex-1 bg-gradient-to-r from-red-500 to-pink-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-red-600 hover:to-pink-700 transition duration-200 text-center"
              >
                Contact Support
              </a>
             </div>
           </div>
         )}
      </div>
    </div>
  );
};

export default FraudAlert;