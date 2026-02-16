import React from 'react';

const SplashScreen = () => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-600 to-purple-700">
      <div className="text-center fade-in">
        <div className="mb-8">
          <div className="w-24 h-24 mx-auto bg-white rounded-full flex items-center justify-center shadow-2xl">
            <svg
              className="w-16 h-16 text-indigo-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
        </div>
        <h1 className="text-4xl font-bold text-white mb-2">FDT</h1>
        <p className="text-xl text-indigo-100 mb-8">Fraud Detection in UPI</p>
        <div className="flex justify-center">
          <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full spinner"></div>
        </div>
        <p className="text-sm text-indigo-200 mt-6">Initializing secure connection...</p>
      </div>
    </div>
  );
};

export default SplashScreen;
