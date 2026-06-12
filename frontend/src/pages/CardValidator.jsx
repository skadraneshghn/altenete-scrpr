import React, { useState } from 'react';
import {
  CreditCard, Send, CheckCircle, XCircle, Clock, Globe,
  ChevronDown, ChevronUp, Image, Zap, Mail, Hash, Lock,
  AlertTriangle, Loader, Info, Code,
} from 'lucide-react';
import apiService from '../api/apiService';
import toast from 'react-hot-toast';

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseCard(raw) {
  const parts = raw.split('|').map((p) => p.trim());
  if (parts.length !== 4) return null;
  const [cardnumber, month, year, cvc] = parts;
  return { cardnumber, month, year, cvc };
}

function elapsed(ms) {
  if (ms == null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

// ─── sub-components ──────────────────────────────────────────────────────────

function StepRow({ step }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        border: '1px solid',
        borderColor: step.ok ? '#d1fae5' : '#fee2e2',
        borderRadius: 10,
        overflow: 'hidden',
        transition: 'box-shadow .15s',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          background: step.ok ? '#f0fdf4' : '#fef2f2',
          cursor: 'pointer',
          border: 'none',
          textAlign: 'left',
        }}
      >
        {step.ok
          ? <CheckCircle style={{ width: 16, height: 16, color: '#16a34a', flexShrink: 0 }} />
          : <XCircle    style={{ width: 16, height: 16, color: '#dc2626', flexShrink: 0 }} />}
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: step.ok ? '#15803d' : '#991b1b' }}>
          {step.name.replace(/_/g, ' ')}
        </span>
        <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
          {elapsed(step.elapsed_ms)}
        </span>
        {open
          ? <ChevronUp  style={{ width: 14, height: 14, color: '#94a3b8' }} />
          : <ChevronDown style={{ width: 14, height: 14, color: '#94a3b8' }} />}
      </button>

      {open && (
        <div style={{ padding: '10px 14px', background: '#fff', fontSize: 12, color: '#334155', fontFamily: 'monospace', wordBreak: 'break-all' }}>
          {typeof step.detail === 'string'
            ? step.detail
            : JSON.stringify(step.detail, null, 2)}
        </div>
      )}
    </div>
  );
}

