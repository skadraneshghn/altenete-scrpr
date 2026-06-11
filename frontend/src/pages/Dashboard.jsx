import React, { useEffect } from 'react';
import { 
  FileText, 
  Database, 
  Activity, 
  CheckCircle 
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import useStore from '../store/useStore';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { 
    dashboardStats, 
    dashboardActivity, 
    recentJobs, 
    fetchDashboardData 
  } = useStore();

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 10000);
    return () => clearInterval(interval);
  }, []);

  const stats = [
    {
      name: 'Total Threads Scraped',
      value: dashboardStats?.total_threads ?? 0,
      icon: FileText,
      color: 'text-indigo-600',
      bg: 'bg-indigo-500/10',
    },
    {
      name: 'Total First Posts Saved',
      value: dashboardStats?.total_posts ?? 0,
      icon: Database,
      color: 'text-purple-600',
      bg: 'bg-purple-500/10',
    },
    {
      name: 'Active Running Jobs',
      value: dashboardStats?.active_jobs ?? 0,
      icon: Activity,
      color: 'text-blue-600',
      bg: 'bg-blue-500/10',
    },
    {
      name: 'Scraper Success Rate',
      value: `${dashboardStats?.success_rate ?? 0}%`,
      icon: CheckCircle,
      color: 'text-emerald-600',
      bg: 'bg-emerald-500/10',
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={idx} className="glass-card p-6 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{stat.name}</p>
                <p className="text-3xl font-extrabold text-slate-800">{stat.value}</p>
              </div>
              <div className={`p-3.5 rounded-xl ${stat.bg}`}>
                <Icon className={`h-6 w-6 ${stat.color}`} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Chart Section */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-6">Discovery & Scraping Activity</h2>
        <div className="h-80 w-full">
          {dashboardActivity.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dashboardActivity}>
                <defs>
                  <linearGradient id="colorThreads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorPosts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#ffffff', 
                    borderColor: 'rgba(0,0,0,0.06)',
                    borderRadius: '12px',
                    color: '#1e293b',
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)'
                  }} 
                />
                <Area type="monotone" dataKey="threads" name="Discovered Threads" stroke="#4f46e5" fillOpacity={1} fill="url(#colorThreads)" strokeWidth={2.5} />
                <Area type="monotone" dataKey="posts" name="Scraped Posts" stroke="#7c3aed" fillOpacity={1} fill="url(#colorPosts)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400">
              No activity data recorded in the last 30 days
            </div>
          )}
        </div>
      </div>

      {/* Recent Jobs Table */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-800">Recent Scraping Operations</h2>
          <Link to="/jobs" className="text-indigo-600 hover:text-indigo-700 text-sm font-bold transition-all">
            View All Jobs &rarr;
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 text-xs font-bold uppercase tracking-wider">
                <th className="pb-4">Job ID</th>
                <th className="pb-4">Type</th>
                <th className="pb-4">Status</th>
                <th className="pb-4">Progress</th>
                <th className="pb-4">Started At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-600">
              {recentJobs.map((job) => (
                <tr key={job.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-4 font-mono font-bold text-slate-800">#{job.id}</td>
                  <td className="py-4 capitalize font-medium">{job.job_type.replace('_', ' ')}</td>
                  <td className="py-4">
                    <span className={`status-badge status-${job.status}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="py-4 font-semibold text-slate-700">
                    {job.processed_items} / {job.total_items}
                  </td>
                  <td className="py-4 text-slate-400">
                    {new Date(job.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
              {recentJobs.length === 0 && (
                <tr>
                  <td colSpan="5" className="text-center py-8 text-slate-400">
                    No jobs recorded yet.
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
