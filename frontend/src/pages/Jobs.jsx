import React, { useEffect, useState, useCallback } from 'react';
import {
  Play, Plus, X, RotateCcw, Ban, Eye, Loader2, Trash2,
  ChevronDown, ChevronRight, CheckCircle2, XCircle,
  Clock, Zap, AlertCircle, RefreshCw, Layers, Circle,
} from 'lucide-react';
import useStore from '../store/useStore';
import apiService from '../api/apiService';
import toast from 'react-hot-toast';
import { useNavigate, Link } from 'react-router-dom';

// ─── Status helpers ─────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:   { color: 'text-amber-600',  bg: 'bg-amber-50',   border: 'border-amber-200',  Icon: Clock,         label: 'Pending'   },
  running:   { color: 'text-indigo-600', bg: 'bg-indigo-50',  border: 'border-indigo-200', Icon: Loader2,       label: 'Running'   },
  completed: { color: 'text-emerald-600',bg: 'bg-emerald-50', border: 'border-emerald-200',Icon: CheckCircle2,  label: 'Completed' },
  failed:    { color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200',    Icon: XCircle,       label: 'Failed'    },
  cancelled: { color: 'text-slate-500',  bg: 'bg-slate-50',   border: 'border-slate-200',  Icon: AlertCircle,   label: 'Cancelled' },
};