function ApiCallRow({ call }) {
  const [open, setOpen] = useState(false);
  const ok = call.status >= 200 && call.status < 300;
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 14px', background: '#f8fafc', cursor: 'pointer', border: 'none', textAlign: 'left',
        }}
      >
        <span style={{
          padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
          background: call.method === 'POST' ? '#ede9fe' : '#e0f2fe',
          color: call.method === 'POST' ? '#7c3aed' : '#0369a1',
        }}>{call.method}</span>
        <span style={{ flex: 1, fontSize: 12, color: '#334155', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {call.url}
        </span>
        <span style={{
          padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
          background: ok ? '#d1fae5' : '#fee2e2',
          color: ok ? '#065f46' : '#991b1b',
        }}>{call.status}</span>
        {open ? <ChevronUp style={{ width: 13, height: 13, color: '#94a3b8' }} />
               : <ChevronDown style={{ width: 13, height: 13, color: '#94a3b8' }} />}
      </button>

      {open && call.response_body && (
        <pre style={{ margin: 0, padding: '10px 14px', background: '#0f172a', color: '#e2e8f0', fontSize: 11, overflowX: 'auto', maxHeight: 280, lineHeight: 1.6 }}>
          {typeof call.response_body === 'string'
            ? call.response_body
            : JSON.stringify(call.response_body, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function CardValidator() {
  const [cardRaw, setCardRaw]     = useState('');
  const [email, setEmail]         = useState('olddealers@gmail.com');
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState(null);
  const [showScreenshot, setShowScreenshot] = useState(false);

  // Live parse for preview
  const parsed = parseCard(cardRaw);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!parsed) {
      toast.error('Card must be in the format: CARDNUMBER|MM|YY|CVC');
      return;
    }
    if (!email) {
      toast.error('Email is required');
      return;
    }
    setLoading(true);
    setResult(null);
    setError(null);
    setShowScreenshot(false);

    try {
      const data = await apiService.validateCard(cardRaw, email);
      setResult(data);

      // Determine overall success from steps
      const allOk = Array.isArray(data.steps) && data.steps.every((s) => s.ok);
      if (allOk) {
        toast.success('Card validation completed successfully!');
      } else {
        toast.error('Some steps failed — check the results below.');
      }
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Validation failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Summary badges
  const successSteps = result?.steps?.filter((s) => s.ok).length ?? 0;
  const totalSteps   = result?.steps?.length ?? 0;
  const allOk        = totalSteps > 0 && successSteps === totalSteps;

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Page Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 4 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14, flexShrink: 0,
          background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
          boxShadow: '0 4px 14px rgba(79,70,229,.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <CreditCard style={{ width: 24, height: 24, color: '#fff' }} />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Card Validator</h1>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            Submit a customer credit card for validation through the automated checkout checker.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 24, alignItems: 'start' }}>

        {/* ── Left: Input Form ── */}
        <div className="glass-card" style={{ padding: 28 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Hash style={{ width: 16, height: 16, color: '#4f46e5' }} />
            Card Details
          </h2>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Card Raw Input */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                Card Data <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                id="card-raw-input"
                type="text"
                value={cardRaw}
                onChange={(e) => setCardRaw(e.target.value)}
                placeholder="4427567043223945|12|29|699"
                className="input-field"
                style={{ fontFamily: 'monospace', letterSpacing: '0.04em' }}
                required
              />
              <p style={{ fontSize: 11, color: '#64748b', marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Info style={{ width: 12, height: 12, flexShrink: 0 }} />
                Format: <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 4, color: '#4f46e5', fontWeight: 700 }}>CARDNUMBER|MM|YY|CVC</code>
              </p>
            </div>

            {/* Live Parse Preview */}
            {cardRaw && (
              <div style={{
                padding: '12px 14px',
                background: parsed ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${parsed ? '#bbf7d0' : '#fecaca'}`,
                borderRadius: 10,
              }}>
                {parsed ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                    <FieldPreview label="Card Number" value={parsed.cardnumber} />
                    <FieldPreview label="Expiry"      value={`${parsed.month} / ${parsed.year}`} />
                    <FieldPreview label="CVC"         value={parsed.cvc} />
                    <FieldPreview label="Expiry (raw)" value={`${parsed.month}/${parsed.year}`} />
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: '#dc2626', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle style={{ width: 14, height: 14 }} />
                    Invalid format — need exactly 4 pipe-separated parts
                  </p>
                )}
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                Email <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <Mail style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#94a3b8' }} />
                <input
                  id="card-email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  style={{ paddingLeft: 36 }}
                  required
                />
              </div>
            </div>

            {/* Submit */}
            <button
              id="validate-card-btn"
              type="submit"
              disabled={loading || !parsed}
              className="btn btn-primary"
              style={{
                padding: '13px 20px',
                fontSize: 14,
                fontWeight: 700,
                borderRadius: 10,
                marginTop: 4,
                textTransform: 'none',
                letterSpacing: 'normal',
                opacity: loading || !parsed ? 0.6 : 1,
                cursor: loading || !parsed ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? (
                <>
                  <Loader style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
                  Validating…
                </>
              ) : (
                <>
                  <Send style={{ width: 16, height: 16 }} />
                  Validate Card
                </>
              )}
            </button>
          </form>

          {/* Info block */}
          <div style={{ marginTop: 20, padding: '12px 14px', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 10, fontSize: 11, color: '#4338ca', lineHeight: 1.6 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Lock style={{ width: 13, height: 13, flexShrink: 0, marginTop: 2 }} />
              <span>Validation is performed via an isolated headless browser session. Card data is transmitted securely and is not stored locally.</span>
            </div>
          </div>
        </div>

        {/* ── Right: Result Panel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Empty / Loading state */}
          {!result && !error && !loading && (
            <div className="glass-card" style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
              <CreditCard style={{ width: 40, height: 40, margin: '0 auto 12px', opacity: 0.35 }} />
              <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>No results yet</p>
              <p style={{ fontSize: 12, marginTop: 6 }}>Submit a card on the left to see validation results here.</p>
            </div>
          )}

          {loading && (
            <div className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, margin: '0 auto 16px', borderRadius: '50%', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 24px rgba(79,70,229,.35)' }}>
                <Loader style={{ width: 26, height: 26, color: '#fff', animation: 'spin 1s linear infinite' }} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>Processing card…</p>
              <p style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>The automated checkout flow is running. This may take up to 45 seconds.</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="glass-card" style={{ padding: 24, borderLeft: '4px solid #dc2626', background: '#fff5f5' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <XCircle style={{ width: 22, height: 22, color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontWeight: 700, color: '#991b1b', fontSize: 14, margin: '0 0 4px' }}>Validation Error</p>
                  <p style={{ fontSize: 12, color: '#7f1d1d', margin: 0 }}>{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <>
              {/* Summary card */}
              <div className="glass-card" style={{ padding: 22 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {allOk
                      ? <CheckCircle style={{ width: 22, height: 22, color: '#16a34a' }} />
                      : <AlertTriangle style={{ width: 22, height: 22, color: '#d97706' }} />}
                    <span style={{ fontWeight: 800, fontSize: 15, color: allOk ? '#15803d' : '#92400e' }}>
                      {allOk ? 'All steps passed' : `${successSteps} / ${totalSteps} steps passed`}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Clock style={{ width: 12, height: 12 }} />
                    {elapsed(result.elapsed_ms)} total
                  </span>
                </div>

                {/* Meta */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <MetaItem icon={<Globe />} label="Title"      value={result.title} />
                  <MetaItem icon={<Globe />} label="Final URL"  value={result.final_url} link={result.final_url} />
                  {result.generated_first_name && (
                    <MetaItem icon={<Zap />} label="Generated Name"
                      value={`${result.generated_first_name} ${result.generated_last_name}`} />
                  )}
                </div>
              </div>

              {/* Steps */}
              {result.steps?.length > 0 && (
                <div className="glass-card" style={{ padding: 22 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: '#334155', margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Zap style={{ width: 14, height: 14, color: '#4f46e5' }} />
                    Automation Steps
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {result.steps.map((step, i) => <StepRow key={i} step={step} />)}
                  </div>
                </div>
              )}

              {/* API Calls */}
              {result.xvpn_api_calls?.length > 0 && (
                <div className="glass-card" style={{ padding: 22 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: '#334155', margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Code style={{ width: 14, height: 14, color: '#7c3aed' }} />
                    Captured API Calls ({result.xvpn_api_calls.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {result.xvpn_api_calls.map((call, i) => <ApiCallRow key={i} call={call} />)}
                  </div>
                </div>
              )}

              {/* Screenshot */}
              {result.screenshot_base64 && result.screenshot_base64.length > 10 && (
                <div className="glass-card" style={{ padding: 22 }}>
                  <button
                    type="button"
                    onClick={() => setShowScreenshot((v) => !v)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
                      cursor: 'pointer', color: '#334155', fontWeight: 700, fontSize: 13, padding: 0,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}
                  >
                    <Image style={{ width: 14, height: 14, color: '#0ea5e9' }} />
                    Checkout Screenshot
                    {showScreenshot ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
                  </button>
                  {showScreenshot && (
                    <img
                      src={`data:image/png;base64,${result.screenshot_base64}`}
                      alt="Checkout screenshot"
                      style={{ marginTop: 14, width: '100%', borderRadius: 10, border: '1px solid #e2e8f0' }}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── tiny helpers ─────────────────────────────────────────────────────────────

function FieldPreview({ label, value }) {
  return (
    <div>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>{label}</p>
      <p style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace', margin: 0 }}>{value}</p>
    </div>
  );
}

function MetaItem({ icon, label, value, link }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        {React.cloneElement(icon, { style: { width: 11, height: 11, color: '#94a3b8' } })}
        <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      </div>
      {link
        ? <a href={link} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#4f46e5', fontWeight: 600, wordBreak: 'break-all' }}>{value}</a>
        : <p style={{ fontSize: 12, color: '#334155', fontWeight: 600, margin: 0, wordBreak: 'break-all' }}>{value}</p>}
    </div>
  );
}
