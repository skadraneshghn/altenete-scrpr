import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Shield } from 'lucide-react';
import useStore from '../store/useStore';
import toast from 'react-hot-toast';
import { TEInput, TERipple } from 'tw-elements-react';

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
    <div className="min-h-screen w-full bg-neutral-100 dark:bg-neutral-900 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary-500/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md bg-white dark:bg-neutral-800 rounded-lg p-8 animate-fade-in relative z-10 shadow-[0_4px_9px_-4px_rgba(51,45,45,0.05),0_8px_18px_0_rgba(51,45,45,0.02),0_4px_18px_0_rgba(51,45,45,0.02)]">
        {/* Brand header */}
        <div className="flex flex-col items-center mb-8">
          <div className="p-3 bg-primary-100 rounded-2xl mb-4 text-primary-700">
            <Shield className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-neutral-800 dark:text-neutral-200 tracking-tight">Admin Console</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1.5 font-medium">Sign in to manage scraping jobs</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-danger-100 border border-danger-200 text-danger-700 text-sm rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative mb-6">
            <TEInput
              type="text"
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="mb-6"
            />
          </div>

          <div className="relative mb-6">
            <TEInput
              type="password"
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mb-6"
            />
          </div>

          <TERipple rippleColor="light" className="w-full">
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-block rounded bg-primary px-6 pb-2.5 pt-3 text-sm font-semibold uppercase leading-normal text-white shadow-[0_4px_9px_-4px_#3b71ca] transition duration-150 ease-in-out hover:bg-primary-600 hover:shadow-[0_8px_9px_-4px_rgba(59,113,202,0.3),0_4px_18px_0_rgba(59,113,202,0.2)] focus:bg-primary-600 focus:shadow-[0_8px_9px_-4px_rgba(59,113,202,0.3),0_4px_18px_0_rgba(59,113,202,0.2)] focus:outline-none focus:ring-0 active:bg-primary-700 active:shadow-[0_8px_9px_-4px_rgba(59,113,202,0.3),0_4px_18px_0_rgba(59,113,202,0.2)] disabled:opacity-50"
            >
              {loading ? (
                <div className="h-5 w-5 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto"></div>
              ) : (
                'Access Dashboard'
              )}
            </button>
          </TERipple>
        </form>
      </div>
    </div>
  );
}
