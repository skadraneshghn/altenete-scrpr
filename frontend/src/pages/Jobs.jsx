import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Play, Plus, X, RotateCcw, Ban, Eye, Loader2, Trash2,
  ChevronDown, ChevronRight, CheckCircle2, XCircle,
  Clock, Zap, AlertCircle, RefreshCw, Layers, Circle,
  Repeat, Pause, TimerReset, Radio, Timer,
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

// ─── Watches Panel ───────────────────────────────────────────────────────────
const REPEATABLE_TYPES = [
  { value: 'check_new',    label: 'Check New Topics (Quick Check)' },
  { value: 'scrape_posts', label: 'Scrape First Posts Only' },
];

function fmtInterval(secs) {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  return `${(secs / 3600).toFixed(1)}h`;
}

function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function WatchRow({ watch, configs, onToggle, onDelete, onIntervalSave }) {
  const [editing, setEditing] = useState(false);
  const [newSecs, setNewSecs] = useState(watch.interval_seconds);
  const cfg = configs.find(c => c.id === watch.config_id);

  const handleSave = async () => {
    const v = parseInt(newSecs, 10);
    if (isNaN(v) || v < 30) { toast.error('Minimum interval is 30 seconds'); return; }
    await onIntervalSave(watch.id, v);
    setEditing(false);
  };

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '14px 20px',
        background: watch.is_active ? '#f0fdf4' : '#f8fafc',
        border: `1px solid ${watch.is_active ? '#bbf7d0' : '#e2e8f0'}`,
        borderRadius: 12,
        transition: 'all 0.2s',
      }}
    >
      {/* Status dot */}
      <span
        style={{
          width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
          background: watch.is_active ? '#22c55e' : '#94a3b8',
          boxShadow: watch.is_active ? '0 0 0 3px rgba(34,197,94,0.2)' : 'none',
          animation: watch.is_active ? 'pulse 2s infinite' : 'none',
        }}
      />

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
            {REPEATABLE_TYPES.find(t => t.value === watch.job_type)?.label || watch.job_type}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
            background: '#e0e7ff', color: '#4338ca'
          }}>
            {cfg?.name || `Config #${watch.config_id}`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            <Timer style={{ display: 'inline', width: 12, height: 12, marginRight: 3 }} />
            Every <strong>{fmtInterval(watch.interval_seconds)}</strong>
          </span>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            Runs: <strong>{watch.run_count}</strong>
          </span>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            Last: <strong>{fmtTime(watch.last_run_at)}</strong>
          </span>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            Next: <strong>{fmtTime(watch.next_run_at)}</strong>
          </span>
        </div>
      </div>

      {/* Interval editor */}
      {editing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number" min={30} value={newSecs}
            onChange={e => setNewSecs(e.target.value)}
            style={{
              width: 80, padding: '5px 8px', border: '1px solid #6366f1',
              borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#1e293b',
              outline: 'none',
            }}
          />
          <span style={{ fontSize: 11, color: '#64748b' }}>s</span>
          <button onClick={handleSave} className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 11 }}>Save</button>
          <button onClick={() => setEditing(false)} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }}>Cancel</button>
        </div>
      ) : (
        <button
          onClick={() => { setNewSecs(watch.interval_seconds); setEditing(true); }}
          className="btn btn-secondary"
          style={{ padding: '4px 10px', fontSize: 11 }}
          title="Change interval"
        >
          <TimerReset style={{ width: 13, height: 13 }} />
        </button>
      )}

      {/* Toggle */}
      <button
        onClick={() => onToggle(watch.id)}
        className={`btn ${watch.is_active ? 'btn-secondary' : 'btn-primary'}`}
        style={{ padding: '5px 12px', fontSize: 11, minWidth: 72 }}
        title={watch.is_active ? 'Pause watch' : 'Resume watch'}
      >
        {watch.is_active
          ? <><Pause style={{ width: 12, height: 12 }} /> Pause</>
          : <><Play style={{ width: 12, height: 12 }} /> Resume</>
        }
      </button>

      {/* Delete */}
      <button
        onClick={() => onDelete(watch.id)}
        className="btn btn-danger"
        style={{ padding: '5px 10px', fontSize: 11 }}
        title="Delete watch"
      >
        <Trash2 style={{ width: 12, height: 12 }} />
      </button>
    </div>
  );
}

