import React, { useEffect, useState, useRef } from 'react';
import { Search, RefreshCw, AlertTriangle, Info, AlertOctagon, Terminal, Play, Pause, ChevronDown, ChevronRight } from 'lucide-react';
import useStore from '../store/useStore';

export default function AdminLogs() {
  const { logs, fetchLogs } = useStore();
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [limit, setLimit] = useState(300);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expandedIndex, setExpandedIndex] = useState(null);

  const logsEndRef = useRef(null);

  const loadLogs = () => {
    fetchLogs(limit, search, level);
  };

  useEffect(() => {
    loadLogs();
  }, [search, level, limit]);

  useEffect(() => {
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        loadLogs();
      }, 4000);
    }
    return () => clearInterval(interval);
  }, [autoRefresh, search, level, limit]);

  const toggleExpand = (index) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const getLevelStyle = (lvl) => {
    const l = lvl.toUpperCase();
    if (l === 'ERROR' || l === 'CRITICAL') {
      return {
        badge: 'bg-red-500/10 text-red-400 border border-red-500/20',
        text: 'text-red-400',
        bg: 'hover:bg-red-950/10 border-red-500/10',
        icon: <AlertOctagon className="h-4 w-4 text-red-400" />
      };
    }
    if (l === 'WARNING' || l === 'WARN') {
      return {
        badge: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
        text: 'text-amber-400',
        bg: 'hover:bg-amber-950/5 border-amber-500/10',
        icon: <AlertTriangle className="h-4 w-4 text-amber-400" />
      };
    }
    return {
      badge: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
      text: 'text-blue-300',
      bg: 'hover:bg-slate-900/40 border-slate-800/40',
      icon: <Info className="h-4 w-4 text-blue-400" />
    };
  };

  return (
    <div className="space-y-6 animate-fade-in text-slate-800">
      {/* Header & Controls Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 glass-card p-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 text-indigo-600 rounded-xl">
            <Terminal className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">System Logs</h1>
            <p className="text-xs text-slate-400">Monitor scraper execution, server requests, and errors in real-time.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search logs (e.g. crawler, error)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-10"
            />
          </div>

          {/* Level Filter */}
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="input-field w-36"
          >
            <option value="">All Levels</option>
            <option value="INFO">INFO</option>
            <option value="WARNING">WARNING</option>
            <option value="ERROR">ERROR</option>
          </select>

          {/* Limit Filter */}
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="input-field w-28"
          >
            <option value="100">100 lines</option>
            <option value="300">300 lines</option>
            <option value="500">500 lines</option>
            <option value="1000">1000 lines</option>
          </select>

          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`btn ${autoRefresh ? 'btn-primary' : 'btn-secondary'} py-2.5 px-4 flex items-center gap-2`}
            title={autoRefresh ? 'Pause Auto-Refresh' : 'Resume Auto-Refresh'}
          >
            {autoRefresh ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            <span className="text-xs font-semibold">{autoRefresh ? 'Live Feed' : 'Paused'}</span>
          </button>

          {/* Refresh Button */}
          <button
            onClick={loadLogs}
            className="btn btn-secondary p-2.5 hover:bg-slate-100 rounded-xl transition-all"
            title="Refresh logs manually"
          >
            <RefreshCw className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>

      {/* Terminal Board */}
      <div className="bg-slate-950 border border-slate-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col font-mono text-sm leading-relaxed text-slate-200">
        {/* Terminal Header */}
        <div className="bg-slate-900 px-5 py-3 border-b border-slate-950 flex items-center justify-between text-slate-400 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500/80"></span>
            <span className="w-3 h-3 rounded-full bg-yellow-500/80"></span>
            <span className="w-3 h-3 rounded-full bg-green-500/80"></span>
            <span className="ml-2 font-semibold text-slate-500">altenens-scraper-console</span>
          </div>
          <span className="text-indigo-400/80 font-semibold uppercase tracking-wider">{logs.length} events loaded</span>
        </div>

        {/* Terminal Console View */}
        <div className="p-4 overflow-y-auto max-h-[70vh] min-h-[400px] divide-y divide-slate-900/50">
          {logs.map((entry, idx) => {
            const style = getLevelStyle(entry.level);
            const isExpanded = expandedIndex === idx;
            const hasMultipleLines = entry.message.includes('\n');

            return (
              <div 
                key={idx} 
                className={`py-3.5 px-4 transition-all duration-150 border-l-2 border-transparent flex flex-col gap-1.5 ${style.bg}`}
              >
                <div className="flex items-start gap-4 justify-between">
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Timestamp */}
                    <span className="text-slate-500 text-xs select-none">
                      {entry.timestamp ? entry.timestamp.split(',')[0] : '-'}
                    </span>

                    {/* Level Badge */}
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${style.badge}`}>
                      {entry.level}
                    </span>

                    {/* Logger Name */}
                    <span className="text-slate-400 text-xs font-semibold">
                      [{entry.logger}]
                    </span>

                    {/* First line message */}
                    <span className={`font-mono ${style.text} whitespace-pre-wrap break-all`}>
                      {hasMultipleLines ? entry.message.split('\n')[0] : entry.message}
                    </span>
                  </div>

                  {/* Expand button for multi-line tracebacks */}
                  {hasMultipleLines && (
                    <button
                      onClick={() => toggleExpand(idx)}
                      className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all cursor-pointer"
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  )}
                </div>

                {/* Expanded Multi-line / Traceback area */}
                {hasMultipleLines && isExpanded && (
                  <div className="mt-2.5 p-4 bg-slate-900/60 border border-slate-900 rounded-xl text-slate-300 overflow-x-auto text-xs whitespace-pre select-all leading-normal">
                    {entry.message}
                  </div>
                )}
              </div>
            );
          })}

          {logs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
              <Terminal className="h-10 w-10 text-slate-600" />
              <span>No logs found matching filter criteria.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
