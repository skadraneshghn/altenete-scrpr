import React, { useEffect, useState } from 'react';
import {
  Calendar, Clock, Play, Pause, RefreshCw,
  AlertCircle, Zap, Layers, ChevronRight,
  Loader2, CheckCircle2, XCircle, Activity,
} from 'lucide-react';
import useStore from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

// ─── Status / trigger badge helpers ─────────────────────────────────────────
function TriggerBadge({ trigger, isRunning }) {
  if (isRunning) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-200 animate-pulse">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        Executing
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[11px] text-slate-600">
      {trigger}
    </span>
  );
}

function MiniProgress({ processed, total }) {
  if (!total || total === 0) return null;
  const pct = Math.round((processed / total) * 100);
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="w-24 bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-bold text-slate-500">{processed}/{total} ({pct}%)</span>
    </div>
  );
}

// ─── Main Scheduler page ─────────────────────────────────────────────────────
export default function Scheduler() {
  const {
    jobQueue, schedulerRunning, schedulerState, activeTasksCount,
    fetchJobQueue, pauseScheduler, resumeScheduler,
    pauseSchedulerJob, resumeSchedulerJob, runSchedulerJobNow,
  } = useStore();
  const navigate = useNavigate();

  const [actionLoading, setActionLoading] = useState({});

  useEffect(() => {
    fetchJobQueue();
    // Faster polling while jobs are running
    const interval = setInterval(fetchJobQueue, 4000);
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

  // Separate running vs pending entries
  const runningEntries = jobQueue.filter(j => j.is_running);
  const pendingEntries = jobQueue.filter(j => !j.is_running);

  // Group: pipeline parents vs sub-phases vs standalone
  const pipelineParents = runningEntries.filter(j => !j.parent_job_id && j.job_type === 'full_run');
  const subPhases      = runningEntries.filter(j => j.parent_job_id);
  const standAlone     = runningEntries.filter(j => !j.parent_job_id && j.job_type !== 'full_run');

  // Map sub-phases by parent_job_id
  const subByParent = {};
  subPhases.forEach(s => {
    const pid = String(s.parent_job_id);
    if (!subByParent[pid]) subByParent[pid] = [];
    subByParent[pid].push(s);
  });

  const schedulerStatusConfig = {
    running: { label: 'Running', dot: 'bg-emerald-500 animate-pulse', color: 'text-emerald-600', cardBg: 'from-emerald-50 to-white border-emerald-200' },
    paused:  { label: 'Paused',  dot: 'bg-amber-400',                 color: 'text-amber-600',   cardBg: 'from-amber-50 to-white border-amber-200'   },
    stopped: { label: 'Stopped', dot: 'bg-slate-300',                 color: 'text-slate-400',   cardBg: 'from-slate-50 to-white border-slate-200'   },
  };
  const sCfg = schedulerStatusConfig[schedulerState] || schedulerStatusConfig.stopped;

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Job Scheduler</h1>
          <p className="text-sm text-slate-500 mt-0.5">Monitor and control the scraper pipeline engine and all task schedules.</p>
        </div>
        <button onClick={() => { fetchJobQueue(); toast.success('Refreshed'); }} className="btn btn-secondary cursor-pointer self-start">
          <RefreshCw className="h-4 w-4" />Refresh
        </button>
      </div>

      {/* ── Scheduler Engine Card ── */}
      <div className={`glass-card p-6 bg-gradient-to-r ${sCfg.cardBg} border flex flex-col md:flex-row items-start md:items-center justify-between gap-5`}>
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
            <button onClick={handlePauseScheduler} disabled={!!actionLoading['scheduler']} className="btn bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 cursor-pointer">
              {actionLoading['scheduler'] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
              Pause Scheduler
            </button>
          ) : (
            <button onClick={handleResumeScheduler} disabled={!!actionLoading['scheduler']} className="btn btn-primary cursor-pointer">
              {actionLoading['scheduler'] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Resume Scheduler
            </button>
          )}
        </div>
      </div>

      {/* ── Currently Running Jobs ── */}
      {runningEntries.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-indigo-50/40 flex items-center gap-2">
            <Activity className="h-4 w-4 text-indigo-500" />
            <h3 className="text-sm font-black text-slate-800">Currently Executing</h3>
            <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-600 border border-indigo-200 animate-pulse">
              {runningEntries.length} active
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {/* Pipeline parents with their sub-phases */}
            {pipelineParents.map(parent => {
              const pid = String(parent.db_job_id);
              const steps = subByParent[pid] || [];
              return (
                <div key={parent.id} className="p-5 bg-indigo-50/10">
                  {/* Parent row */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-xl bg-indigo-100 text-indigo-600 mt-0.5">
                        <Layers className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-800 text-sm">Full Pipeline Run</span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-indigo-100 text-indigo-600">Pipeline</span>
                          <button onClick={() => navigate(`/jobs/${parent.db_job_id}`)} className="text-[10px] font-mono text-indigo-500 hover:text-indigo-700 cursor-pointer">
                            Job #{parent.db_job_id} ↗
                          </button>
                        </div>
                        <TriggerBadge trigger={parent.trigger} isRunning />
                        {parent.total_items > 0 && (
                          <MiniProgress processed={parent.processed_items} total={parent.total_items} />
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRunNow(parent.id)}
                      disabled
                      className="p-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed"
                      title="Already running"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Sub-phases */}
                  {steps.length > 0 && (
                    <div className="ml-11 mt-3 space-y-2">
                      {steps.map(step => (
                        <div key={step.id} className="flex items-center gap-3 pl-3 border-l-2 border-indigo-200 py-1">
                          <ChevronRight className="h-3.5 w-3.5 text-indigo-300 flex-shrink-0" />
                          <div>
                            <span className="text-xs font-bold text-slate-700">{step.phase || step.name}</span>
                            <TriggerBadge trigger="" isRunning />
                          </div>
                          {step.total_items > 0 && (
                            <div className="ml-auto">
                              <MiniProgress processed={step.processed_items} total={step.total_items} />
                            </div>
                          )}
                          <button onClick={() => navigate(`/jobs/${step.db_job_id}`)} className="p-1 rounded text-slate-400 hover:text-indigo-600 cursor-pointer text-[10px] font-mono">
                            #{step.db_job_id} ↗
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Standalone running jobs (crawl-only, scrape-only, or sub-jobs not linked) */}
            {standAlone.map(job => (
              <div key={job.id} className="p-5 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-indigo-100 text-indigo-600 mt-0.5">
                    <Activity className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-slate-800 text-sm capitalize">{job.name}</span>
                      {job.db_job_id && (
                        <button onClick={() => navigate(`/jobs/${job.db_job_id}`)} className="text-[10px] font-mono text-indigo-500 hover:text-indigo-700 cursor-pointer">
                          Job #{job.db_job_id} ↗
                        </button>
                      )}
                    </div>
                    <TriggerBadge trigger={job.trigger} isRunning />
                    {job.total_items > 0 && (
                      <MiniProgress processed={job.processed_items} total={job.total_items} />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Pending / Scheduled Entries ── */}
      <div className="glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-indigo-500" />
          <h3 className="text-sm font-black text-slate-800">Scheduled Queue</h3>
          <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
            {pendingEntries.length} pending
          </span>
        </div>

        {pendingEntries.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <AlertCircle className="h-9 w-9 text-slate-200 mx-auto" />
            <p className="text-sm font-bold text-slate-500">No pending scheduled entries</p>
            <p className="text-xs text-slate-400">
              {runningEntries.length > 0
                ? 'All registered jobs are currently executing (shown above).'
                : 'Start an operation from the Operations page to see it here.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/60 border-b border-slate-100 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                  <th className="px-5 py-3">Job / Name</th>
                  <th className="px-5 py-3">Trigger</th>
                  <th className="px-5 py-3">Next Fire</th>
                  <th className="px-5 py-3 w-28">State</th>
                  <th className="px-5 py-3 w-36 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {pendingEntries.map(job => (
                  <tr key={job.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-slate-700 text-sm capitalize">{job.name}</div>
                      <div className="font-mono text-[10px] text-slate-400">{job.id}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <TriggerBadge trigger={job.trigger} isRunning={false} />
                    </td>
                    <td className="px-5 py-3.5 text-xs">
                      {job.is_paused
                        ? <span className="italic text-slate-400">Paused</span>
                        : job.next_run_time
                          ? <span className="flex items-center gap-1 text-slate-600"><Clock className="h-3 w-3 text-slate-400" />{new Date(job.next_run_time).toLocaleString()}</span>
                          : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      {job.is_paused ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-50 text-amber-600 border border-amber-200">Paused</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-50 text-slate-500 border border-slate-200">Queued</span>
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
                        <button onClick={() => handleRunNow(job.id)} disabled={!!actionLoading[`run_${job.id}`]} className="p-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 cursor-pointer disabled:opacity-40" title="Run now">
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
