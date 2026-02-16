import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { submitUserDecision } from '../api';

const FraudAlert = ({ user }) => {
  const { txId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDecision = async (decision) => {
    setLoading(true);
    setError('');

    try {
      const response = await submitUserDecision({
        tx_id: txId,
        decision: decision
      });

      if (response.status === 'success') {
        if (decision === 'confirm') {
          alert('Transaction confirmed successfully!');
        } else {
          alert('Transaction cancelled for your safety');
        }
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to process decision');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-red-500 text-white p-6 text-center">
            <svg className="w-20 h-20 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h2 className="text-2xl font-bold">Fraud Alert</h2>
            <p className="text-red-100 mt-2">Suspicious transaction detected</p>
          </div>

          <div className="p-6">
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h4 className="font-semibold text-yellow-800 mb-2">⚠️ Action Required</h4>
              <p className="text-sm text-yellow-700">
                This transaction has been flagged by our fraud detection system. Please review and confirm if you initiated this transaction.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={() => handleDecision('confirm')}
                disabled={loading}
                className="w-full bg-green-600 text-white py-4 rounded-lg font-semibold hover:bg-green-700 transition duration-200 disabled:bg-gray-400"
                data-testid="confirm-button"
              >
                {loading ? 'Processing...' : '✓ I Initiated This Transaction'}
              </button>
              <button
                onClick={() => handleDecision('cancel')}
                disabled={loading}
                className="w-full bg-red-600 text-white py-4 rounded-lg font-semibold hover:bg-red-700 transition duration-200 disabled:bg-gray-400"
                data-testid="cancel-button"
              >
                {loading ? 'Processing...' : '✕ Cancel This Transaction'}
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="w-full bg-gray-200 text-gray-800 py-3 rounded-lg font-semibold hover:bg-gray-300 transition duration-200"
                data-testid="back-dashboard-button"
              >
                Back to Dashboard
              </button>
            </div>

            <p className="text-xs text-gray-500 text-center mt-4">
              Transaction ID: {txId}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FraudAlert;
