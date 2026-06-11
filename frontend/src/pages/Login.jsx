import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Shield, Lock, User, ArrowRight } from 'lucide-react';
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
    <div className="min-h-screen w-full bg-slate-900 flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Dynamic Background Blob Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse pointer-events-none duration-10000"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 rounded-full blur-[120px] animate-pulse pointer-events-none duration-10000"></div>

      <div className="w-full max-w-[440px] bg-slate-800/40 backdrop-blur-md border border-slate-700/30 rounded-3xl p-8 md:p-10 animate-fade-in relative z-10 shadow-2xl">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/30">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight">Altenen Scraper</h2>
          <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mt-1.5">Administrative Console</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl font-medium animate-shake">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Username Input */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Username</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-500" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full pl-11 pr-4 py-3 bg-slate-900/60 border border-slate-700/50 focus:border-indigo-500 rounded-xl text-white text-sm font-medium focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder-slate-600"
                placeholder="Enter username"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-11 pr-4 py-3 bg-slate-900/60 border border-slate-700/50 focus:border-indigo-500 rounded-xl text-white text-sm font-medium focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder-slate-600"
                placeholder="Enter password"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 active:scale-[0.98] text-white text-sm font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-indigo-500/20 transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <div className="h-5 w-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      </div>

      <div className="absolute bottom-4 text-center z-10">
        <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Protected Environment &copy; {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
