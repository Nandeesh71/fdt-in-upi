import React from 'react';
import { useNavigate } from 'react-router-dom';

const SecuritySettings = ({ user }) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 pb-20">
      {/* Animated background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-0 left-0 w-96 h-96 bg-purple-500 rounded-full filter blur-3xl opacity-20 animate-pulse"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-500 rounded-full filter blur-3xl opacity-20 animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-pink-500 rounded-full filter blur-3xl opacity-10 animate-pulse delay-500"></div>
      </div>

      {/* Header */}
      <div className="bg-black/20 backdrop-blur-xl border-b border-white/10 text-white p-6 pb-8">
        <div className="flex items-center mb-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="mr-4 text-purple-300 hover:text-white transition-colors"
            data-testid="back-button"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold">Security Settings</h1>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 -mt-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-xl p-8 border border-white/20">
            {/* User Info */}
            <div className="mb-8 pb-6 border-b border-white/10">
              <p className="text-purple-300 text-sm mb-2">Account</p>
              <h2 className="text-2xl font-bold text-white">{user?.name || 'User'}</h2>
              <p className="text-purple-400 text-sm mt-2">Phone: {user?.phone || 'N/A'}</p>
            </div>

            {/* Main Message */}
            <div className="space-y-6">
              {/* Success Banner */}
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6">
                <div className="flex items-start">
                  <svg className="w-6 h-6 text-green-400 mr-4 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h3 className="text-lg font-semibold text-green-300 mb-2">Transaction Limits Removed</h3>
                    <p className="text-green-200 text-sm">
                      You can now perform unlimited transactions without any daily limits. Our advanced fraud detection system will continuously monitor all your transactions for security.
                    </p>
                  </div>
                </div>
              </div>

              {/* Features List */}
              <div>
                <h3 className="text-white font-semibold mb-4 flex items-center">
                  <svg className="w-5 h-5 mr-2 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  Your Smart Features
                </h3>
                
                <div className="space-y-3">
                  {/* Feature 1: Unlimited Transactions */}
                  <div className="flex items-start bg-white/5 rounded-lg p-4 border border-white/10">
                    <div className="flex-shrink-0">
                      <div className="flex items-center justify-center h-8 w-8 rounded-md bg-purple-500/20">
                        <svg className="h-5 w-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                    <div className="ml-3">
                      <p className="text-white font-medium">Unlimited Transactions</p>
                      <p className="text-purple-300 text-sm mt-1">Send unlimited amounts anytime with no daily restrictions</p>
                    </div>
                  </div>

                  {/* Feature 2: Known Recipients */}
                  <div className="flex items-start bg-white/5 rounded-lg p-4 border border-white/10">
                    <div className="flex-shrink-0">
                      <div className="flex items-center justify-center h-8 w-8 rounded-md bg-green-500/20">
                        <svg className="h-5 w-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                    <div className="ml-3">
                      <p className="text-white font-medium">Trusted Recipients (70% Risk Reduction)</p>
                      <p className="text-purple-300 text-sm mt-1">Repeat transactions to known recipients get 70% lower fraud risk</p>
                    </div>
                  </div>

                  {/* Feature 3: Smart Fraud Detection */}
                  <div className="flex items-start bg-white/5 rounded-lg p-4 border border-white/10">
                    <div className="flex-shrink-0">
                      <div className="flex items-center justify-center h-8 w-8 rounded-md bg-amber-500/20">
                        <svg className="h-5 w-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m7 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                    <div className="ml-3">
                      <p className="text-white font-medium">Advanced Fraud Detection</p>
                      <p className="text-purple-300 text-sm mt-1">ML models continuously analyze all transactions with explainable fraud reasoning</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Info Box */}
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <p className="text-blue-200 text-sm flex items-start">
                  <svg className="w-4 h-4 inline mr-2 mb-0.5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <span>
                    Your security is our priority. All transactions are monitored by our AI-powered fraud detection system in real-time. Suspicious activities will be flagged for your review.
                  </span>
                </p>
              </div>
            </div>

            {/* Action Button */}
            <div className="flex gap-3 mt-8 pt-6 border-t border-white/10">
              <button
                onClick={() => navigate('/dashboard')}
                className="flex-1 py-3 px-6 rounded-xl font-semibold transition-all duration-200 transform flex items-center justify-center bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700 hover:scale-105 active:scale-95"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16l-4-4m0 0l-4 4m4-4v12" />
                </svg>
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecuritySettings;