function WatchesPanel({ configs }) {
  const [watches, setWatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ job_type: 'check_new', config_id: '', interval_seconds: 60, label: '' });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setWatches(await apiService.getWatches()); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live refresh every 10s to update last_run_at / next_run_at / run_count
  useEffect(() => {
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.config_id) { toast.error('Select a forum configuration'); return; }
    setCreating(true);
    try {
      await apiService.createWatch({
        job_type: form.job_type,
        config_id: Number(form.config_id),
        interval_seconds: Number(form.interval_seconds),
        label: form.label || undefined,
      });
      toast.success('Watch created');
      setShowCreate(false);
      setForm({ job_type: 'check_new', config_id: '', interval_seconds: 60, label: '' });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to create watch');
    }
    setCreating(false);
  };

  const handleToggle = async (id) => {
    try { await apiService.toggleWatch(id); load(); toast.success('Watch updated'); }
    catch { toast.error('Failed to update watch'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this watch?')) return;
    try { await apiService.deleteWatch(id); load(); toast.success('Watch deleted'); }
    catch { toast.error('Failed to delete watch'); }
  };

  const handleIntervalSave = async (id, secs) => {
    try { await apiService.updateWatchInterval(id, secs); load(); toast.success('Interval updated'); }
    catch { toast.error('Failed to update interval'); }
  };

  const activeCount = watches.filter(w => w.is_active).length;

  return (
    <div className="glass-card p-6" style={{ marginTop: 8 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
          }}>
            <Radio style={{ width: 18, height: 18, color: '#fff' }} />
          </div>
          <div>
            <h2 style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', margin: 0 }}>Active Watches</h2>
            <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>
              {activeCount} active · {watches.length} total — auto-repeating operations
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} className="btn btn-secondary" style={{ padding: '6px 10px' }} title="Refresh">
            <RefreshCw style={{ width: 14, height: 14 }} />
          </button>
          <button onClick={() => setShowCreate(s => !s)} className="btn btn-primary" style={{ fontSize: 12 }}>
            <Plus style={{ width: 14, height: 14 }} />
            New Watch
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate}
          style={{
            background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12,
            padding: '16px 20px', marginBottom: 16,
          }}
        >
          <p style={{ fontWeight: 700, fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Configure New Watch
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Operation Type</label>
              <select value={form.job_type} onChange={e => setForm(f => ({ ...f, job_type: e.target.value }))} className="input-field" style={{ fontSize: 12 }}>
                {REPEATABLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Forum Config</label>
              <select value={form.config_id} onChange={e => setForm(f => ({ ...f, config_id: e.target.value }))} className="input-field" style={{ fontSize: 12 }} required>
                <option value="">Select config…</option>
                {configs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Interval (seconds)</label>
              <input
                type="number" min={30} value={form.interval_seconds}
                onChange={e => setForm(f => ({ ...f, interval_seconds: e.target.value }))}
                className="input-field" style={{ fontSize: 12 }} required
              />
              <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>
                {form.interval_seconds >= 60 ? `≈ ${Math.round(form.interval_seconds/60)} min` : ''}
                {form.interval_seconds < 60 && form.interval_seconds >= 30 ? `${form.interval_seconds}s (min 30s)` : ''}
              </p>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Label (optional)</label>
              <input
                type="text" value={form.label} maxLength={255}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Hourly new-topic check"
                className="input-field" style={{ fontSize: 12 }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={creating} className="btn btn-primary" style={{ fontSize: 12 }}>
              {creating ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> : <><Repeat style={{ width: 13, height: 13 }} /> Create Watch</>}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="btn btn-secondary" style={{ fontSize: 12 }}>Cancel</button>
          </div>
        </form>
      )}

      {/* Watch list */}
      {loading && watches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8' }}>
          <Loader2 style={{ width: 20, height: 20, display: 'inline' }} className="animate-spin" />
        </div>
      ) : watches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <Radio style={{ width: 32, height: 32, color: '#cbd5e1', margin: '0 auto 8px' }} />
          <p style={{ fontWeight: 700, color: '#64748b', fontSize: 13 }}>No watches yet</p>
          <p style={{ fontSize: 11, color: '#94a3b8' }}>Create a watch to automatically repeat an operation on an interval.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {watches.map(w => (
            <WatchRow
              key={w.id} watch={w} configs={configs}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onIntervalSave={handleIntervalSave}
            />
          ))}
        </div>
      )}
    </div>
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

      {/* ── Watches Panel ── */}
      <WatchesPanel configs={configs} />

      {/* ── New Operation Modal (Portal → renders directly on document.body) ── */}

      {isModalOpen && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 9999,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}
        >
          <div className="w-full max-w-md bg-white border border-slate-100 rounded-2xl shadow-2xl relative overflow-hidden animate-fade-in">
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
        </div>,
        document.body
      )}
    </div>
  );
}
