import React from 'react';
import { useLocation } from 'react-router-dom';
import { Bell, Shield, Database, Cpu } from 'lucide-react';
import useStore from '../store/useStore';

export default function Header() {
  const location = useLocation();
  const { user } = useStore();

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/': return 'Overview';
      case '/jobs': return 'Scraping Operations';
      case '/threads': return 'Extracted Forum Data';
      case '/settings': return 'System Settings';
      default:
        if (location.pathname.startsWith('/jobs/')) return 'Operation Logs';
        return 'Control Panel';
    }
  };

  return (
    <header className="h-20 bg-white/70 backdrop-blur-md border-b border-slate-100 flex items-center justify-between px-8 sticky top-0 z-30 shadow-xs">
      {/* Title / Breadcrumb */}
      <div>
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
          <span>Console</span>
          <span>/</span>
          <span className="text-indigo-600 font-extrabold">{getPageTitle()}</span>
        </div>
        <h2 className="text-lg font-extrabold text-slate-800 tracking-tight mt-0.5">{getPageTitle()}</h2>
      </div>

      {/* System Status Indicators & User Info */}
      <div className="flex items-center gap-6">
        {/* Indicators */}
        <div className="hidden md:flex items-center gap-4 border-r border-slate-100 pr-6">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <Database className="h-3.5 w-3.5 text-emerald-600" />
            <span>Clever Cloud DB Connected</span>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-full">
            <Cpu className="h-3.5 w-3.5 text-indigo-600" />
            <span>Scheduler Active</span>
          </div>
        </div>

        {/* User profile dropdown info */}
        {user && (
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-slate-800">{user.username}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{user.email}</p>
            </div>
            <div className="h-10 w-10 rounded-2xl bg-indigo-600 text-white font-extrabold flex items-center justify-center shadow-md shadow-indigo-200 uppercase tracking-wider border-2 border-white">
              {user.username[0]}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
