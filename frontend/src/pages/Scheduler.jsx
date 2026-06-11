import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Clock,
  Play,
  Pause,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Settings,
  Zap,
} from 'lucide-react';
import useStore from '../store/useStore';
import toast from 'react-hot-toast';

export default function Scheduler() {
  const {
    jobQueue,
    schedulerRunning,
    schedulerState,
    activeTasksCount,
    fetchJobQueue,
    pauseScheduler,
    resumeScheduler,
    pauseSchedulerJob,
    resumeSchedulerJob,
    runSchedulerJobNow,
  } = useStore();

  const [loading, setLoading] = useState(false);

  // Poll scheduler state every 5 seconds
  useEffect(() => {
    fetchJobQueue();
    const interval = setInterval(() => {
      fetchJobQueue();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handlePauseScheduler = async () => {
    setLoading(true);
    const success = await pauseScheduler();
    setLoading(false);
    if (success) {
      toast.success('Scheduler engine paused');
    } else {
      toast.error('Failed to pause scheduler');
    }
  };

  const handleResumeScheduler = async () => {
    setLoading(true);
    const success = await resumeScheduler();
    setLoading(false);
    if (success) {
      toast.success('Scheduler engine resumed');
    } else {
      toast.error('Failed to resume scheduler');
    }
  };

  const handlePauseJob = async (jobId) => {
    const success = await pauseSchedulerJob(jobId);
    if (success) {
      toast.success('Task schedule paused');
    } else {
      toast.error('Failed to pause task schedule');
    }
  };

  const handleResumeJob = async (jobId) => {
    const success = await resumeSchedulerJob(jobId);
    if (success) {
      toast.success('Task schedule resumed');
    } else {
      toast.error('Failed to resume task schedule');
    }
  };

  const handleRunJobNow = async (jobId) => {
    const success = await runSchedulerJobNow(jobId);
    if (success) {
      toast.success('Task triggered successfully');
    } else {
      toast.error('Failed to trigger task');
    }
  };

  const getSchedulerStatusBadge = () => {
    switch (schedulerState) {
      case 'running':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Running
          </span>
        );
      case 'paused':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-600 border border-amber-200">
            <span className="h-2 w-2 rounded-full bg-amber-500"></span>
            Paused
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-50 text-slate-600 border border-slate-200">
            <span className="h-2 w-2 rounded-full bg-slate-500"></span>
            Stopped
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Job Scheduler Handler</h1>
          <p className="text-sm text-slate-500 font-medium">Manage and monitor automated background task schedules.</p>
        </div>
        <button
          onClick={() => {
            fetchJobQueue();
            toast.success('Scheduler state updated');
          }}
          className="btn btn-secondary cursor-pointer self-start md:self-auto"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Scheduler Engine Control Panel */}
      <div className="glass-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className={`p-3.5 rounded-2xl ${schedulerState === 'running' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
            <Zap className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-bold text-slate-800">Scheduler Engine Status</h2>
              {getSchedulerStatusBadge()}
            </div>
            <p className="text-xs text-slate-500 font-medium max-w-lg">
              When the scheduler is active, it runs crawler and scraper processes based on configured intervals and cron timers.
            </p>
            <div className="text-xs text-slate-400 font-bold uppercase tracking-wider flex items-center gap-4 pt-1.5">
              <span>Active execution threads: {activeTasksCount}</span>
              <span>•</span>
              <span>Total jobs: {jobQueue.length}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end md:self-auto">
          {schedulerState === 'running' ? (
            <button
              onClick={handlePauseScheduler}
              disabled={loading}
              className="btn bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 cursor-pointer flex items-center gap-2"
            >
              <Pause className="h-4 w-4" />
              <span>Pause Scheduler</span>
            </button>
          ) : (
            <button
              onClick={handleResumeScheduler}
              disabled={loading}
              className="btn btn-primary cursor-pointer flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              <span>Resume Scheduler</span>
            </button>
          )}
        </div>
      </div>

      {/* Job Schedules Queue */}
      <div className="glass-card overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-indigo-500" />
            <h3 className="text-sm font-black text-slate-800">Job Schedules Queue</h3>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-600 border border-indigo-100">
            {jobQueue.length} Registered Schedules
          </span>
        </div>

        {jobQueue.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <AlertCircle className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700">No scheduled jobs registered</p>
            <p className="text-xs text-slate-400">Add settings configurations to setup automated scheduled crawls.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-400 text-xs font-bold uppercase tracking-wider">
                  <th className="px-6 py-4">Job / Trigger ID</th>
                  <th className="px-6 py-4">Job Name</th>
                  <th className="px-6 py-4">Trigger Configuration</th>
                  <th className="px-6 py-4">Next Fire Time</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {jobQueue.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-6 py-4.5 font-mono font-bold text-xs text-slate-400">
                      {job.id}
                    </td>
                    <td className="px-6 py-4.5">
                      <div className="font-bold text-slate-700 capitalize">
                        {job.name.replace(/_/g, ' ')}
                      </div>
                      {job.db_job_id && (
                        <div className="text-[10px] text-slate-400 font-semibold font-mono">
                          Linked DB Config #{job.db_job_id}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4.5">
                      <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 font-mono text-xs font-bold">
                        {job.trigger}
                      </span>
                    </td>
                    <td className="px-6 py-4.5">
                      {job.is_paused ? (
                        <span className="text-slate-400 font-bold italic">Paused</span>
                      ) : (
                        <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          <span>
                            {job.next_run_time
                              ? new Date(job.next_run_time).toLocaleString()
                              : 'Immediate'}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4.5">
                      {job.is_paused ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-600 border border-amber-200">
                          Paused
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-200">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4.5 text-right space-x-2">
                      {job.is_paused ? (
                        <button
                          onClick={() => handleResumeJob(job.id)}
                          className="p-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-colors cursor-pointer inline-flex items-center justify-center"
                          title="Resume Schedule"
                        >
                          <Play className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handlePauseJob(job.id)}
                          className="p-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-600 transition-colors cursor-pointer inline-flex items-center justify-center"
                          title="Pause Schedule"
                        >
                          <Pause className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleRunJobNow(job.id)}
                        disabled={job.is_running}
                        className={`p-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-colors cursor-pointer inline-flex items-center justify-center ${
                          job.is_running ? 'opacity-50 cursor-not-allowed animate-pulse' : ''
                        }`}
                        title="Run Immediately"
                      >
                        <RefreshCw className={`h-4 w-4 ${job.is_running ? 'animate-spin' : ''}`} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
