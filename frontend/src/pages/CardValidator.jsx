import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  CreditCard, Send, CheckCircle, XCircle, Clock, Loader, 
  AlertTriangle, ChevronDown, ChevronUp, Play, Square, 
  Trash2, Mail, Hash, Users, List, Search, Filter, 
  Activity, ArrowRight, Check, X, Info, HelpCircle
} from 'lucide-react';
import apiService from '../api/apiService';
import toast from 'react-hot-toast';

// Helper to parse card string in CARD|MM|YY|CVC format
function parseCard(raw) {
  const p = raw.split('|').map(s => s.trim());
  if (p.length !== 4) return null;
  return { cardnumber: p[0], month: p[1], year: p[2], cvc: p[3] };
}

// Helper to format elapsed time
function elapsed(ms) {
  if (ms == null) return '—';
  return ms >= 1000 ? `${(ms/1000).toFixed(1)}s` : `${ms}ms`;
}

// Custom modern Status Badge
function StatusBadge({ status, allOk }) {
  const baseStyle = {
    padding: '4px 10px',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: '700',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.03em'
  };

  if (status === 'pending') {
    return (
      <span style={{ ...baseStyle, background: 'rgba(148, 163, 184, 0.1)', color: '#64748b' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#64748b' }} />
        Pending
      </span>
    );
  }
  if (status === 'running') {
    return (
      <span style={{ ...baseStyle, background: 'rgba(59, 130, 246, 0.15)', color: '#2563eb' }}>
        <span style={{ 
          width: 6, 
          height: 6, 
          borderRadius: '50%', 
          background: '#3b82f6', 
          animation: 'pulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite' 
        }} />
        Running
      </span>
    );
  }
  if (status === 'completed' && allOk) {
    return (
      <span style={{ ...baseStyle, background: 'rgba(16, 185, 129, 0.15)', color: '#059669' }}>
        <CheckCircle style={{ width: 12, height: 12 }} />
        Passed
      </span>
    );
  }
  if (status === 'completed') {
    return (
      <span style={{ ...baseStyle, background: 'rgba(239, 68, 68, 0.15)', color: '#dc2626' }}>
        <XCircle style={{ width: 12, height: 12 }} />
        Failed
      </span>
    );
  }
  return (
    <span style={{ ...baseStyle, background: 'rgba(239, 68, 68, 0.15)', color: '#dc2626' }}>
      <AlertTriangle style={{ width: 12, height: 12 }} />
      Error
    </span>
  );
}

// Single card section
function SingleCardSection() {
  const [cardRaw, setCardRaw] = useState('');
  const [email, setEmail] = useState('olddealers@gmail.com');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showSteps, setShowSteps] = useState(true);
  const parsed = parseCard(cardRaw);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!parsed) {
      toast.error('Invalid card format. Use CARD|MM|YY|CVC');
      return;
    }
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const data = await apiService.validateCard(cardRaw, email);
      setResult(data);
      const allOk = data.steps?.every(s => s.ok);
      if (allOk) {
        toast.success('Card validated successfully!');
      } else {
        toast.error('Validation checkout failed.');
      }
    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const stepsOk = result?.steps?.filter(s => s.ok).length ?? 0;
  const stepsTotal = result?.steps?.length ?? 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
      {/* Left Input Card */}
      <div className="glass-card p-6" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
        <h3 className="text-sm font-extrabold text-slate-800 mb-5 flex items-center gap-2">
          <Hash className="w-4 h-4 text-indigo-600" />
          Single Card Verification
        </h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Card Pipe String *</label>
            <input 
              value={cardRaw} 
              onChange={e => setCardRaw(e.target.value)} 
              placeholder="4427567043223945|12|29|699" 
              className="input-field w-full font-mono text-sm" 
              style={{ padding: '10px 14px', borderRadius: '8px' }}
              required
            />
            {cardRaw && !parsed && (
              <p className="text-xs text-rose-600 mt-2 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                Format must be: CARDNUMBER|MM|YY|CVC
              </p>
            )}
            {parsed && (
              <div className="mt-3 p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs text-emerald-800 space-y-1">
                <div className="flex justify-between">
                  <span>Card Number:</span>
                  <strong className="font-mono">{parsed.cardnumber.slice(0, 4)}••••{parsed.cardnumber.slice(-4)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Expiry Date:</span>
                  <strong>{parsed.month}/{parsed.year}</strong>
                </div>
                <div className="flex justify-between">
                  <span>CVC:</span>
                  <strong>{parsed.cvc}</strong>
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Checkout Email *</label>
            <input 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              className="input-field w-full text-sm" 
              style={{ padding: '10px 14px', borderRadius: '8px' }}
              required
            />
          </div>
          <button 
            id="validate-single-btn" 
            type="submit" 
            disabled={loading || !parsed} 
            className="btn btn-primary w-full flex items-center justify-center gap-2 mt-2" 
            style={{ 
              padding: '12px', 
              fontSize: '13px', 
              fontWeight: '700', 
              borderRadius: '8px',
              textTransform: 'none',
              letterSpacing: 'normal',
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
              opacity: loading || !parsed ? 0.6 : 1
            }}
          >
            {loading ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Automating Checkout...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Validate Card
              </>
            )}
          </button>
        </form>
      </div>

      {/* Right Result View */}
      <div>
        {!result && !error && !loading && (
          <div className="glass-card p-12 text-center text-slate-400" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
              <CreditCard className="w-8 h-8 text-slate-300" />
            </div>
            <h4 className="text-slate-800 font-bold mb-1 text-sm">Awaiting Submission</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">Fill the card details and trigger automation check. Results will appear here.</p>
          </div>
        )}

        {loading && (
          <div className="glass-card p-12 text-center" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
            <div className="w-20 h-20 bg-indigo-50/50 rounded-full flex items-center justify-center mx-auto mb-6 relative">
              <div className="absolute inset-0 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
              <Activity className="w-8 h-8 text-indigo-600 animate-pulse" />
            </div>
            <h4 className="text-slate-800 font-extrabold mb-1">Testing Checkout Gateway</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">Connecting to external checkout gateway via security proxy. Please hold on...</p>
          </div>
        )}

        {error && (
          <div className="glass-card p-5 border-l-4 border-rose-500 bg-rose-50/30 rounded-xl" style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
            <div className="flex gap-3">
              <XCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
              <div>
                <h5 className="font-extrabold text-rose-900 text-sm mb-1">Gateway Execution Failed</h5>
                <p className="text-xs text-rose-800 leading-relaxed">{error}</p>
              </div>
            </div>
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-4">
            {/* Header info */}
            <div className="glass-card p-6" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-4 border-b border-slate-100">
                <span className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                  {stepsOk === stepsTotal && stepsTotal > 0 ? (
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                  )}
                  {stepsOk === stepsTotal && stepsTotal > 0 ? 'Checkout Verified' : `${stepsOk}/${stepsTotal} Phases Completed`}
                </span>
                <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                  <Clock className="w-3.5 h-3.5" />
                  Execution Time: {elapsed(result.elapsed_ms)}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-600">
                {result.title && (
                  <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span className="font-bold text-slate-500">Gateway Name:</span>
                    <span className="text-slate-800 font-semibold">{result.title}</span>
                  </div>
                )}
                {(result.generated_first_name || result.generated_last_name) && (
                  <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span className="font-bold text-slate-500">Name Generated:</span>
                    <span className="text-slate-800 font-semibold">{result.generated_first_name} {result.generated_last_name}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Automation Steps */}
            {result.steps?.length > 0 && (
              <div className="glass-card p-6" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
                <button 
                  onClick={() => setShowSteps(v => !v)} 
                  className="flex items-center justify-between w-full font-bold text-slate-700 text-xs tracking-wider uppercase"
                >
                  <span className="flex items-center gap-2">
                    <List className="w-4 h-4 text-indigo-500" />
                    Automation Logs ({stepsTotal})
                  </span>
                  {showSteps ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showSteps && (
                  <div className="mt-4 flex flex-col gap-2.5">
                    {result.steps.map((s, i) => (
                      <div 
                        key={i} 
                        className="flex items-center gap-3 p-3 rounded-xl border"
                        style={{
                          background: s.ok ? 'rgba(16, 185, 129, 0.04)' : 'rgba(239, 68, 68, 0.04)',
                          borderColor: s.ok ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'
                        }}
                      >
                        {s.ok ? (
                          <Check className="w-4 h-4 text-emerald-600 bg-emerald-100 rounded-full p-0.5 flex-shrink-0" />
                        ) : (
                          <X className="w-4 h-4 text-rose-600 bg-rose-100 rounded-full p-0.5 flex-shrink-0" />
                        )}
                        <span className="flex-1 text-xs font-semibold text-slate-700 capitalize">
                          {s.name.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                          {elapsed(s.elapsed_ms)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Bulk card validation section
function BulkCardSection() {
  const [cardsText, setCardsText] = useState('');
  const [emailsText, setEmailsText] = useState('olddealers@gmail.com');
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [results, setResults] = useState([]);
  const [progress, setProgress] = useState({ total: 0, processed: 0, failed: 0 });
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | passed | failed | pending
  const [wsConnected, setWsConnected] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null); // holds selected card info for logs modal
  
  const wsRef = useRef(null);

  const cards = useMemo(() => {
    return cardsText.split('\n').map(s => s.trim()).filter(Boolean);
  }, [cardsText]);

  const emails = useMemo(() => {
    return emailsText.split('\n').map(s => s.trim()).filter(Boolean);
  }, [emailsText]);

  const connectWs = useCallback((jid) => {
    if (wsRef.current) wsRef.current.close();
    setWsConnected(false);
    
    const url = apiService.getBulkWsUrl(jid);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'ping') return;

        if (msg.type === 'snapshot') {
          setJobStatus(msg.job_status);
          setProgress({ total: msg.total, processed: msg.processed, failed: msg.failed });
          setResults(msg.results || []);
        } else if (msg.type === 'progress') {
          setProgress({ total: msg.total, processed: msg.processed, failed: msg.failed });
        } else if (msg.type === 'card_start') {
          setResults(prev => prev.map(r => r.id === msg.result_id ? { ...r, status: 'running' } : r));
        } else if (msg.type === 'card_done') {
          setResults(prev => prev.map(r => r.id === msg.result_id ? {
            ...r,
            status: msg.status,
            all_steps_ok: msg.all_steps_ok,
            steps_passed: msg.steps_passed,
            steps_total: msg.steps_total,
            elapsed_ms: msg.elapsed_ms,
            error_message: msg.error,
            steps: msg.steps || []
          } : r));
          
          // update details modal if currently open on this card
          setSelectedCard(curr => {
            if (curr && curr.id === msg.result_id) {
              return {
                ...curr,
                status: msg.status,
                all_steps_ok: msg.all_steps_ok,
                steps_passed: msg.steps_passed,
                steps_total: msg.steps_total,
                elapsed_ms: msg.elapsed_ms,
                error_message: msg.error,
                steps: msg.steps || []
              };
            }
            return curr;
          });
        } else if (msg.type === 'job_done' || msg.type === 'job_cancelled' || msg.type === 'job_error') {
          setJobStatus(msg.type === 'job_done' ? 'completed' : msg.type === 'job_cancelled' ? 'cancelled' : 'failed');
        }
      } catch (err) {
        console.error('WS parse error:', err);
      }
    };

    ws.onerror = () => {
      setWsConnected(false);
      toast.error('WebSocket connection error.');
    };

    ws.onclose = () => {
      setWsConnected(false);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const handleStart = async () => {
    if (!cards.length) {
      toast.error('Please input at least one card.');
      return;
    }
    if (!emails.length) {
      toast.error('Please input at least one email address.');
      return;
    }
    setLoading(true);
    try {
      const data = await apiService.startBulkValidate(cards, emails);
      setJobId(data.job_id);
      setJobStatus('pending');
      setProgress({ total: data.total, processed: 0, failed: 0 });
      setResults([]);
      toast.success(`Validation queue started. Total: ${data.total} cards`);
      connectWs(data.job_id);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to trigger bulk validation.');
    } finally {
      setLoading(false);
    }
  };

  const percentage = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
  const isRunning = jobStatus === 'pending' || jobStatus === 'running';

  // Filter and Search Logic
  const filteredResults = useMemo(() => {
    return results.filter(r => {
      const cardNum = r.card_number || '';
      const cardRaw = r.card_raw || '';
      const emailVal = r.email || '';
      const matchesSearch = 
        cardNum.includes(searchQuery) || 
        cardRaw.includes(searchQuery) || 
        emailVal.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter === 'all') return true;
      if (statusFilter === 'passed') return r.status === 'completed' && r.all_steps_ok;
      if (statusFilter === 'failed') return r.status === 'failed' || (r.status === 'completed' && !r.all_steps_ok);
      if (statusFilter === 'pending') return r.status === 'pending' || r.status === 'running';
      return true;
    });
  }, [results, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const passed = results.filter(r => r.status === 'completed' && r.all_steps_ok).length;
    const failed = results.filter(r => r.status === 'failed' || (r.status === 'completed' && !r.all_steps_ok)).length;
    const pending = results.filter(r => r.status === 'pending' || r.status === 'running').length;
    const rate = results.filter(r => r.status === 'completed').length > 0 
      ? Math.round((passed / (passed + failed)) * 100) 
      : 0;

    return { passed, failed, pending, rate };
  }, [results]);

  return (
    <div className="mt-2 space-y-6">
      {/* Dynamic Textarea Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card p-5" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <List className="w-3.5 h-3.5 text-indigo-500" />
            Credit Card List ({cards.length})
          </label>
          <textarea
            value={cardsText}
            onChange={e => setCardsText(e.target.value)}
            placeholder={"4427567043223945|12|29|699\n4778720027006001|11|27|362\n4556123488771120|08|30|199"}
            className="input-field w-full font-mono text-xs"
            style={{ height: '160px', resize: 'vertical', borderRadius: '8px', padding: '12px' }}
          />
          <p className="text-[10px] text-slate-400 mt-2">One card details per line using the pipe separator: CARD|MM|YY|CVC</p>
        </div>

        <div className="glass-card p-5" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-indigo-500" />
            Email Pool ({emails.length})
          </label>
          <textarea
            value={emailsText}
            onChange={e => setEmailsText(e.target.value)}
            placeholder={"olddealers@gmail.com\noperator_checkout@yahoo.com\ncustomer_mock@gmail.com"}
            className="input-field w-full font-mono text-xs"
            style={{ height: '160px', resize: 'vertical', borderRadius: '8px', padding: '12px' }}
          />
          <p className="text-[10px] text-slate-400 mt-2">One email address per line. Verification will pick one at random for each checkout.</p>
        </div>
      </div>

      {/* Control Actions & WebSocket Status */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/60">
        <div className="flex items-center gap-3">
          <button 
            id="bulk-start-btn" 
            onClick={handleStart} 
            disabled={loading || isRunning} 
            className="btn btn-primary flex items-center gap-2"
            style={{ 
              padding: '11px 24px', 
              fontSize: '13px', 
              fontWeight: '700', 
              borderRadius: '8px',
              textTransform: 'none',
              letterSpacing: 'normal',
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.2)',
              opacity: loading || isRunning ? 0.6 : 1
            }}
          >
            {loading || isRunning ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Processing Jobs...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Start Bulk Check
              </>
            )}
          </button>
          
          {jobId && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-semibold">Job ID: #{jobId}</span>
              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full" />
              {wsConnected ? (
                <span className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                  Live Sync Active
                </span>
              ) : (
                <span className="text-xs text-amber-600 font-bold">Connecting Pipeline...</span>
              )}
            </div>
          )}
        </div>

        {jobStatus && (
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 bg-white px-3.5 py-1.5 rounded-xl border border-slate-200 shadow-sm">
            Status: 
            <span className="capitalize" style={{
              color: jobStatus === 'completed' ? '#059669' : jobStatus === 'running' || jobStatus === 'pending' ? '#2563eb' : '#dc2626'
            }}>{jobStatus}</span>
          </div>
        )}
      </div>

      {/* Progress & Live Queue Stats */}
      {progress.total > 0 && (
        <div className="glass-card p-5" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold text-slate-800">{progress.processed} of {progress.total} Tested</span>
              <span className="text-xs text-slate-400">({stats.pending} left in pipeline queue)</span>
            </div>
            <span className="text-sm font-black text-indigo-600">{percentage}% Completed</span>
          </div>
          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
            <div 
              className="h-full bg-gradient-to-r from-indigo-500 to-violet-600 rounded-full transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-4 border-t border-slate-100">
            <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100 text-center">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Success Rate</span>
              <strong className="text-lg font-black text-emerald-600">{stats.rate}%</strong>
            </div>
            <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100 text-center">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Passed Checks</span>
              <strong className="text-lg font-black text-emerald-600">{stats.passed}</strong>
            </div>
            <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100 text-center">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Failed Checks</span>
              <strong className="text-lg font-black text-rose-600">{stats.failed}</strong>
            </div>
            <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100 text-center">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Limit Threshold</span>
              <strong className="text-lg font-black text-slate-600">5 / Sec</strong>
            </div>
          </div>
        </div>
      )}

      {/* Results Filter & Table */}
      {results.length > 0 && (
        <div className="glass-card overflow-hidden" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
          {/* Filter Bar */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/30 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm w-fit">
              {['all', 'passed', 'failed', 'pending'].map(f => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize"
                  style={{
                    background: statusFilter === f ? '#4f46e5' : 'transparent',
                    color: statusFilter === f ? '#ffffff' : '#64748b'
                  }}
                >
                  {f === 'pending' ? 'Testing' : f}
                </button>
              ))}
            </div>

            <div className="relative flex-1 md:max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search card or email..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="input-field text-xs pl-9 w-full bg-white"
                style={{ padding: '8px 12px 8px 36px', borderRadius: '10px' }}
              />
            </div>
          </div>

          {/* Results Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4 text-left font-bold w-12">#</th>
                  <th className="py-3 px-4 text-left font-bold">Credit Card String</th>
                  <th className="py-3 px-4 text-left font-bold">Assigned Email</th>
                  <th className="py-3 px-4 text-center font-bold">Status Badge</th>
                  <th className="py-3 px-4 text-center font-bold">Steps Passed</th>
                  <th className="py-3 px-4 text-right font-bold">Duration</th>
                  <th className="py-3 px-4 text-center font-bold w-20">Logs</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((r, i) => (
                  <tr 
                    key={r.id} 
                    className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors"
                    style={{
                      background: r.status === 'running' ? 'rgba(59, 130, 246, 0.03)' : i % 2 === 0 ? '#ffffff' : '#fafbfc'
                    }}
                  >
                    <td className="py-3.5 px-4 font-bold text-slate-400">{i + 1}</td>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-700">
                      {r.card_number ? (
                        <span>{r.card_number.slice(0, 4)} •••• •••• {r.card_number.slice(-4)}</span>
                      ) : (
                        <span>{r.card_raw}</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 font-medium">{r.email}</td>
                    <td className="py-3.5 px-4 text-center">
                      <StatusBadge status={r.status} allOk={r.all_steps_ok} />
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold">
                      {r.steps_total != null ? (
                        <span style={{ color: r.all_steps_ok ? '#059669' : '#dc2626' }}>
                          {r.steps_passed} / {r.steps_total}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-500 font-medium">
                      {elapsed(r.elapsed_ms)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button 
                        onClick={() => setSelectedCard(r)}
                        className="px-2.5 py-1 rounded bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 transition-colors border border-slate-200 text-[10px] font-bold text-slate-600 flex items-center justify-center gap-1 mx-auto"
                      >
                        <Info className="w-3 h-3" />
                        Logs
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredResults.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 font-semibold">
                      No matching checkout records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Selected Card Logs Modal */}
      {selectedCard && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setSelectedCard(null)}
        >
          <div 
            className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[85vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-indigo-500" />
                  Checkout Details
                </h4>
                <p className="text-[10px] text-slate-400 mt-1 font-mono">{selectedCard.card_raw}</p>
              </div>
              <button 
                onClick={() => setSelectedCard(null)}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <span className="block text-[10px] text-slate-400 font-bold mb-0.5">Checkout Email</span>
                  <span className="font-semibold text-slate-700">{selectedCard.email}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <span className="block text-[10px] text-slate-400 font-bold mb-0.5">Execution Status</span>
                  <span className="font-semibold text-slate-700 capitalize">{selectedCard.status}</span>
                </div>
              </div>

              {selectedCard.error_message && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-100 text-xs text-rose-800">
                  <div className="flex gap-2">
                    <XCircle className="w-4.5 h-4.5 text-rose-600 flex-shrink-0" />
                    <div>
                      <strong className="block font-bold mb-0.5">Checkout Gateway Rejection:</strong>
                      <span className="leading-relaxed">{selectedCard.error_message}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Automation steps */}
              <div>
                <h5 className="font-bold text-slate-700 text-xs uppercase tracking-wider mb-2.5">Automation Pipeline Log</h5>
                {selectedCard.steps && selectedCard.steps.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {selectedCard.steps.map((s, i) => (
                      <div 
                        key={i}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 text-xs bg-slate-50/50"
                      >
                        <div className="flex items-center gap-2">
                          {s.ok ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600 bg-emerald-100 rounded-full p-0.5" />
                          ) : (
                            <X className="w-3.5 h-3.5 text-rose-600 bg-rose-100 rounded-full p-0.5" />
                          )}
                          <span className="font-semibold text-slate-700 capitalize">{s.name.replace(/_/g, ' ')}</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">{elapsed(s.elapsed_ms)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
                    <HelpCircle className="w-6 h-6 mx-auto mb-1.5 text-slate-300" />
                    <p className="text-[11px]">No step log captured. Card is still in validation queue or failed prior to launch.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button 
                onClick={() => setSelectedCard(null)}
                className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 transition-colors text-xs font-bold text-slate-700"
              >
                Close Logs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Main container component
export default function CardValidator() {
  const [tab, setTab] = useState('single');

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto p-4 sm:p-6">
      {/* Header Info */}
      <div className="flex items-start gap-4 mb-2">
        <div className="w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center bg-gradient-to-tr from-indigo-500 via-indigo-600 to-purple-600 shadow-[0_4px_14px_rgba(79,70,229,0.35)]">
          <CreditCard className="w-5.5 h-5.5 text-white" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-none">Credit Card Validation Gateway</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-2 font-medium">Verify customer payment details via live automated security checkout proxy checks.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 bg-slate-200/50 p-1.5 rounded-2xl w-fit border border-slate-200/40">
        {[
          { key: 'single', label: 'Single Validation', icon: Hash },
          { key: 'bulk', label: 'Bulk Validation Queue', icon: Users }
        ].map(t => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer"
              style={{
                background: isActive ? '#ffffff' : 'transparent',
                color: isActive ? '#4f46e5' : '#64748b',
                boxShadow: isActive ? '0 4px 12px rgba(0,0,0,0.04)' : 'none'
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Sub sections */}
      <div className="transition-all duration-300">
        {tab === 'single' ? <SingleCardSection /> : <BulkCardSection />}
      </div>
    </div>
  );
}
