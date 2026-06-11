import React, { useEffect, useState } from 'react';
import {
  Calendar, Clock, Play, Pause, RefreshCw,
  AlertCircle, CheckCircle2, Zap, Layers,
  ChevronRight, Loader2, Ban,
} from 'lucide-react';
import useStore from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function Scheduler() {
  const {
    jobQueue, schedulerRunning, schedulerState, activeTasksCount,
    fetchJobQueue, pauseScheduler, resumeScheduler,
    pauseSchedulerJob, resumeSchedulerJob, runSchedulerJobNow,
  } = useStore();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState({});

  useEffect(() => {
    fetchJobQueue();
    const interval = setInterval(fetchJobQueue, 5000);
    return () => clearInterval(interval);
  }, []);

  const withLoading = async (key, fn) => {
    setActionLoading(p => ({ ...p, [key]: true }));
    try { await fn(); } finally {
      setActionLoading(p => ({ ...p, [key]: false }));
    }
  };

  const handlePauseScheduler = () => withLoading('scheduler', async () => {
    if (await pauseScheduler()) toast.success('Scheduler paused');
    else toast.error('Failed to pause scheduler');
  });

  const handleResumeScheduler = () => withLoading('scheduler', async () => {
    if (await resumeScheduler()) toast.success('Scheduler resumed');
    else toast.error('Failed to resume scheduler');
  });

  const handlePauseJob = (id) => withLoading(id, async () => {
    if (await pauseSchedulerJob(id)) toast.success('Schedule paused');
    else toast.error('Failed to pause schedule');
  });

  const handleResumeJob = (id) => withLoading(id, async () => {
    if (await resumeSchedulerJob(id)) toast.success('Schedule resumed');
    else toast.error('Failed to resume schedule');
  });

  const handleRunNow = (id) => withLoading(`run_${id}`, async () => {
    if (await runSchedulerJobNow(id)) toast.success('Triggered immediately');
    else toast.error('Failed to trigger');
  });

  // Group entries: pipeline jobs (job_N) vs sub-steps (sub_N_*)
  const pipelineJobs = jobQueue.filter(j => /^job_\d+$/.test(j.id));
  const subSteps = jobQueue.filter(j => /^sub_\d+_/.test(j.id));
  const otherJobs = jobQueue.filter(j => !/^job_\d+$/.test(j.id) && !/^sub_\d+_/.test(j.id));

  // Map sub-steps to their parent job id
  const subsByParent = {};
  subSteps.forEach(s => {
    const match = s.id.match(/^sub_(\d+)_/);
    if (match) {
      const parentId = match[1];
      if (!subsByParent[parentId]) subsByParent[parentId] = [];
      subsByParent[parentId].push(s);
    }
  });

  const schedulerStatusConfig = {
    running: { label: 'Running',  color: 'text-emerald-600', dot: 'bg-emerald-500 animate-pulse', card: 'from-emerald-50 to-white border-emerald-200' },
    paused:  { label: 'Paused',   color: 'text-amber-600',   dot: 'bg-amber-400',                 card: 'from-amber-50 to-white border-amber-200'   },
    stopped: { label: 'Stopped',  color: 'text-slate-500',   dot: 'bg-slate-300',                 card: 'from-slate-50 to-white border-slate-200'   },
  };
  const sCfg = schedulerStatusConfig[schedulerState] || schedulerStatusConfig.stopped;

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Job Scheduler</h1>
          <p className="text-sm text-slate-500 mt-0.5">Monitor and control the scraper pipeline engine and all registered task schedules.</p>
        </div>
        <button
          onClick={() => { fetchJobQueue(); toast.success('Refreshed'); }}
          className="btn btn-secondary cursor-pointer self-start"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* ── Engine Control Card ── */}
      <div className={`glass-card p-6 bg-gradient-to-r ${sCfg.card} border flex flex-col md:flex-row items-start md:items-center justify-between gap-5`}>
        <div className="flex items-start gap-4">
          <div className={`p-3.5 rounded-2xl ${schedulerState === 'running' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
            <Zap className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-base font-black text-slate-800">Scheduler Engine</h2>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${sCfg.color} ${schedulerState === 'running' ? 'bg-emerald-50 border-emerald-200' : schedulerState === 'paused' ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                <span className={`h-2 w-2 rounded-full ${sCfg.dot}`} />
                {sCfg.label}
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-md">When running, the engine executes crawler and scraper phases based on their configured triggers.</p>
            <div className="flex items-center gap-4 mt-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <span>Active threads: <span className="text-slate-700">{activeTasksCount}</span></span>
              <span>·</span>
              <span>Registered schedules: <span className="text-slate-700">{jobQueue.length}</span></span>
            </div>
          </div>
        </div>

        <div className="flex gap-3 self-end md:self-auto">
          {schedulerState === 'running' ? (
            <button
              onClick={handlePauseScheduler}
              disabled={!!actionLoading['scheduler']}
              className="btn bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 cursor-pointer"
            >
              {actionLoading['scheduler'] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
              Pause Scheduler
            </button>
          ) : (
            <button
              onClick={handleResumeScheduler}
              disabled={!!actionLoading['scheduler']}
              className="btn btn-primary cursor-pointer"
            >
              {actionLoading['scheduler'] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Resume Scheduler
            </button>
          )}
        </div>
      </div>

      {/* ── Pipeline Jobs ── */}
      {(pipelineJobs.length > 0 || subSteps.length > 0) && (
        <div className="glass-card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-indigo-50/40 flex items-center gap-2">
            <Layers className="h-4 w-4 text-indigo-500" />
            <h3 className="text-sm font-black text-slate-800">Active Pipeline Jobs</h3>
            <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-600 border border-indigo-200">
              {pipelineJobs.length} pipeline{pipelineJobs.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {pipelineJobs.map(job => {
              const parentId = job.id.replace('job_', '');
              const steps = subsByParent[parentId] || [];
              return (
                <div key={job.id} className="p-5">
                  {/* Parent pipeline row */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-600">Pipeline</span>
                      <span className="font-bold text-slate-700">{job.name}</span>
                      {job.db_job_id && (
                        <button onClick={() => navigate(`/jobs/${job.db_job_id}`)} className="text-[10px] font-mono text-indigo-500 hover:text-indigo-700 cursor-pointer">
                          Job #{job.db_job_id} ↗
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {job.is_running && (
                        <span className="flex items-center gap-1.5 text-indigo-600 text-xs font-bold animate-pulse">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Executing
                        </span>
                      )}
                      <button onClick={() => handleRunNow(job.id)} disabled={!!actionLoading[`run_${job.id}`] || job.is_running} className="p-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-colors cursor-pointer" title="Run immediately">
                        {actionLoading[`run_${job.id}`] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Phase steps */}
                  {steps.length > 0 && (
                    <div className="ml-4 space-y-2">
                      {steps.map((step, i) => (
                        <div key={step.id} className="flex items-center gap-3 pl-3 border-l-2 border-indigo-200">
                          <ChevronRight className="h-3.5 w-3.5 text-indigo-300 flex-shrink-0" />
                          <span className="text-xs font-bold text-slate-600 capitalize">{step.name.replace(/_/g, ' ')}</span>
                          {step.is_running && (
                            <span className="flex items-center gap-1 text-indigo-600 text-[10px] font-bold animate-pulse">
                              <Loader2 className="h-3 w-3 animate-spin" /> Running
                            </span>
                          )}
                          {step.next_run_time && !step.is_running && (
                            <span className="text-[10px] text-slate-400 font-mono">{new Date(step.next_run_time).toLocaleTimeString()}</span>
                          )}
                          <div className="ml-auto flex items-center gap-1.5">
                            {step.is_paused ? (
                              <button onClick={() => handleResumeJob(step.id)} className="p-1 rounded border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 cursor-pointer" title="Resume step">
                                <Play className="h-3 w-3" />
                              </button>
                            ) : (
                              <button onClick={() => handlePauseJob(step.id)} className="p-1 rounded border border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100 cursor-pointer" title="Pause step">
                                <Pause className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── All Scheduled Jobs ── */}
      <div className="glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-indigo-500" />
          <h3 className="text-sm font-black text-slate-800">All Registered Schedules</h3>
          <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
            {jobQueue.length} entries
          </span>
        </div>

        {jobQueue.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <AlertCircle className="h-9 w-9 text-slate-200 mx-auto" />
            <p className="text-sm font-bold text-slate-500">No scheduled entries</p>
            <p className="text-xs text-slate-400">Start an operation from the Operations page to see it here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/60 border-b border-slate-100 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                  <th className="px-5 py-3">ID / Name</th>
                  <th className="px-5 py-3">Trigger</th>
                  <th className="px-5 py-3">Next Fire</th>
                  <th className="px-5 py-3 w-28">State</th>
                  <th className="px-5 py-3 w-32 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {jobQueue.map(job => (
                  <tr key={job.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-slate-700 capitalize text-sm">{job.name.replace(/_/g, ' ')}</div>
                      <div className="font-mono text-[10px] text-slate-400">{job.id}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-xs text-slate-600">{job.trigger}</span>
                    </td>
                    <td className="px-5 py-3.5 text-xs">
                      {job.is_paused
                        ? <span className="italic text-slate-400">Paused</span>
                        : job.next_run_time
                          ? <span className="flex items-center gap-1 text-slate-600"><Clock className="h-3 w-3 text-slate-400" />{new Date(job.next_run_time).toLocaleString()}</span>
                          : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      {job.is_running ? (
                        <span className="flex items-center gap-1.5 text-indigo-600 text-xs font-bold animate-pulse">
                          <Loader2 className="h-3 w-3 animate-spin" /> Running
                        </span>
                      ) : job.is_paused ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-50 text-amber-600 border border-amber-200">Paused</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-50 text-emerald-600 border border-emerald-200">Active</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {job.is_paused ? (
                          <button onClick={() => handleResumeJob(job.id)} disabled={!!actionLoading[job.id]} className="p-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 cursor-pointer" title="Resume">
                            {actionLoading[job.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                          </button>
                        ) : (
                          <button onClick={() => handlePauseJob(job.id)} disabled={!!actionLoading[job.id]} className="p-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-600 cursor-pointer" title="Pause">
                            {actionLoading[job.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        <button onClick={() => handleRunNow(job.id)} disabled={!!actionLoading[`run_${job.id}`] || job.is_running} className="p-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 cursor-pointer disabled:opacity-40" title="Run now">
                          {actionLoading[`run_${job.id}`] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        </button>
                      </div>
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
