import React, { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, AlertCircle, Play, Ban, RefreshCcw } from 'lucide-react';
import useStore from '../store/useStore';
import toast from 'react-hot-toast';

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeJob, jobLogs, fetchJobDetails, cancelJob } = useStore();
  const terminalEndRef = useRef(null);

  useEffect(() => {
    fetchJobDetails(id);
    const interval = setInterval(() => {
      fetchJobDetails(id);
    }, 3000);
    return () => clearInterval(interval);
  }, [id]);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [jobLogs]);

  const handleCancel = async () => {
    const success = await cancelJob(id);
    if (success) {
      toast.success('Job cancellation requested');
      fetchJobDetails(id);
    } else {
      toast.error('Failed to cancel job');
    }
  };

  const getLogLevelClass = (level) => {
    switch (level.toLowerCase()) {
      case 'error': return 'text-red-400 font-semibold';
      case 'warning': return 'text-amber-400 font-semibold';
      case 'debug': return 'text-zinc-500';
      default: return 'text-zinc-300';
    }
  };

  if (!activeJob) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-zinc-500">
        Loading operation details...
      </div>
    );
  }

  const progressPercent = activeJob.total_items > 0 
    ? (activeJob.processed_items / activeJob.total_items) * 100 
    : 0;

  return (
    <div className="space-y-8 animate-fade-in p-6 max-w-7xl mx-auto w-full">
      {/* Back button & Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/jobs')}
          className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-zinc-300 rounded-xl transition-all cursor-pointer"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">Operation #{activeJob.id}</h1>
            <span className={`status-badge status-${activeJob.status}`}>
              {activeJob.status}
            </span>
          </div>
          <p className="text-zinc-500 text-sm mt-1 capitalize">{activeJob.job_type.replace('_', ' ')}</p>
        </div>
      </div>

      {/* Overview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-card p-6 lg:col-span-2 space-y-6">
          <h2 className="text-lg font-bold text-white">System Metrics</h2>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Completion Progress</span>
              <span className="font-semibold text-white">{activeJob.processed_items} / {activeJob.total_items} items ({progressPercent.toFixed(1)}%)</span>
            </div>
            <div className="w-full bg-white/5 rounded-full h-3 overflow-hidden">
              <div 
                className="bg-indigo-500 h-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4">
            <div className="bg-white/2 rounded-xl p-4 border border-white/5 text-center">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Processed</p>
              <p className="text-2xl font-bold text-white">{activeJob.processed_items}</p>
            </div>
            <div className="bg-white/2 rounded-xl p-4 border border-white/5 text-center">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Failed</p>
              <p className="text-2xl font-bold text-red-400">{activeJob.failed_items}</p>
            </div>
            <div className="bg-white/2 rounded-xl p-4 border border-white/5 text-center">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Total</p>
              <p className="text-2xl font-bold text-zinc-300">{activeJob.total_items}</p>
            </div>
          </div>
        </div>

        {/* Stats and Action panel */}
        <div className="glass-card p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white mb-4">Metadata</h2>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-500">Created:</span>
              <span className="text-zinc-300 font-semibold">{new Date(activeJob.created_at).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-500">Started:</span>
              <span className="text-zinc-300 font-semibold">{activeJob.started_at ? new Date(activeJob.started_at).toLocaleString() : '-'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-500">Completed:</span>
              <span className="text-zinc-300 font-semibold">{activeJob.completed_at ? new Date(activeJob.completed_at).toLocaleString() : '-'}</span>
            </div>
          </div>

          {activeJob.status === 'running' && (
            <button
              onClick={handleCancel}
              className="btn btn-danger w-full py-3 mt-6 flex items-center justify-center gap-2 cursor-pointer font-semibold"
            >
              <Ban className="h-4 w-4" />
              <span>Cancel Operation</span>
            </button>
          )}
        </div>
      </div>

      {/* Error Message banner */}
      {activeJob.error_message && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 text-red-400">
          <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
          <div>
            <h4 className="font-bold text-white text-sm">System Error Details</h4>
            <p className="text-sm mt-1">{activeJob.error_message}</p>
          </div>
        </div>
      )}

      {/* Terminal log panel */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-bold text-white mb-4">Console Output Logs</h2>
        <div className="bg-[#07070a] border border-white/5 rounded-xl p-4 font-mono text-xs overflow-y-auto max-h-96 min-h-64 space-y-2 flex flex-col">
          {jobLogs.length > 0 ? (
            jobLogs.map((log) => (
              <div key={log.id} className="flex gap-4">
                <span className="text-zinc-600 select-none">{new Date(log.created_at).toLocaleTimeString()}</span>
                <span className={`uppercase font-bold w-14 select-none ${getLogLevelClass(log.level)}`}>[{log.level}]</span>
                <span className={getLogLevelClass(log.level)}>{log.message}</span>
              </div>
            ))
          ) : (
            <div className="text-zinc-600 italic">No output logs recorded yet for this job.</div>
          )}
          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  );
}