function StatusBadge({ status, small = false }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const { Icon, label, color, bg, border } = cfg;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-bold ${bg} ${border} ${color} ${small ? 'text-[10px]' : 'text-xs'}`}>
      <Icon className={`${small ? 'h-2.5 w-2.5' : 'h-3 w-3'} ${status === 'running' ? 'animate-spin' : ''}`} />
      {label}
    </span>
  );
}

function ProgressBar({ processed, total, status }) {
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  if (total === 0) return <span className="text-slate-400 text-xs">—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${status === 'completed' ? 'bg-emerald-500' : status === 'failed' ? 'bg-red-400' : 'bg-indigo-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-bold text-slate-600">{processed}/{total}</span>
    </div>
  );
}

function SubJobRow({ sub, onView, onCancel }) {
  const phase = sub.phase || sub.job_type.replace(/_/g, ' ');
  return (
    <tr className="bg-indigo-50/30 border-b border-indigo-100/60 hover:bg-indigo-50/50 transition-colors">
      <td className="pl-14 pr-4 py-3 text-xs font-mono text-slate-400">
        <div className="flex items-center gap-2">
          <div className="w-px h-5 bg-indigo-200 mr-1" />
          #{sub.id}
        </div>
      </td>
      <td className="px-4 py-3 text-xs font-semibold text-indigo-700 capitalize">
        {phase}
      </td>
      <td className="px-4 py-3"><StatusBadge status={sub.status} small /></td>
      <td className="px-4 py-3"><ProgressBar processed={sub.processed_items} total={sub.total_items} status={sub.status} /></td>
      <td className="px-4 py-3 text-xs text-red-500 font-bold">{sub.failed_items > 0 ? sub.failed_items : '—'}</td>
      <td className="px-4 py-3 text-xs text-slate-400">
        {sub.started_at ? new Date(sub.started_at).toLocaleTimeString() : '—'}
      </td>
      <td className="px-4 py-3 text-right">
        <button onClick={() => onView(sub.id)} className="p-1.5 rounded-lg hover:bg-white text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer" title="View logs">
          <Eye className="h-3.5 w-3.5" />
        </button>
        {(sub.status === 'running' || sub.status === 'pending') && (
          <button onClick={() => onCancel(sub.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors cursor-pointer ml-1" title="Cancel phase">
            <Ban className="h-3.5 w-3.5" />
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── Parent job row with expandable sub-jobs ─────────────────────────────────
function JobRow({ job, onView, onCancel, onRetry, onDelete, onExpandChange }) {
  const [expanded, setExpanded] = useState(false);
  const [subJobs, setSubJobs] = useState([]);
  const [subLoading, setSubLoading] = useState(false);
  const navigate = useNavigate();

  const toggleExpand = async () => {
    const next = !expanded;
    setExpanded(next);
    onExpandChange?.(job.id, next);
    if (next && subJobs.length === 0) {
      setSubLoading(true);
      try {
        const data = await apiService.getSubJobs(job.id);
        setSubJobs(data || []);
      } catch {
        setSubJobs([]);
      }
      setSubLoading(false);
    }
  };

  // Auto-refresh sub-jobs while parent is running
  useEffect(() => {
    if (!expanded || job.status !== 'running') return;
    const id = setInterval(async () => {
      try {
        const data = await apiService.getSubJobs(job.id);
        setSubJobs(data || []);
      } catch {}
    }, 3000);
    return () => clearInterval(id);
  }, [expanded, job.status, job.id]);

  const isFull = job.job_type === 'full_run';
  const hasPhases = isFull;
  const typeLabel = job.job_type.replace(/_/g, ' ');

  return (
    <>
      <tr className={`hover:bg-slate-50/60 transition-all duration-150 border-b border-slate-100 ${expanded ? 'bg-slate-50/40' : ''}`}>
        {/* Expand toggle */}
        <td className="px-4 py-4">
          <div className="flex items-center gap-2">
            {hasPhases ? (
              <button onClick={toggleExpand} className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer">
                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            ) : (
              <div className="w-6 flex justify-center">
                <Circle className="h-2 w-2 text-slate-300" />
              </div>
            )}
            <span className="font-mono font-bold text-slate-700 text-sm">#{job.id}</span>
          </div>
        </td>

        {/* Type */}
        <td className="px-4 py-4">
          <div className="flex items-center gap-2">
            {isFull && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-600">Pipeline</span>
            )}
            <span className="font-semibold text-slate-700 capitalize text-sm">{typeLabel}</span>
          </div>
          {job.config_id && (
            <span className="text-[10px] text-slate-400 font-mono">Config #{job.config_id}</span>
          )}
        </td>

        {/* Status */}
        <td className="px-4 py-4"><StatusBadge status={job.status} /></td>

        {/* Progress */}
        <td className="px-4 py-4">
          {isFull && subJobs.length > 0 ? (
            <div className="space-y-1">
              {subJobs.map(s => (
                <div key={s.id} className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400 w-16 truncate">{s.phase?.replace('Phase ', 'P') || s.job_type}</span>
                  <div className="flex-1"><ProgressBar processed={s.processed_items} total={s.total_items} status={s.status} /></div>
                </div>
              ))}
            </div>
          ) : (
            <ProgressBar processed={job.processed_items} total={job.total_items} status={job.status} />
          )}
        </td>

        {/* Failed */}
        <td className="px-4 py-4 text-sm">
          {job.failed_items > 0
            ? <span className="text-red-500 font-bold">{job.failed_items}</span>
            : <span className="text-slate-300">—</span>}
        </td>

        {/* Created */}
        <td className="px-4 py-4 text-xs text-slate-400">
          {new Date(job.created_at).toLocaleString()}
        </td>

        {/* Actions */}
        <td className="px-4 py-4 text-right">
          <div className="flex items-center justify-end gap-1">
            <button onClick={() => navigate(`/jobs/${job.id}`)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer" title="View logs">
              <Eye className="h-4 w-4" />
            </button>
            {(job.status === 'running' || job.status === 'pending') && (
              <button onClick={() => onCancel(job.id)} className="p-2 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors cursor-pointer" title="Cancel">
                <Ban className="h-4 w-4" />
              </button>
            )}
            {job.status === 'failed' && (
              <button onClick={() => onRetry(job.id)} className="p-2 rounded-xl hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer" title="Retry">
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
            {job.status !== 'running' && job.status !== 'pending' && (
              <button onClick={() => onDelete(job.id)} className="p-2 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors cursor-pointer" title="Delete">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Expanded sub-job rows */}
      {expanded && (
        <>
          {subLoading ? (
            <tr className="bg-indigo-50/20">
              <td colSpan="7" className="pl-14 py-3 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading pipeline phases…
                </div>
              </td>
            </tr>
          ) : subJobs.length === 0 ? (
            <tr className="bg-indigo-50/20">
              <td colSpan="7" className="pl-14 py-3 text-xs text-slate-400 italic">
                No pipeline phases started yet — job may be queued.
              </td>
            </tr>
          ) : (
            subJobs.map(s => (
              <SubJobRow
                key={s.id}
                sub={s}
                onView={(id) => navigate(`/jobs/${id}`)}
                onCancel={onCancel}
              />
            ))
          )}
        </>
      )}
    </>
  );
}

// ─── Main Jobs page ──────────────────────────────────────────────────────────
export default function Jobs() {
  const {
    jobs, totalJobs, configs,
    fetchJobs, fetchConfigs,
    createJob, cancelJob, retryJob, deleteJob,
    jobQueue, schedulerRunning, schedulerState, activeTasksCount,
    fetchJobQueue,
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
    fetchJobQueue();
    const interval = setInterval(() => {
      fetchJobs(page, statusFilter);
      fetchJobQueue();
    }, 5000);
    return () => clearInterval(interval);
  }, [page, statusFilter]);

  const handleCreateJob = async (e) => {
    e.preventDefault();
    if (!configId) { toast.error('Select a forum configuration'); return; }
    setSubmitting(true);
    const success = await createJob({ job_type: jobType, config_id: Number(configId) });
    setSubmitting(false);
    if (success) {
      toast.success('Operation queued successfully');
      setIsModalOpen(false);
      fetchJobs(1, statusFilter);
    } else {
      toast.error('Failed to queue operation');
    }
  };

  const handleCancel = async (id) => {
    if (await cancelJob(id)) toast.success('Cancellation requested');
    else toast.error('Failed to cancel');
  };

  const handleRetry = async (id) => {
    if (await retryJob(id)) toast.success('Retrying…');
    else toast.error('Failed to retry');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this job and all its logs?')) return;
    if (await deleteJob(id)) toast.success('Job deleted');
    else toast.error('Failed to delete');
  };

  // Scheduler state pill
  const schedulerPill = schedulerState === 'running'
    ? <span className="flex items-center gap-1.5 text-emerald-600 font-bold text-xs"><span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />Running</span>
    : schedulerState === 'paused'
    ? <span className="flex items-center gap-1.5 text-amber-600 font-bold text-xs"><span className="h-2 w-2 rounded-full bg-amber-400" />Paused</span>
    : <span className="flex items-center gap-1.5 text-slate-400 font-bold text-xs"><span className="h-2 w-2 rounded-full bg-slate-300" />Stopped</span>;

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Operations</h1>
          <p className="text-sm text-slate-500 mt-0.5">Each operation runs as a sequential pipeline of phases managed by the job scheduler.</p>
        </div>
        <button
          onClick={() => {
            if (configs.length === 0) { toast.error('Create a settings configuration first'); return; }
            setConfigId(String(configs[0]?.id || ''));
            setIsModalOpen(true);
          }}
          className="btn btn-primary cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>New Operation</span>
        </button>
      </div>

      {/* ── Scheduler status strip ── */}
      <div className="glass-card px-5 py-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Zap className={`h-4 w-4 ${schedulerRunning ? 'text-emerald-500' : 'text-slate-300'}`} />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Scheduler Engine</span>
            <div className="ml-1">{schedulerPill}</div>
          </div>
          <div className="h-4 w-px bg-slate-200" />
          <div className="text-xs text-slate-500 font-medium">
            <span className="font-bold text-slate-700">{activeTasksCount}</span> active &nbsp;·&nbsp;
            <span className="font-bold text-slate-700">{jobQueue.length}</span> scheduled
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { fetchJobs(page, statusFilter); fetchJobQueue(); }}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          {/* Link to Scheduler page */}
          <Link to="/scheduler" className="btn btn-secondary text-xs py-1.5 px-3 cursor-pointer">
            <Layers className="h-3.5 w-3.5" />
            Manage Schedules
          </Link>
        </div>
      </div>

      {/* ── Status filter ── */}
      <div className="flex items-center gap-3">
        {['', 'pending', 'running', 'completed', 'failed', 'cancelled'].map(s => (
          <button
            key={s || 'all'}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${statusFilter === s
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'}`}
          >
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400">{totalJobs} total operations</span>
      </div>

      {/* ── Jobs Table ── */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-400 text-xs font-bold uppercase tracking-wider">
                <th className="px-4 py-4 w-32">Job ID</th>
                <th className="px-4 py-4">Operation</th>
                <th className="px-4 py-4 w-36">Status</th>
                <th className="px-4 py-4">Progress</th>
                <th className="px-4 py-4 w-20">Errors</th>
                <th className="px-4 py-4 w-40">Created</th>
                <th className="px-4 py-4 w-36 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-16">
                    <div className="space-y-2">
                      <Layers className="h-10 w-10 text-slate-200 mx-auto" />
                      <p className="text-sm font-bold text-slate-500">No operations found</p>
                      <p className="text-xs text-slate-400">Start a new operation using the button above.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                jobs.map(job => (
                  <JobRow
                    key={job.id}
                    job={job}
                    onView={(id) => {}}
                    onCancel={handleCancel}
                    onRetry={handleRetry}
                    onDelete={handleDelete}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalJobs > 10 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50/30">
            <span className="text-xs text-slate-400">Showing {jobs.length} of {totalJobs} operations</span>
            <div className="flex items-center gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn btn-secondary py-1.5 px-3 text-xs disabled:opacity-40">Previous</button>
              <span className="text-xs font-bold text-slate-600 px-2">{page}</span>
              <button disabled={page * 10 >= totalJobs} onClick={() => setPage(p => p + 1)} className="btn btn-secondary py-1.5 px-3 text-xs disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* ── New Operation Modal ── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-md bg-white border border-slate-100 rounded-2xl shadow-2xl relative overflow-hidden">
            {/* Modal header */}
            <div className="px-6 pt-6 pb-4 border-b border-slate-100">
              <button onClick={() => setIsModalOpen(false)} className="absolute right-4 top-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
              <h2 className="text-lg font-black text-slate-800">New Scraping Operation</h2>
              <p className="text-xs text-slate-500 mt-1">Operations run as sequential pipeline phases managed by the job scheduler.</p>
            </div>

            <form onSubmit={handleCreateJob} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Forum Configuration</label>
                <select value={configId} onChange={e => setConfigId(e.target.value)} className="input-field" required>
                  {configs.map(c => (
                    <option key={c.id} value={c.id}>{c.name} — {c.forum_url}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Operation Type</label>
                <div className="space-y-2">
                  {[
                    { value: 'full_run',       label: 'Full Pipeline Run', desc: 'Phase 1: Crawl forum  →  Phase 2: Scrape threads', pill: 'Recommended' },
                    { value: 'check_new',      label: 'Check New Topics Only (Quick Check)', desc: 'Fetch page 1 of the forum and index newly posted topics', pill: 'New / Fast' },
                    { value: 'scrape_posts',   label: 'Scrape First Posts Only', desc: 'Extract first-post text from all indexed threads — fast, single-request per thread', pill: '⚡ Efficient' },
                    { value: 'crawl_forum',    label: 'Crawl Forum Only',  desc: 'Discover & index thread URLs only',                 pill: null },
                    { value: 'scrape_threads', label: 'Scrape Threads Only (Multi-page)', desc: 'Extract posts across all pages from already-indexed threads', pill: null },
                  ].map(opt => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${jobType === opt.value ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-indigo-200'}`}
                    >
                      <input type="radio" name="jobType" value={opt.value} checked={jobType === opt.value} onChange={e => setJobType(e.target.value)} className="mt-0.5 accent-indigo-600" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 text-sm">{opt.label}</span>
                          {opt.pill && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-600">{opt.pill}</span>}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {jobType === 'full_run' && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-indigo-50 border border-indigo-100 text-xs text-indigo-700">
                  <Layers className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <span>This creates a pipeline job with 2 phases. Each phase appears as an individual sub-job visible in the Job Scheduler page.</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary flex-1 cursor-pointer">Cancel</button>
                <button type="submit" disabled={submitting} className="btn btn-primary flex-1 cursor-pointer">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Play className="h-4 w-4" /><span>Start Operation</span></>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
