import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, Eye, X, Globe, User, MessageSquare,
  BarChart2, Calendar, FileText, Download,
  RefreshCw, Copy, Check, Filter, Zap,
  Database, Hash,
} from 'lucide-react';
import apiService from '../api/apiService';
import useStore from '../store/useStore';
import toast from 'react-hot-toast';

export default function Posts() {
  const { configs, fetchConfigs } = useStore();

  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedConfig, setSelectedConfig] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Detail viewer
  const [activePost, setActivePost] = useState(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewMode, setViewMode] = useState('text'); // 'text' | 'html'
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const loadPosts = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiService.getPosts(page, search, selectedConfig);
      setPosts(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 1);
    } catch (e) {
      toast.error('Failed to load posts');
    } finally {
      setIsLoading(false);
    }
  }, [page, search, selectedConfig]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleConfigChange = (e) => {
    setSelectedConfig(e.target.value);
    setPage(1);
  };

  const handleView = (post) => {
    setActivePost(post);
    setIsViewerOpen(true);
    setViewMode('text');
    setIsCopied(false);
  };

  const handleCopy = () => {
    if (!activePost) return;
    const text = viewMode === 'text' ? activePost.content_text : activePost.content_html;
    navigator.clipboard.writeText(text || '');
    setIsCopied(true);
    toast.success('Copied to clipboard!');
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleExport = async (format) => {
    setIsExporting(true);
    try {
      const blob = await apiService.exportPosts(search, selectedConfig, format);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `first_posts_${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(`Exported ${total} posts as ${format.toUpperCase()}`);
    } catch {
      toast.error('Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const configName = (id) => configs.find((c) => c.id === id)?.name || 'Unknown';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Zap className="h-6 w-6 text-indigo-500" />
            First Post Content Browser
          </h1>
          <p className="text-slate-500 text-sm">
            Browse, search, and export the first post text extracted from every indexed thread.
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white border border-slate-200/80 px-4 py-2.5 rounded-xl shadow-xs">
          <Database className="h-5 w-5 text-indigo-500" />
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400 leading-tight">Total Posts</p>
            <p className="text-base font-extrabold text-slate-800 leading-tight">{total.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Search */}
          <div className="md:col-span-5 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={handleSearchChange}
              placeholder="Search post content, thread title, or author..."
              className="input-field pl-10"
            />
          </div>

          {/* Config filter */}
          <div className="md:col-span-4 relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <select
              value={selectedConfig}
              onChange={handleConfigChange}
              className="input-field pl-9 appearance-none cursor-pointer"
            >
              <option value="">All Forum Sources</option>
              {configs.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Refresh */}
          <div className="md:col-span-3 flex gap-2 items-start">
            <button
              onClick={loadPosts}
              disabled={isLoading}
              className="flex-1 btn btn-secondary flex items-center justify-center gap-2 font-bold disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Export toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-3 border-t border-slate-100">
          <div className="text-xs text-slate-400 font-medium">
            <span className="font-extrabold text-slate-700">{total.toLocaleString()}</span> posts match current filter.
          </div>
          <div className="flex items-center gap-2.5">
            {['txt', 'csv', 'json'].map((fmt) => (
              <button
                key={fmt}
                onClick={() => handleExport(fmt)}
                disabled={isExporting || total === 0}
                className="btn btn-secondary py-2 px-3.5 flex items-center gap-2 cursor-pointer disabled:opacity-50 text-xs font-bold"
              >
                <Download className="h-4 w-4" />
                {fmt.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Posts table */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-400 text-xs font-bold uppercase tracking-wider">
                <th className="px-5 py-4">Source</th>
                <th className="px-5 py-4">
                  <Hash className="h-3.5 w-3.5 inline mr-1" />ID
                </th>
                <th className="px-5 py-4">Thread</th>
                <th className="px-5 py-4">Author</th>
                <th className="px-5 py-4">Post Preview</th>
                <th className="px-5 py-4">Scraped</th>
                <th className="px-5 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-600">
              {posts.map((p) => (
                <tr key={p.post_id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100/50">
                      {configName(p.config_id)}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-mono text-slate-400 text-xs">#{p.thread_xf_id}</td>
                  <td className="px-5 py-4 max-w-[220px]">
                    <p className="font-bold text-slate-800 truncate" title={p.thread_title}>
                      {p.thread_title}
                    </p>
                  </td>
                  <td className="px-5 py-4 font-semibold text-slate-600 whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      {p.post_author || p.thread_author || '—'}
                    </span>
                  </td>
                  <td className="px-5 py-4 max-w-[300px]">
                    <p className="text-slate-500 text-xs truncate italic" title={p.content_text}>
                      {p.content_text
                        ? p.content_text.slice(0, 120) + (p.content_text.length > 120 ? '…' : '')
                        : <span className="text-slate-300">No content</span>}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-slate-400 text-xs whitespace-nowrap">
                    {new Date(p.scraped_at).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => handleView(p)}
                        className="p-2 hover:bg-indigo-50 text-indigo-600 hover:text-indigo-800 rounded-xl transition-colors cursor-pointer"
                        title="View full post content"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <a
                        href={p.thread_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 hover:bg-slate-50 text-slate-400 hover:text-slate-600 rounded-xl transition-colors"
                        title="Open original thread"
                      >
                        <Globe className="h-4 w-4" />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {posts.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center py-16 text-slate-400 italic">
                    <FileText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                    <p className="font-bold text-slate-600">No scraped posts found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Run a <strong>Scrape Posts</strong> job from the Jobs page to populate this view.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 pb-6 pt-4 border-t border-slate-100 bg-slate-50/50">
            <span className="text-xs text-slate-400">Page {page} of {totalPages} · {total.toLocaleString()} total</span>
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

      {/* Slide-out content viewer — Portal */}
      {isViewerOpen && activePost && createPortal(
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
          <div className="w-full max-w-2xl bg-white h-full flex flex-col p-6 md:p-8 shadow-2xl overflow-y-auto animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100/50">
                <Zap className="h-3.5 w-3.5" />
                First Post Content
              </span>
              <button
                onClick={() => setIsViewerOpen(false)}
                className="p-2 hover:bg-slate-50 text-slate-400 hover:text-slate-700 rounded-xl cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Thread meta */}
            <div className="space-y-4 mb-6">
              <h1 className="text-xl font-black text-slate-900 leading-snug">
                {activePost.thread_title}
              </h1>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
                <div className="flex items-center gap-2 text-xs text-slate-500 font-bold bg-slate-50 border border-slate-100 p-2 rounded-xl">
                  <User className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                  <span className="truncate">{activePost.post_author || activePost.thread_author || '—'}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 font-bold bg-slate-50 border border-slate-100 p-2 rounded-xl">
                  <MessageSquare className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                  <span>{activePost.thread_replies} Replies</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 font-bold bg-slate-50 border border-slate-100 p-2 rounded-xl">
                  <BarChart2 className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                  <span>{activePost.thread_views} Views</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 font-bold bg-slate-50 border border-slate-100 p-2 rounded-xl">
                  <Calendar className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                  <span>
                    {activePost.post_date
                      ? new Date(activePost.post_date).toLocaleDateString()
                      : activePost.thread_date
                        ? new Date(activePost.thread_date).toLocaleDateString()
                        : 'Unknown'}
                  </span>
                </div>
              </div>
            </div>

            {/* Toggle + actions */}
            <div className="flex items-center justify-between mb-4 bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
              <div className="flex gap-2">
                {['text', 'html'].map((m) => (
                  <button
                    key={m}
                    onClick={() => setViewMode(m)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      viewMode === m
                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {m === 'text' ? 'Clean Text' : 'HTML Preview'}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleCopy}
                  className="p-1.5 hover:bg-slate-200/50 rounded-lg text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1 cursor-pointer text-xs font-bold"
                >
                  {isCopied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  <span className="hidden sm:inline">Copy</span>
                </button>
                <a
                  href={activePost.thread_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-bold"
                >
                  <Globe className="h-3.5 w-3.5" />
                  <span>View Thread</span>
                </a>
              </div>
            </div>

            {/* Content display */}
            <div className="flex-1 bg-slate-50/50 border border-slate-100 rounded-2xl p-5 overflow-y-auto min-h-[300px]">
              {activePost.content_text || activePost.content_html ? (
                viewMode === 'text' ? (
                  <pre className="whitespace-pre-wrap text-slate-700 text-sm font-sans leading-relaxed">
                    {activePost.content_text || '(No plain text content)'}
                  </pre>
                ) : (
                  <div
                    className="prose prose-slate max-w-none text-slate-700 text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: activePost.content_html }}
                  />
                )
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 py-16">
                  <FileText className="h-12 w-12 text-slate-300 mb-3 animate-pulse" />
                  <p className="font-bold text-slate-600">No content scraped yet</p>
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
