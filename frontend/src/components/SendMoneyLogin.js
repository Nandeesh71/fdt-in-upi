import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { loginUser } from '../api';

const SendMoneyLogin = ({ onLogin }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    phone: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await loginUser(formData);
      
      if (response.status === 'success') {
        onLogin(response.user, response.token);
        navigate('/send-money');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-green-900 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-0 w-96 h-96 bg-green-500 rounded-full filter blur-3xl opacity-20 animate-pulse"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-teal-500 rounded-full filter blur-3xl opacity-20 animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-emerald-500 rounded-full filter blur-3xl opacity-10 animate-pulse delay-500"></div>
      </div>
      
      <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-md p-8 border border-white/20 relative z-10">
        {/* Back button */}
        <div className="mb-6">
          <Link 
            to="/login"
            className="text-green-200 hover:text-white flex items-center text-sm"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7 7" />
            </svg>
            Back
          </Link>
        </div>

        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-green-500 to-teal-600 rounded-full flex items-center justify-center mb-4 shadow-lg">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Send Money</h2>
          <p className="text-green-200">Login to Send Money</p>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/30 text-red-200 px-4 py-3 rounded-lg mb-4 backdrop-blur-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-green-200 mb-2">
              Phone Number
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="+91XXXXXXXXXX"
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-white placeholder-green-300 backdrop-blur-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-green-200 mb-2">
              Password
            </label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Enter your password"
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-white placeholder-green-300 backdrop-blur-sm"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-green-600 to-teal-600 text-white py-3 rounded-lg font-semibold hover:from-green-700 hover:to-teal-700 transition duration-200 disabled:opacity-50 shadow-lg transform hover:scale-105"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                Signing in...
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-white/20">
          <p className="text-green-200 text-center text-sm">
            New to FDT?{' '}
            <Link to="/register" className="text-green-100 font-semibold hover:text-white">
              Sign Up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SendMoneyLogin;