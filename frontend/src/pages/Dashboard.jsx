import React, { useEffect } from 'react';
import { FileText, Database, Activity, CheckCircle, ArrowRight, TrendingUp } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import useStore from '../store/useStore';
import { Link } from 'react-router-dom';

const STATS = (data) => [
  {
    name:    'Threads Scraped',
    value:   data?.total_threads ?? 0,
    sub:     'Total forum threads discovered',
    Icon:    FileText,
    accent:  '#4f46e5',
    light:   '#eef2ff',
    border:  '#c7d2fe',
  },
  {
    name:    'Posts Saved',
    value:   data?.total_posts ?? 0,
    sub:     'First posts extracted & stored',
    Icon:    Database,
    accent:  '#7c3aed',
    light:   '#f5f3ff',
    border:  '#ddd6fe',
  },
  {
    name:    'Active Jobs',
    value:   data?.active_jobs ?? 0,
    sub:     'Jobs currently running',
    Icon:    Activity,
    accent:  '#0284c7',
    light:   '#f0f9ff',
    border:  '#bae6fd',
  },
  {
    name:    'Success Rate',
    value:   `${data?.success_rate ?? 0}%`,
    sub:     'Completed / total jobs',
    Icon:    CheckCircle,
    accent:  '#059669',
    light:   '#f0fdf4',
    border:  '#bbf7d0',
  },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>{label}</p>
        {payload.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: '#1e293b', marginTop: 2 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block' }}></span>
            {p.name}: <strong>{p.value}</strong>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const { dashboardStats, dashboardActivity, recentJobs, fetchDashboardData } = useStore();

  useEffect(() => {
    fetchDashboardData();
    const id = setInterval(fetchDashboardData, 10000);
    return () => clearInterval(id);
  }, []);

  const stats = STATS(dashboardStats);

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <div
            key={i}
            className="stat-card"
            style={{ borderLeft: `4px solid ${s.accent}` }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: s.accent }}>{s.name}</p>
                <p className="text-3xl font-extrabold text-slate-900 leading-none">{s.value}</p>
                <p className="text-xs text-slate-400 mt-1.5 font-medium">{s.sub}</p>
              </div>
              <div
                className="flex items-center justify-center w-11 h-11 rounded-xl flex-shrink-0"
                style={{ background: s.light, border: `1px solid ${s.border}` }}
              >
                <s.Icon className="h-5 w-5" style={{ color: s.accent }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Activity Chart ── */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-bold text-slate-800">Discovery &amp; Scraping Activity</h2>
            <p className="text-xs text-slate-400 mt-0.5">Last 30 days thread &amp; post volume</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-indigo-600">
              <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block"></span>
              Threads
            </span>
            <span className="flex items-center gap-1.5 text-purple-600">
              <span className="w-2.5 h-2.5 rounded-sm bg-purple-500 inline-block"></span>
              Posts
            </span>
          </div>
        </div>

        <div className="h-72 w-full">
          {dashboardActivity.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dashboardActivity} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gThreads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#4f46e5" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gPosts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="threads" name="Threads" stroke="#4f46e5" fill="url(#gThreads)" strokeWidth={2.5} dot={false} />
                <Area type="monotone" dataKey="posts"   name="Posts"   stroke="#7c3aed" fill="url(#gPosts)"   strokeWidth={2.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#f1f5f9' }}>
                <TrendingUp className="h-6 w-6 text-slate-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-600">No activity yet</p>
                <p className="text-xs text-slate-400 mt-0.5">Run a scraping job to see data here</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Jobs Table ── */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #f1f5f9' }}>
          <div>
            <h2 className="text-base font-bold text-slate-800">Recent Operations</h2>
            <p className="text-xs text-slate-400 mt-0.5">Latest scraping job activity</p>
          </div>
          <Link
            to="/jobs"
            className="flex items-center gap-1.5 text-sm font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            View All <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-100/80">
                {['Job ID', 'Type', 'Status', 'Progress', 'Started At'].map(h => (
                  <th key={h} className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/80">
              {recentJobs.map((job) => (
                <tr
                  key={job.id}
                  className="hover:bg-slate-50/60 transition-colors"
                >
                  <td className="px-6 py-4 font-mono font-bold text-slate-700 text-sm">#{job.id}</td>
                  <td className="px-6 py-4 capitalize font-semibold text-slate-600 text-sm">{job.job_type.replace(/_/g, ' ')}</td>
                  <td className="px-6 py-4"><span className={`status-badge status-${job.status}`}>{job.status}</span></td>
                  <td className="px-6 py-4 text-sm font-semibold text-slate-700">{job.processed_items} / {job.total_items}</td>
                  <td className="px-6 py-4 text-sm text-slate-400 font-medium">{new Date(job.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {recentJobs.length === 0 && (
                <tr>
                  <td colSpan="5" className="text-center py-10 text-slate-400 text-sm italic">
                    No jobs recorded yet — launch your first scraping operation.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
