import React from 'react';
import { useLocation } from 'react-router-dom';
import { Database, Cpu } from 'lucide-react';
import useStore from '../store/useStore';

const PAGE_META = {
  '/':        { title: 'Overview',         sub: 'Monitor your scraping engine' },
  '/jobs':    { title: 'Operations',        sub: 'Manage and track scraping jobs' },
  '/threads': { title: 'Scraped Threads',   sub: 'Browse all extracted forum content' },
  '/settings':{ title: 'Configuration',    sub: 'Manage forum targets and credentials' },
};

export default function Header() {
  const location = useLocation();
  const { user } = useStore();

  const meta = location.pathname.startsWith('/jobs/')
    ? { title: 'Job Detail', sub: 'View operation logs and status' }
    : PAGE_META[location.pathname] || { title: 'Console', sub: '' };

  return (
    <header
      className="flex items-center justify-between px-8 h-16 flex-shrink-0"
      style={{
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}
    >
      {/* Page title */}
      <div>
        <h2 className="text-lg font-extrabold text-slate-900 leading-tight">{meta.title}</h2>
        <p className="text-xs text-slate-400 font-medium">{meta.sub}</p>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Status pills */}
        <div className="hidden md:flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold"
            style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" style={{ animation: 'pulse 2s infinite' }}></span>
            <Database className="h-3 w-3" />
            <span>DB Connected</span>
          </div>
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold"
            style={{ background: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe' }}
          >
            <Cpu className="h-3 w-3" />
            <span>Scheduler On</span>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-7 bg-slate-200 hidden md:block"></div>

        {/* User avatar */}
        {user && (
          <div className="flex items-center gap-2.5">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-slate-800 leading-tight">{user.username}</p>
              <p className="text-[10px] text-slate-400">{user.email}</p>
            </div>
            <div
              className="h-9 w-9 rounded-xl flex items-center justify-center text-sm font-extrabold text-white flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', boxShadow: '0 2px 8px rgba(79,70,229,0.35)' }}
            >
              {user.username[0].toUpperCase()}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
