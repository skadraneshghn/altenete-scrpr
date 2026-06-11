import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight } from 'lucide-react';
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
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-white overflow-hidden font-sans">
      {/* Left Column: SVG Illustration */}
      <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-12 bg-white select-none">
        <svg viewBox="0 0 500 400" className="w-full max-w-[450px] h-auto">
          {/* Floor line */}
          <line x1="50" y1="330" x2="450" y2="330" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />
          
          {/* Desk & PC */}
          <rect x="90" y="220" width="220" height="8" rx="4" fill="#60a5fa" />
          <rect x="120" y="228" width="12" height="102" fill="#94a3b8" />
          <rect x="270" y="228" width="12" height="102" fill="#94a3b8" />
          <rect x="105" y="325" width="42" height="6" rx="3" fill="#64748b" />
          <rect x="255" y="325" width="42" height="6" rx="3" fill="#64748b" />
          
          {/* Monitor */}
          <rect x="210" y="205" width="30" height="15" fill="#cbd5e1" />
          <polygon points="200,220 250,220 240,223 210,223" fill="#94a3b8" />
          <rect x="175" y="145" width="100" height="60" rx="6" fill="#475569" />
          <rect x="180" y="150" width="90" height="46" rx="2" fill="#1e3a8a" />
          
          {/* Server Rack (Scraping Nodes) */}
          <rect x="340" y="120" width="80" height="170" rx="8" fill="#f1f5f9" stroke="#e2e8f0" strokeWidth="2" />
          <rect x="350" y="135" width="60" height="20" rx="4" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
          <rect x="350" y="165" width="60" height="20" rx="4" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
          <rect x="350" y="195" width="60" height="20" rx="4" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
          <rect x="350" y="225" width="60" height="20" rx="4" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
          <rect x="350" y="255" width="60" height="20" rx="4" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
          
          {/* Server LEDs */}
          <circle cx="360" cy="145" r="3" fill="#3b82f6" />
          <circle cx="360" cy="175" r="3" fill="#10b981" />
          <circle cx="360" cy="205" r="3" fill="#10b981" />
          <circle cx="360" cy="235" r="3" fill="#3b82f6" />
          <circle cx="360" cy="265" r="3" fill="#ef4444" />
          
          {/* Floating web icons/charts */}
          <rect x="375" y="142" width="25" height="6" rx="3" fill="#94a3b8" opacity="0.3" />
          <rect x="375" y="172" width="25" height="6" rx="3" fill="#94a3b8" opacity="0.3" />
          <rect x="375" y="202" width="25" height="6" rx="3" fill="#94a3b8" opacity="0.3" />
          <rect x="375" y="232" width="25" height="6" rx="3" fill="#94a3b8" opacity="0.3" />
          <rect x="375" y="262" width="25" height="6" rx="3" fill="#94a3b8" opacity="0.3" />
          
          {/* Programmer Sitting */}
          {/* Chair */}
          <path d="M110 260 L160 260 L155 315 L115 315 Z" fill="#3b82f6" opacity="0.2" />
          <rect x="115" y="255" width="40" height="6" rx="3" fill="#2563eb" />
          <path d="M115 255 L115 190 Q115 180 125 180 L135 180 Q145 180 145 190 L145 255 Z" fill="#1d4ed8" />
          <line x1="135" y1="261" x2="135" y2="310" stroke="#475569" strokeWidth="6" />
          <rect x="110" y="308" width="50" height="6" rx="3" fill="#334155" />
          
          {/* Person legs & torso */}
          <path d="M140 245 Q175 250 185 285 L195 328 L215 328" stroke="#3b82f6" strokeWidth="12" strokeLinecap="round" fill="none" />
          <path d="M138 245 L150 185" stroke="#1e293b" strokeWidth="16" strokeLinecap="round" fill="none" />
          
          {/* Head & Hair */}
          <circle cx="158" cy="148" r="14" fill="#fed7aa" />
          <path d="M148 144 Q158 132 168 144 L168 138 Q158 134 148 138 Z" fill="#475569" />
          
          {/* Arm & Keyboard */}
          <path d="M146 195 L182 205 L202 195" stroke="#1e293b" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          
          {/* Data Lines (Scraping Visualizer) */}
          <path d="M280 170 Q310 160 340 175" stroke="#3b82f6" strokeWidth="2" strokeDasharray="4 4" fill="none" />
          <path d="M280 170 Q310 200 340 205" stroke="#3b82f6" strokeWidth="2" strokeDasharray="4 4" fill="none" />
        </svg>
      </div>

      {/* Right Column: Blue Container + Form Card */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 md:p-16 lg:p-20 bg-white">
        <div className="w-full h-full min-h-[580px] lg:min-h-0 bg-[#0076fe] rounded-[32px] lg:rounded-[40px] flex items-center justify-center p-6 sm:p-12 relative overflow-hidden shadow-2xl">
          
          {/* Circular pattern in bottom right */}
          <div className="absolute bottom-[-15%] right-[-15%] w-[400px] h-[400px] border-2 border-white/10 rounded-full pointer-events-none"></div>
          <div className="absolute bottom-[-25%] right-[-25%] w-[400px] h-[400px] border-2 border-white/5 rounded-full pointer-events-none"></div>

          {/* White Card */}
          <div className="w-full max-w-[420px] bg-white rounded-[28px] p-8 sm:p-10 md:p-12 shadow-2xl z-10 animate-fade-in">
            {/* Greeting Header */}
            <div className="mb-8">
              <h2 className="text-3xl font-extrabold text-[#111827] tracking-tight">Hello!</h2>
              <p className="text-sm font-semibold text-slate-500 mt-2">Sign In to Get Started</p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50/60 border border-red-100 text-red-500 text-xs rounded-xl font-bold animate-shake">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Username Input */}
              <div className="relative">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  placeholder="Email Address"
                  className="w-full pl-14 pr-6 py-4 bg-white border border-slate-200 focus:border-[#0076fe] rounded-full text-slate-700 placeholder-slate-400/80 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                />
              </div>

              {/* Password Input */}
              <div className="relative">
                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Password"
                  className="w-full pl-14 pr-6 py-4 bg-white border border-slate-200 focus:border-[#0076fe] rounded-full text-slate-700 placeholder-slate-400/80 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-[#0076fe] hover:bg-[#0066d9] active:scale-[0.98] text-white text-sm font-bold rounded-full shadow-lg shadow-blue-500/20 transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <div className="h-5 w-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <span>Login</span>
                )}
              </button>
            </form>

            {/* Bottom Actions */}
            <div className="mt-8 text-center">
              <a href="#" onClick={(e) => { e.preventDefault(); toast('Please contact your administrator for password reset assistance.'); }} className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors uppercase tracking-wider">
                Forgot Password
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
