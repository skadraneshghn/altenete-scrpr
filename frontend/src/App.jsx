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
import useStore from './store/useStore';

function PrivateRoute({ children }) {
  const { isAuthenticated, fetchCurrentUser } = useStore();

  useEffect(() => {
    if (isAuthenticated) {
      fetchCurrentUser();
    }
  }, [isAuthenticated]);

  return isAuthenticated ? (
    <div className="flex min-h-screen bg-slate-50 text-slate-800">
      <Sidebar />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto bg-slate-50/30 p-8">
          <div className="max-w-7xl mx-auto w-full space-y-8">
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

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
