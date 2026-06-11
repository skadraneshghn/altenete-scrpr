import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Jobs from './pages/Jobs';
import JobDetail from './pages/JobDetail';
import Threads from './pages/Threads';
import Settings from './pages/Settings';
import Login from './pages/Login';
import HealthCheck from './pages/HealthCheck';
import useStore from './store/useStore';

function PrivateRoute({ children }) {
  const { isAuthenticated, fetchCurrentUser } = useStore();

  useEffect(() => {
    if (isAuthenticated) {
      fetchCurrentUser();
    }
  }, [isAuthenticated]);

  return isAuthenticated ? (
    <div className="flex min-h-screen relative overflow-hidden" style={{ background: '#f8fafc' }}>
      {/* Background Glows for Modern Glassmorphism Accent */}
      <div className="absolute top-[-15%] right-[-10%] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-indigo-200/10 to-purple-200/15 blur-[120px] pointer-events-none z-0"></div>
      <div className="absolute bottom-[-15%] left-[10%] w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-blue-200/10 to-pink-200/15 blur-[120px] pointer-events-none z-0"></div>

      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden relative z-10">
        <Header />
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="w-full space-y-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  ) : (
    <Navigate to="/login" replace />
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster 
        position="top-right" 
        toastOptions={{
          style: {
            background: '#ffffff',
            color: '#1e293b',
            border: '1px solid rgba(0, 0, 0, 0.06)',
            borderRadius: '12px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)'
          }
        }} 
      />
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route 
          path="/" 
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          } 
        />
        <Route 
          path="/jobs" 
          element={
            <PrivateRoute>
              <Jobs />
            </PrivateRoute>
          } 
        />
        <Route 
          path="/jobs/:id" 
          element={
            <PrivateRoute>
              <JobDetail />
            </PrivateRoute>
          } 
        />
        <Route 
          path="/threads" 
          element={
            <PrivateRoute>
              <Threads />
            </PrivateRoute>
          } 
        />
        <Route 
          path="/settings" 
          element={
            <PrivateRoute>
              <Settings />
            </PrivateRoute>
          } 
        />
        <Route 
          path="/health" 
          element={
            <PrivateRoute>
              <HealthCheck />
            </PrivateRoute>
          } 
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
