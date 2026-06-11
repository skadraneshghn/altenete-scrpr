import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  Search, Eye, X, Globe, User, MessageSquare, 
  BarChart2, Calendar, FileText, Download, 
  RefreshCw, Copy, Check, Filter, ArrowUpDown 
} from 'lucide-react';
import useStore from '../store/useStore';
import toast from 'react-hot-toast';

export default function Threads() {
  const { 
    threads, 
    totalThreads, 
    totalPages, 
    activeThread, 
    configs,
    fetchThreads, 
    fetchThreadDetails,
    fetchConfigs,
    exportThreads
  } = useStore();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedConfig, setSelectedConfig] = useState('');
  const [sortBy, setSortBy] = useState('scraped_at');
  const [sortDir, setSortDir] = useState('desc');
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewMode, setViewMode] = useState('html'); // 'html' or 'text'
  const [isCopied, setIsCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const loadThreads = async () => {
    setIsLoading(true);
    await fetchThreads(page, search, selectedConfig, sortBy, sortDir);
    setIsLoading(false);
  };

  useEffect(() => {
    loadThreads();
  }, [page, search, selectedConfig, sortBy, sortDir]);

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleConfigChange = (e) => {
    setSelectedConfig(e.target.value);
    setPage(1);
  };

  const handleSortChange = (e) => {
    setSortBy(e.target.value);
    setPage(1);
  };

  const toggleSortDir = () => {
    setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    setPage(1);
  };

  const handleViewDetails = async (id) => {
    toast.loading('Loading content details...', { id: 'details' });
    await fetchThreadDetails(id);
    toast.dismiss('details');
    setIsViewerOpen(true);
    setViewMode('html');
  };

  const handleCopy = () => {
    if (!activeThread?.post) return;
    const textToCopy = viewMode === 'html' ? activeThread.post.content_html : activeThread.post.content_text;
    navigator.clipboard.writeText(textToCopy);
    setIsCopied(true);
    toast.success('Copied to clipboard!');
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleExport = async (format) => {
    setIsExporting(true);
    const blob = await exportThreads(search, selectedConfig, format);
    setIsExporting(false);
    if (!blob) {
      toast.error('Failed to export data');
      return;
    }

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scraped_data_${new Date().toISOString().slice(0,10)}.${format}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast.success(`Exported scraped threads to ${format.toUpperCase()} successfully!`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Title & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Scraped Content Explorer</h1>
          <p className="text-slate-500 text-sm">Analyze, filter, and export forum content collected by the scraper.</p>
        </div>
        <div className="flex items-center gap-3 bg-white border border-slate-200/80 px-4 py-2.5 rounded-xl shadow-xs">
          <FileText className="h-5 w-5 text-indigo-500" />
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400 leading-tight">Total Discovered</p>
            <p className="text-base font-extrabold text-slate-800 leading-tight">{totalThreads} Threads</p>
          </div>
        </div>
      </div>

      {/* Filter / Action Toolbar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Search Box */}
          <div className="md:col-span-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={handleSearchChange}
              placeholder="Search title or author..."
              className="input-field pl-10"
            />
          </div>

          {/* Config Filter */}
          <div className="md:col-span-3 relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <select
              value={selectedConfig}
              onChange={handleConfigChange}
              className="input-field pl-9 appearance-none cursor-pointer"
            >
              <option value="">All Forum Sources</option>
              {configs.map((config) => (
                <option key={config.id} value={config.id}>{config.name}</option>
              ))}
            </select>
          </div>

          {/* Sort By */}
          <div className="md:col-span-3 relative">
            <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <select
              value={sortBy}
              onChange={handleSortChange}
              className="input-field pl-9 appearance-none cursor-pointer"
            >
              <option value="scraped_at">Scraped Date</option>
              <option value="thread_date">Original Post Date</option>
              <option value="replies">Replies Count</option>
              <option value="views">Views Count</option>
              <option value="title">Title Alphabetical</option>
            </select>
          </div>

          {/* Sort Direction & Refresh */}
          <div className="md:col-span-2 flex gap-2">
            <button
              onClick={toggleSortDir}
              className="flex-1 btn btn-secondary flex items-center justify-center font-bold"
              title="Toggle Ascending/Descending"
            >
              {sortDir.toUpperCase()}
            </button>
            <button
              onClick={loadThreads}
              disabled={isLoading}
              className="p-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-center text-slate-600 disabled:opacity-50 cursor-pointer"
              title="Refresh threads list"
            >
              <RefreshCw className={`h-4.5 w-4.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Data Export Options */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-3 border-t border-slate-100">
          <div className="text-xs text-slate-400 font-medium">
            Active filters yield <span className="font-extrabold text-slate-700">{totalThreads}</span> downloadable results.
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => handleExport('csv')}
              disabled={isExporting || totalThreads === 0}
              className="btn btn-secondary py-2 px-3.5 flex items-center gap-2 cursor-pointer disabled:opacity-50 text-xs font-bold"
            >
              <Download className="h-4 w-4" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={() => handleExport('json')}
              disabled={isExporting || totalThreads === 0}
              className="btn btn-secondary py-2 px-3.5 flex items-center gap-2 cursor-pointer disabled:opacity-50 text-xs font-bold"
            >
              <Download className="h-4 w-4" />
              <span>Export JSON</span>
            </button>
          </div>
        </div>
      </div>

      {/* Threads Table / content list */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-400 text-xs font-bold uppercase tracking-wider">
                <th className="px-6 py-4">Source</th>
                <th className="px-6 py-4">XenForo ID</th>
                <th className="px-6 py-4">Thread Title</th>
                <th className="px-6 py-4">Author</th>
                <th className="px-6 py-4 text-center">Replies</th>
                <th className="px-6 py-4 text-center">Views</th>
                <th className="px-6 py-4">Scraped Date</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-600">
              {threads.map((thread) => {
                const configName = configs.find(c => c.id === thread.config_id)?.name || 'Unknown';
                return (
                  <tr key={thread.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100/50">
                        {configName}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-400">#{thread.thread_xf_id}</td>
                    <td className="px-6 py-4 font-bold text-slate-800 max-w-sm truncate" title={thread.title}>
                      {thread.title}
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-600">{thread.author || 'Anonymous'}</td>
                    <td className="px-6 py-4 text-center font-bold text-slate-700">{thread.replies}</td>
                    <td className="px-6 py-4 text-center font-bold text-slate-700">{thread.views}</td>
                    <td className="px-6 py-4 text-slate-400">
                      {new Date(thread.scraped_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => handleViewDetails(thread.id)}
                          className="p-2 hover:bg-indigo-50 text-indigo-600 hover:text-indigo-800 rounded-xl transition-colors cursor-pointer"
                          title="Open Post Details"
                        >
                          <Eye className="h-4.5 w-4.5" />
                        </button>
                        <a 
                          href={thread.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 hover:bg-slate-50 text-slate-400 hover:text-slate-600 rounded-xl transition-colors"
                          title="Open Original Link"
                        >
                          <Globe className="h-4.5 w-4.5" />
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {threads.length === 0 && (
                <tr>
                  <td colSpan="8" className="text-center py-16 text-slate-400 italic">
                    <FileText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                    <p className="font-bold text-slate-600">No scraped content matches your filter</p>
                    <p className="text-xs text-slate-400 mt-1">Try resetting search or filters.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 pb-6 pt-4 border-t border-slate-100 bg-slate-50/50">
            <span className="text-xs text-slate-400">Showing page {page} of {totalPages}</span>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="btn btn-secondary py-1.5 px-3.5 text-xs font-bold disabled:opacity-40"
              >
                Previous
              </button>
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white font-extrabold text-sm shadow-xs">
                {page}
              </div>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
                className="btn btn-secondary py-1.5 px-3.5 text-xs font-bold disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Slide-out/Modal Detail Viewer — Portal to avoid grid clipping */}
      {isViewerOpen && activeThread && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
            display: 'flex',
            justifyContent: 'flex-end',
            zIndex: 9999,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setIsViewerOpen(false); }}
        >
          <div className="w-full max-w-3xl bg-white h-full flex flex-col p-6 md:p-8 shadow-2xl overflow-y-auto animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100/50">
                {configs.find(c => c.id === activeThread.thread.config_id)?.name || 'Scraped Thread'}
              </span>
              <button
                onClick={() => setIsViewerOpen(false)}
                className="p-2 hover:bg-slate-50 text-slate-400 hover:text-slate-700 rounded-xl cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Core Info */}
            <div className="space-y-4 mb-6">
              <h1 className="text-xl md:text-2xl font-black text-slate-900 leading-snug">{activeThread.thread.title}</h1>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                <div className="flex items-center gap-2 text-xs text-slate-500 font-bold bg-slate-50 border border-slate-100 p-2 rounded-xl">
                  <User className="h-4 w-4 text-indigo-500" />
                  <span className="truncate">{activeThread.thread.author || 'Anonymous'}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 font-bold bg-slate-50 border border-slate-100 p-2 rounded-xl">
                  <MessageSquare className="h-4 w-4 text-indigo-500" />
                  <span>{activeThread.thread.replies} Replies</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 font-bold bg-slate-50 border border-slate-100 p-2 rounded-xl">
                  <BarChart2 className="h-4 w-4 text-indigo-500" />
                  <span>{activeThread.thread.views} Views</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 font-bold bg-slate-50 border border-slate-100 p-2 rounded-xl">
                  <Calendar className="h-4 w-4 text-indigo-500" />
                  <span>{activeThread.thread.thread_date ? new Date(activeThread.thread.thread_date).toLocaleDateString() : 'Unknown'}</span>
                </div>
              </div>
            </div>

            {/* Options bar */}
            <div className="flex items-center justify-between mb-4 bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode('html')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${viewMode === 'html' ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  HTML Preview
                </button>
                <button
                  onClick={() => setViewMode('text')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${viewMode === 'text' ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Clean Text
                </button>
              </div>
              <div className="flex items-center gap-3">
                {activeThread.post && (
                  <button
                    onClick={handleCopy}
                    className="p-1.5 hover:bg-slate-200/50 rounded-lg text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1 cursor-pointer text-xs font-bold"
                    title="Copy content"
                  >
                    {isCopied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                    <span className="hidden sm:inline">Copy</span>
                  </button>
                )}
                <a 
                  href={activeThread.thread.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-bold"
                >
                  <Globe className="h-3.5 w-3.5" />
                  <span>Visit Forum Thread</span>
                </a>
              </div>
            </div>

            {/* Post Content */}
            <div className="flex-1 bg-slate-50/50 border border-slate-100 rounded-2xl p-5 md:p-6 overflow-y-auto min-h-[400px]">
              {activeThread.post ? (
                viewMode === 'html' ? (
                  <div 
                    className="prose prose-slate max-w-none text-slate-700 text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: activeThread.post.content_html }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap text-slate-700 text-sm font-sans leading-relaxed">
                    {activeThread.post.content_text}
                  </pre>
                )
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 py-16">
                  <FileText className="h-12 w-12 text-slate-300 mb-3 animate-pulse" />
                  <p className="font-bold text-slate-600">First Post Content Unavailable</p>
                  <p className="text-xs text-slate-400 mt-1">Wait for Phase 2 of the scraper job to finish extracting the body content.</p>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
