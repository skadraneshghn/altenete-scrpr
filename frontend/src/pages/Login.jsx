import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Mail, Lock, Shield } from 'lucide-react';
import useStore from '../store/useStore';
import toast from 'react-hot-toast';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, isAuthenticated, loading, error } = useStore();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error('Please enter username and password');
      return;
    }
    const success = await login(username, password);
    if (success) {
      toast.success('Successfully logged in');
    } else {
      toast.error('Authentication failed');
    }
  };

  return (
    <div className="login-container">
      {/* Login Card */}
      <div className="login-card animate-fade-in">
        {/* Header with App Logo */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="h-12 w-12 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl flex items-center justify-center text-indigo-400 mb-4 shadow-inner">
            <Shield className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Altenen Scraper</h2>
          <p className="text-xs font-semibold text-indigo-400/80 uppercase tracking-wider mt-1.5">Administrative Console</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl font-semibold animate-shake">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Username/Email Input */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 block ml-1">Username / Email</label>
            <div className="login-input-wrapper">
              <Mail className="login-input-icon" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="Enter username"
                className="login-input"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 block ml-1">Password</label>
            <div className="login-input-wrapper">
              <Lock className="login-input-icon" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter password"
                className="login-input"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="login-btn mt-6"
          >
            {loading ? (
              <div className="h-5 w-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>

        {/* Forgot Password Help */}
        <div className="mt-8 text-center">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              toast('Please contact your administrator for password reset assistance.');
            }}
            className="text-xs font-semibold text-slate-500 hover:text-slate-400 transition-colors uppercase tracking-wider"
          >
            Forgot Password
          </a>
        </div>
      </div>
    </div>
  );
}
