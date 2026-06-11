import React, { useEffect } from 'react';
import { 
  FileText, 
  Database, 
  Activity, 
  CheckCircle, 
  Clock, 
  AlertTriangle 
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
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/10',
    },
    {
      name: 'Total First Posts Saved',
      value: dashboardStats?.total_posts ?? 0,
      icon: Database,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
    },
    {
      name: 'Active Running Jobs',
      value: dashboardStats?.active_jobs ?? 0,
      icon: Activity,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      name: 'Scraper Success Rate',
      value: `${dashboardStats?.success_rate ?? 0}%`,
      icon: CheckCircle,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in p-6 max-w-7xl mx-auto w-full">
      {/* Page Title Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Overview Dashboard</h1>
        <p className="text-zinc-500 text-sm mt-1">Real-time metrics, system health, and crawling status</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={idx} className="glass-card p-6 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{stat.name}</p>
                <p className="text-3xl font-bold text-white">{stat.value}</p>
              </div>
              <div className={`p-4 rounded-2xl ${stat.bg}`}>
                <Icon className={`h-6 w-6 ${stat.color}`} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Chart Section */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-bold text-white mb-6">Discovery & Scraping Activity</h2>
        <div className="h-80 w-full">
          {dashboardActivity.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dashboardActivity}>
                <defs>
                  <linearGradient id="colorThreads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorPosts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" stroke="#71717a" fontSize={11} />
                <YAxis stroke="#71717a" fontSize={11} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#12121a', 
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    color: '#fff'
                  }} 
                />
                <Area type="monotone" dataKey="threads" name="Discovered Threads" stroke="#6366f1" fillOpacity={1} fill="url(#colorThreads)" strokeWidth={2} />
                <Area type="monotone" dataKey="posts" name="Scraped Posts" stroke="#a855f7" fillOpacity={1} fill="url(#colorPosts)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-zinc-500">
              No activity data recorded in the last 30 days
            </div>
          )}
        </div>
      </div>

      {/* Recent Jobs Table */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white font-semibold">Recent Scraping Operations</h2>
          <Link to="/jobs" className="text-indigo-400 hover:text-indigo-300 text-sm font-semibold transition-all">
            View All Jobs &rarr;
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 text-zinc-400 text-xs font-semibold uppercase tracking-wider">
                <th className="pb-4">Job ID</th>
                <th className="pb-4">Type</th>
                <th className="pb-4">Status</th>
                <th className="pb-4">Progress</th>
                <th className="pb-4">Started At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm text-zinc-300">
              {recentJobs.map((job) => (
                <tr key={job.id} className="hover:bg-white/2 transition-colors">
                  <td className="py-4 font-mono font-medium text-white">#{job.id}</td>
                  <td className="py-4 capitalize">{job.job_type.replace('_', ' ')}</td>
                  <td className="py-4">
                    <span className={`status-badge status-${job.status}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="py-4">
                    {job.processed_items} / {job.total_items}
                  </td>
                  <td className="py-4 text-zinc-500">
                    {new Date(job.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
              {recentJobs.length === 0 && (
                <tr>
                  <td colSpan="5" className="text-center py-8 text-zinc-500">
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
