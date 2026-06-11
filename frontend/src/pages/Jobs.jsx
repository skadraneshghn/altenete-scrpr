import React, { useEffect, useState } from 'react';
import { Play, Plus, X, RotateCcw, Ban, Eye, Loader2 } from 'lucide-react';
import useStore from '../store/useStore';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export default function Jobs() {
  const navigate = useNavigate();
  const { 
    jobs, 
    totalJobs, 
    configs, 
    fetchJobs, 
    fetchConfigs, 
    createJob, 
    cancelJob, 
    retryJob 
  } = useStore();

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [jobType, setJobType] = useState('full_run');
  const [configId, setConfigId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchJobs(page, statusFilter);
    fetchConfigs();
    const interval = setInterval(() => {
      fetchJobs(page, statusFilter);
    }, 5000);
    return () => clearInterval(interval);
  }, [page, statusFilter]);

  const handleCreateJob = async (e) => {
    e.preventDefault();
    if (!configId) {
      toast.error('Please select a forum configuration');
      return;
    }
    setSubmitting(true);
    const success = await createJob({ job_type: jobType, config_id: Number(configId) });
    setSubmitting(false);
    if (success) {
      toast.success('Job started successfully');
      setIsModalOpen(false);
      fetchJobs(1, statusFilter);
    } else {
      toast.error('Failed to start job');
    }
  };

  const handleCancel = async (id) => {
    const success = await cancelJob(id);
    if (success) {
      toast.success('Job cancellation requested');
    } else {
      toast.error('Failed to cancel job');
    }
  };

  const handleRetry = async (id) => {
    const success = await retryJob(id);
    if (success) {
      toast.success('Retrying job...');
    } else {
      toast.error('Failed to retry job');
    }
  };

  return (
    <div className="space-y-8 animate-fade-in p-6 max-w-7xl mx-auto w-full">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Scraping Operations</h1>
          <p className="text-zinc-500 text-sm mt-1">Configure and manage crawler or scraper tasks</p>
        </div>
        <button
          onClick={() => {
            if (configs.length === 0) {
              toast.error('Please create a settings configuration first');
              return;
            }
            setConfigId(configs[0]?.id || '');
            setIsModalOpen(true);
          }}
          className="btn btn-primary cursor-pointer"
        >
          <Plus className="h-5 w-5" />
          <span>New Operation</span>
        </button>
      </div>

      {/* Filter options */}
      <div className="flex items-center gap-4">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="input-field max-w-xs"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Jobs Table */}
      <div className="glass-card p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 text-zinc-400 text-xs font-semibold uppercase tracking-wider">
                <th className="pb-4">Job ID</th>
                <th className="pb-4">Operation Type</th>
                <th className="pb-4">Status</th>
                <th className="pb-4">Progress / Pages</th>
                <th className="pb-4">Failed Items</th>
                <th className="pb-4">Started At</th>
                <th className="pb-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm text-zinc-300">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-white/2 transition-all duration-200">
                  <td className="py-4 font-mono font-medium text-white">#{job.id}</td>
                  <td className="py-4 capitalize">{job.job_type.replace('_', ' ')}</td>
                  <td className="py-4">
                    <span className={`status-badge status-${job.status}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="py-4">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-zinc-200">
                        {job.processed_items} / {job.total_items}
                      </span>
                      {job.status === 'running' && (
                        <div className="w-24 bg-white/5 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className="bg-indigo-500 h-full transition-all duration-500"
                            style={{ width: `${job.total_items > 0 ? (job.processed_items / job.total_items) * 100 : 0}%` }}
                          ></div>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-4 text-red-400">{job.failed_items}</td>
                  <td className="py-4 text-zinc-500">
                    {job.started_at ? new Date(job.started_at).toLocaleString() : '-'}
                  </td>
                  <td className="py-4 text-right space-x-2">
                    <button
                      onClick={() => navigate(`/jobs/${job.id}`)}
                      className="p-2 hover:bg-white/5 text-zinc-400 hover:text-white rounded-lg transition-all duration-200 cursor-pointer"
                      title="View logs"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    {(job.status === 'running' || job.status === 'pending') && (
                      <button
                        onClick={() => handleCancel(job.id)}
                        className="p-2 hover:bg-red-500/10 text-red-400 hover:text-red-300 rounded-lg transition-all duration-200 cursor-pointer"
                        title="Cancel job"
                      >
                        <Ban className="h-4 w-4" />
                      </button>
                    )}
                    {job.status === 'failed' && (
                      <button
                        onClick={() => handleRetry(job.id)}
                        className="p-2 hover:bg-indigo-500/10 text-indigo-400 hover:text-indigo-300 rounded-lg transition-all duration-200 cursor-pointer"
                        title="Retry job"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center py-12 text-zinc-500">
                    No scraping operations found matching criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalJobs > 10 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/5">
            <span className="text-xs text-zinc-500">Showing {jobs.length} of {totalJobs} entries</span>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="btn btn-secondary py-1.5 px-3"
              >
                Previous
              </button>
              <span className="text-sm text-zinc-400 font-semibold">{page}</span>
              <button
                disabled={page * 10 >= totalJobs}
                onClick={() => setPage(page + 1)}
                className="btn btn-secondary py-1.5 px-3"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-md bg-[#12121a] border border-white/10 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute right-4 top-4 text-zinc-500 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-xl font-bold text-white mb-6">Start Scraping Operation</h2>

            <form onSubmit={handleCreateJob} className="space-y-6">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Target Config</label>
                <select
                  value={configId}
                  onChange={(e) => setConfigId(e.target.value)}
                  className="input-field"
                  required
                >
                  {configs.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.forum_url})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Operation Type</label>
                <select
                  value={jobType}
                  onChange={(e) => setJobType(e.target.value)}
                  className="input-field"
                >
                  <option value="full_run">Full Run (Crawl & Scrape)</option>
                  <option value="crawl_forum">Crawl Forum (Collect thread URLs)</option>
                  <option value="scrape_threads">Scrape Threads (Extract first post)</option>
                </select>
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      <span>Start Job</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
