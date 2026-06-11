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
      case 'error': return 'text-red-400 font-bold';
      case 'warning': return 'text-amber-400 font-bold';
      case 'debug': return 'text-slate-500';
      default: return 'text-slate-200';
    }
  };

  if (!activeJob) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-slate-400 font-medium">
        Loading operation details...
      </div>
    );
  }

  const progressPercent = activeJob.total_items > 0 
    ? (activeJob.processed_items / activeJob.total_items) * 100 
    : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back button & Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/jobs')}
          className="p-2.5 bg-white hover:bg-slate-50 border border-slate-100 rounded-xl transition-all cursor-pointer shadow-xs"
        >
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Operation #{activeJob.id}</h1>
            <span className={`status-badge status-${activeJob.status}`}>
              {activeJob.status}
            </span>
          </div>
          <p className="text-slate-400 text-sm mt-1.5 font-bold uppercase tracking-wider capitalize">{activeJob.job_type.replace('_', ' ')}</p>
        </div>
      </div>

      {/* Overview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-card p-6 lg:col-span-2 space-y-6">
          <h2 className="text-lg font-bold text-slate-800">System Metrics</h2>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400 font-medium">Completion Progress</span>
              <span className="font-bold text-slate-700">{activeJob.processed_items} / {activeJob.total_items} items ({progressPercent.toFixed(1)}%)</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
              <div 
                className="bg-indigo-600 h-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4">
            <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100 text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Processed</p>
              <p className="text-2xl font-extrabold text-slate-800">{activeJob.processed_items}</p>
            </div>
            <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100 text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Failed</p>
              <p className="text-2xl font-extrabold text-red-500">{activeJob.failed_items}</p>
            </div>
            <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100 text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total</p>
              <p className="text-2xl font-extrabold text-slate-600">{activeJob.total_items}</p>
            </div>
          </div>
        </div>

        {/* Stats and Action panel */}
        <div className="glass-card p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Metadata</h2>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400 font-semibold">Created:</span>
              <span className="text-slate-700 font-bold">{new Date(activeJob.created_at).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400 font-semibold">Started:</span>
              <span className="text-slate-700 font-bold">{activeJob.started_at ? new Date(activeJob.started_at).toLocaleString() : '-'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400 font-semibold">Completed:</span>
              <span className="text-slate-700 font-bold">{activeJob.completed_at ? new Date(activeJob.completed_at).toLocaleString() : '-'}</span>
            </div>
          </div>

          {activeJob.status === 'running' && (
            <button
              onClick={handleCancel}
              className="btn btn-danger w-full py-3 mt-6 flex items-center justify-center gap-2 cursor-pointer font-bold"
            >
              <Ban className="h-4 w-4" />
              <span>Cancel Operation</span>
            </button>
          )}
        </div>
      </div>

      {/* Error Message banner */}
      {activeJob.error_message && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 text-red-600 shadow-xs">
          <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
          <div>
            <h4 className="font-extrabold text-slate-800 text-sm">System Error Details</h4>
            <p className="text-sm mt-1.5 font-medium">{activeJob.error_message}</p>
          </div>
        </div>
      )}

      {/* Terminal log panel */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Console Output Logs</h2>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 font-mono text-xs overflow-y-auto max-h-96 min-h-64 space-y-2 flex flex-col shadow-inner">
          {jobLogs.length > 0 ? (
            jobLogs.map((log) => (
              <div key={log.id} className="flex gap-4">
                <span className="text-slate-500 select-none">{new Date(log.created_at).toLocaleTimeString()}</span>
                <span className={`uppercase font-bold w-14 select-none ${getLogLevelClass(log.level)}`}>[{log.level}]</span>
                <span className={getLogLevelClass(log.level)}>{log.message}</span>
              </div>
            ))
          ) : (
            <div className="text-slate-500 italic">No output logs recorded yet for this job.</div>
          )}
          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  );
}
