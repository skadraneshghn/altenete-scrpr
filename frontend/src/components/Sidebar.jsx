import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Play, 
  FileText, 
  Settings as SettingsIcon, 
  LogOut,
  ShieldCheck
} from 'lucide-react';
import useStore from '../store/useStore';

export default function Sidebar() {
  const location = useLocation();
  const { user, logout } = useStore();

  const links = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Jobs', path: '/jobs', icon: Play },
    { name: 'Scraped Threads', path: '/threads', icon: FileText },
    { name: 'Settings', path: '/settings', icon: SettingsIcon },
  ];

  return (
    <div className="w-64 bg-white/80 border-r border-slate-100 flex flex-col h-screen sticky top-0 backdrop-blur-md shadow-sm">
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-100 flex items-center gap-3">
        <div className="p-2 bg-indigo-500/10 rounded-xl">
          <ShieldCheck className="h-6 w-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="font-bold text-slate-800 tracking-wide text-lg">Altenen</h1>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Scraper Engine</p>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-4 py-6 space-y-1.5">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = location.pathname === link.path;
          return (
            <Link
              key={link.path}
              to={link.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                isActive 
                  ? 'bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-100' 
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{link.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Footer Profile */}
      <div className="p-4 border-t border-slate-100 flex flex-col gap-3">
        {user && (
          <div className="flex items-center gap-3 px-2">
            <div className="h-9 w-9 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center font-bold text-indigo-600">
              {user.username[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{user.username}</p>
              <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 hover:border-red-500/20 rounded-xl text-red-600 text-sm transition-all duration-200 cursor-pointer font-semibold"
        >
          <LogOut className="h-4 w-4" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
