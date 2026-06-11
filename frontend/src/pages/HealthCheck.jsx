import React, { useEffect, useState } from 'react';
import { 
  Activity, 
  RefreshCw, 
  Wifi, 
  Key, 
  Database, 
  Cpu, 
  Clock, 
  ExternalLink, 
  Eye, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  ShieldCheck,
  Minimize2
} from 'lucide-react';
import useStore from '../store/useStore';

export default function HealthCheck() {
  const {
    healthCheckData,
    healthCheckLoading,
    healthCheckError,
    screenshotUrl,
    screenshotLoading,
    fetchHealthCheck,
    fetchScreenshot
  } = useStore();

  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    fetchHealthCheck();
    fetchScreenshot();
  }, []);

  const handleRunAll = () => {
    fetchHealthCheck();
    fetchScreenshot();
  };

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.25, 2.5));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.25, 0.5));
  const handleZoomReset = () => setZoom(1);

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Scraper Diagnostics & Health Check</h1>
              <p className="text-xs text-slate-400 font-medium">Verify system parameters, forum credentials, database state, and parser integrity</p>
            </div>
          </div>
        </div>
        <button
          onClick={handleRunAll}
          disabled={healthCheckLoading || screenshotLoading}
          className="btn btn-primary flex items-center gap-2 h-10 rounded-xl font-bold cursor-pointer transition-all duration-150 disabled:opacity-50"
          style={{ paddingLeft: '20px', paddingRight: '20px' }}
        >
          <RefreshCw className={`h-4 w-4 ${healthCheckLoading || screenshotLoading ? 'animate-spin' : ''}`} />
          <span>{healthCheckLoading || screenshotLoading ? 'Running...' : 'Run Diagnostics'}</span>
        </button>
      </div>

      {/* ── Error Notification if health checks fails entirely ── */}
      {healthCheckError && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl">
          <AlertTriangle className="h-5 w-5 text-rose-600 flex-shrink-0" />
          <div className="text-xs font-semibold">
            Failed to run diagnostic service: {healthCheckError}
          </div>
        </div>
      )}

      {/* ── Diagnostics Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* 1. Network Connectivity Card */}
        <div className="card p-6 flex flex-col justify-between space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">01. Network Status</span>
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
                <Wifi className="h-4 w-4 text-indigo-500" /> Connection Check
              </h3>
            </div>
            {healthCheckLoading ? (
              <span className="h-2 w-2 rounded-full bg-slate-300 animate-pulse"></span>
            ) : healthCheckData?.connectivity?.status === 'healthy' ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle className="h-3 w-3" /> ONLINE
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                <XCircle className="h-3 w-3" /> OFFLINE
              </span>
            )}
          </div>
          
          <div className="space-y-2.5 pt-2">
            <div className="flex justify-between items-center text-xs border-b border-slate-50 pb-2">
              <span className="text-slate-400 font-medium">Target Forum</span>
              <a 
                href={healthCheckData?.connectivity?.url || 'https://altenens.is'} 
                target="_blank" 
                rel="noreferrer" 
                className="text-indigo-600 hover:underline flex items-center gap-0.5 font-bold"
              >
                {healthCheckData?.connectivity?.url ? new URL(healthCheckData.connectivity.url).hostname : 'altenens.is'}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="flex justify-between items-center text-xs border-b border-slate-50 pb-2">
              <span className="text-slate-400 font-medium">HTTP Status Code</span>
              <span className="font-bold text-slate-700">
                {healthCheckData?.connectivity?.response_code ?? '---'}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400 font-medium">Network Latency</span>
              <span className="font-bold text-slate-700">
                {healthCheckData?.connectivity?.latency_ms ? `${healthCheckData.connectivity.latency_ms} ms` : '---'}
              </span>
            </div>
          </div>
        </div>

        {/* 2. Authentication and Cookies Session Card */}
        <div className="card p-6 flex flex-col justify-between space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">02. Credentials</span>
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
                <Key className="h-4 w-4 text-violet-500" /> Session Cookies
              </h3>
            </div>
            {healthCheckLoading ? (
              <span className="h-2 w-2 rounded-full bg-slate-300 animate-pulse"></span>
            ) : healthCheckData?.session?.status === 'active' ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <ShieldCheck className="h-3 w-3" /> ACTIVE
              </span>
            ) : healthCheckData?.session?.status === 'expired' ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                <AlertTriangle className="h-3 w-3" /> EXPIRED
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                NO COOKIES
              </span>
            )}
          </div>
          
          <div className="space-y-2.5 pt-2">
            <div className="flex justify-between items-center text-xs border-b border-slate-50 pb-2">
              <span className="text-slate-400 font-medium">Logged-in User</span>
              <span className="font-bold text-slate-700">
                {healthCheckData?.session?.username ?? 'Not Logged In'}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs border-b border-slate-50 pb-2">
              <span className="text-slate-400 font-medium">XenForo User ID</span>
              <span className="font-bold text-slate-700">
                {healthCheckData?.session?.user_id ?? '---'}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400 font-medium">Session Source</span>
              <span className="font-bold text-slate-500 truncate max-w-[150px]">
                DB config session_cookies
              </span>
            </div>
          </div>
        </div>

        {/* 3. HTML Parser Health Check Card */}
        <div className="card p-6 flex flex-col justify-between space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">03. Scraper Core</span>
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
                <Cpu className="h-4 w-4 text-cyan-500" /> HTML Parser Check
              </h3>
            </div>
            {healthCheckLoading ? (
              <span className="h-2 w-2 rounded-full bg-slate-300 animate-pulse"></span>
            ) : healthCheckData?.parser?.status === 'healthy' ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                FUNCTIONAL
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                OUTDATED/BROKEN
              </span>
            )}
          </div>
          
          <div className="space-y-2.5 pt-2">
            <div className="flex justify-between items-center text-xs border-b border-slate-50 pb-2">
              <span className="text-slate-400 font-medium">BeautifulSoup Engine</span>
              <span className="font-bold text-slate-700">bs4 + lxml</span>
            </div>
            <div className="flex justify-between items-center text-xs border-b border-slate-50 pb-2">
              <span className="text-slate-400 font-medium">Mock Parse Verification</span>
              <span className="font-bold text-slate-700">
                {healthCheckData?.parser?.status === 'healthy' ? 'Success (ID: 12345)' : 'Failed'}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400 font-medium">Forum Selectors Code</span>
              <span className="font-bold text-emerald-600">Updated</span>
            </div>
          </div>
        </div>

        {/* 4. Database Storage Health Check Card */}
        <div className="card p-6 flex flex-col justify-between space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">04. Local Database</span>
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
                <Database className="h-4 w-4 text-emerald-500" /> Database Health
              </h3>
            </div>
            {healthCheckLoading ? (
              <span className="h-2 w-2 rounded-full bg-slate-300 animate-pulse"></span>
            ) : (healthCheckData?.database?.threads_count ?? 0) > 0 ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                POPULATED
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                EMPTY
              </span>
            )}
          </div>
          
          <div className="space-y-2.5 pt-2">
            <div className="flex justify-between items-center text-xs border-b border-slate-50 pb-2">
              <span className="text-slate-400 font-medium">Scraped Threads Count</span>
              <span className="font-bold text-slate-700">
                {healthCheckData?.database?.threads_count ?? 0}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs border-b border-slate-50 pb-2">
              <span className="text-slate-400 font-medium">Scraped Posts Saved</span>
              <span className="font-bold text-slate-700">
                {healthCheckData?.database?.posts_count ?? 0}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400 font-medium">Database System</span>
              <span className="font-bold text-slate-700">MySQL / SQLite</span>
            </div>
          </div>
        </div>

        {/* 5. Last Job Execution Card */}
        <div className="card p-6 flex flex-col justify-between space-y-4 lg:col-span-2">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">05. Process Scheduling</span>
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-amber-500" /> Last Job Run Status
              </h3>
            </div>
            {healthCheckLoading ? (
              <span className="h-2 w-2 rounded-full bg-slate-300 animate-pulse"></span>
            ) : healthCheckData?.last_job ? (
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                healthCheckData.last_job.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                healthCheckData.last_job.status === 'failed' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                'bg-blue-50 text-blue-700 border-blue-200 animate-pulse'
              }`}>
                {healthCheckData.last_job.status.toUpperCase()}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                NO JOBS RUN
              </span>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="space-y-2.5">
              <div className="flex justify-between items-center text-xs border-b border-slate-50 pb-2">
                <span className="text-slate-400 font-medium">Last Job Type</span>
                <span className="font-bold text-slate-700 capitalize">
                  {healthCheckData?.last_job?.job_type?.replace('_', ' ') ?? 'None'}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-medium">Execution Time</span>
                <span className="font-bold text-slate-700">
                  {healthCheckData?.last_job?.created_at ? new Date(healthCheckData.last_job.created_at).toLocaleString() : '---'}
                </span>
              </div>
            </div>
            
            <div className="space-y-2.5">
              <div className="flex justify-between items-center text-xs border-b border-slate-50 pb-2">
                <span className="text-slate-400 font-medium">Job Reference ID</span>
                <span className="font-bold text-slate-700">
                  {healthCheckData?.last_job?.id ? `#${healthCheckData.last_job.id}` : '---'}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-medium">Errors / Details</span>
                <span className="font-bold text-rose-600 truncate max-w-[180px]" title={healthCheckData?.last_job?.error_message}>
                  {healthCheckData?.last_job?.error_message || 'None'}
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ── Screenshot Live Checker Section ── */}
      <div className="card overflow-hidden">
        
        {/* Card Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-slate-50 border-b border-slate-100">
          <div>
            <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
              <Eye className="h-4.5 w-4.5 text-indigo-500" /> Scraped Forum Page Live View
            </h2>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">
              Current visual layout of <code className="text-[10px] bg-slate-200/50 text-slate-600 px-1.5 py-0.5 rounded">accounts-and-database-dumps.45/</code>
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {screenshotUrl && (
              <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 shadow-sm gap-1">
                <button 
                  onClick={handleZoomOut} 
                  title="Zoom Out"
                  className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded cursor-pointer"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <button 
                  onClick={handleZoomReset} 
                  title="Reset Zoom"
                  className="px-2 text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-slate-50 rounded cursor-pointer"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button 
                  onClick={handleZoomIn} 
                  title="Zoom In"
                  className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded cursor-pointer"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <div className="h-4 w-[1px] bg-slate-200 mx-1"></div>
                <button 
                  onClick={() => setIsFullscreen(true)} 
                  title="Fullscreen Preview"
                  className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded cursor-pointer"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>
            )}
            
            <button
              onClick={fetchScreenshot}
              disabled={screenshotLoading}
              className="btn btn-secondary flex items-center gap-2 h-9 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${screenshotLoading ? 'animate-spin' : ''}`} />
              <span>{screenshotLoading ? 'Capturing...' : 'Capture Screenshot'}</span>
            </button>
          </div>
        </div>

        {/* Screenshot Image Frame */}
        <div className="relative bg-slate-100 flex items-center justify-center p-6 min-h-[450px] overflow-hidden">
          
          {screenshotLoading ? (
            <div className="flex flex-col items-center justify-center space-y-4 text-center z-10">
              <div className="relative flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-100 border-t-indigo-600"></div>
                <Activity className="h-5 w-5 text-indigo-500 absolute animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700">Spinning up Headless Chrome Browser...</p>
                <p className="text-xs text-slate-400 mt-1">Executing rendering engine on the server host to capture Altenen page visual state</p>
              </div>
            </div>
          ) : screenshotUrl ? (
            <div 
              className="w-full flex justify-center transition-transform duration-200 ease-out" 
              style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
            >
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-lg bg-white max-w-5xl w-full">
                <img 
                  src={screenshotUrl} 
                  alt="Altenen Scraped Forum Screenshot"
                  className="w-full h-auto object-top select-none"
                  style={{ maxHeight: '800px', display: 'block' }}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center space-y-3 text-center">
              <Eye className="h-12 w-12 text-slate-300" />
              <div>
                <p className="text-sm font-bold text-slate-600">No Screenshot Captured</p>
                <p className="text-xs text-slate-400 mt-1">Click the button above to run Playwright Chromium and check forum visual display.</p>
              </div>
              <button
                onClick={fetchScreenshot}
                className="btn btn-primary h-9 rounded-lg text-xs font-bold cursor-pointer mt-2"
              >
                Launch Capture
              </button>
            </div>
          )}

          {/* Bottom Alert/Help Banner */}
          {!screenshotLoading && screenshotUrl && (
            <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-md border border-slate-100 p-3 rounded-xl shadow-md flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500 flex-shrink-0" />
              <p className="text-[11px] text-slate-500 font-medium">
                Verify that the screenshot shows the Altenen Thread List container (e.g. indicating cookies are active). If it shows a login page, go to <strong>Settings</strong> to refresh user sessions.
              </p>
            </div>
          )}

        </div>

      </div>

      {/* ── Fullscreen Overlay Modal ── */}
      {isFullscreen && screenshotUrl && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex flex-col justify-between p-6 animate-fade-in">
          
          {/* Header Controls */}
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-white">Fullscreen Visual Inspection</h3>
              <p className="text-[10px] text-slate-400">Reviewing scraped forum elements for layout updates or anti-bot defenses</p>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-1 gap-1">
                <button 
                  onClick={handleZoomOut} 
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded cursor-pointer"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="px-2 text-xs font-extrabold text-white">
                  {Math.round(zoom * 100)}%
                </span>
                <button 
                  onClick={handleZoomIn} 
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded cursor-pointer"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
              </div>

              <button
                onClick={() => setIsFullscreen(false)}
                className="btn btn-secondary flex items-center gap-1.5 h-9 rounded-lg text-xs font-bold cursor-pointer"
                style={{ background: '#334155', color: '#f8fafc', border: '1px solid #475569' }}
              >
                <Minimize2 className="h-4 w-4" />
                <span>Exit Fullscreen</span>
              </button>
            </div>
          </div>

          {/* Fullscreen Scrollable Frame */}
          <div className="flex-1 overflow-auto my-6 flex items-start justify-center p-4">
            <div 
              className="transition-transform duration-100 ease-out" 
              style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
            >
              <img 
                src={screenshotUrl} 
                alt="Altenen Scraped Forum Full Screenshot"
                className="rounded-xl shadow-2xl max-w-5xl w-full border border-slate-700 bg-white"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-[10px] text-slate-500">
            Press ESC or click exit button above to return to dashboard.
          </div>

        </div>
      )}

    </div>
  );
}
