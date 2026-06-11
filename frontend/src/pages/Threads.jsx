import React, { useEffect, useState } from 'react';
import { Search, Eye, X, Globe, User, MessageSquare, BarChart2, Calendar, FileText } from 'lucide-react';
import useStore from '../store/useStore';

export default function Threads() {
  const { 
    threads, 
    totalThreads, 
    totalPages, 
    activeThread, 
    fetchThreads, 
    fetchThreadDetails 
  } = useStore();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewMode, setViewMode] = useState('html'); // 'html' or 'text'

  useEffect(() => {
    fetchThreads(page, search);
  }, [page, search]);

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleViewDetails = async (id) => {
    await fetchThreadDetails(id);
    setIsViewerOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Action Toolbar */}
      <div className="flex bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={handleSearchChange}
            placeholder="Search by title or author..."
            className="input-field pl-10"
          />
        </div>
      </div>

      {/* Threads Table */}
      <div className="glass-card p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 text-xs font-bold uppercase tracking-wider">
                <th className="pb-4">XenForo ID</th>
                <th className="pb-4">Thread Title</th>
                <th className="pb-4">Author</th>
                <th className="pb-4 text-center">Replies</th>
                <th className="pb-4 text-center">Views</th>
                <th className="pb-4">Scraped Date</th>
                <th className="pb-4 text-right">View</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-600">
              {threads.map((thread) => (
                <tr key={thread.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-4 font-mono text-slate-400">#{thread.thread_xf_id}</td>
                  <td className="py-4 font-bold text-slate-800 max-w-sm truncate" title={thread.title}>
                    {thread.title}
                  </td>
                  <td className="py-4 font-medium">{thread.author || 'Anonymous'}</td>
                  <td className="py-4 text-center font-bold text-slate-700">{thread.replies}</td>
                  <td className="py-4 text-center font-bold text-slate-700">{thread.views}</td>
                  <td className="py-4 text-slate-400">
                    {new Date(thread.scraped_at).toLocaleDateString()}
                  </td>
                  <td className="py-4 text-right">
                    <button
                      onClick={() => handleViewDetails(thread.id)}
                      className="p-2 hover:bg-slate-50 text-indigo-600 hover:text-indigo-800 rounded-xl transition-colors cursor-pointer"
                    >
                      <Eye className="h-4.5 w-4.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {threads.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center py-12 text-slate-400">
                    No scraped forum content found matching criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
            <span className="text-xs text-slate-400">Showing page {page} of {totalPages}</span>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="btn btn-secondary py-1.5 px-3"
              >
                Previous
              </button>
              <span className="text-sm text-slate-600 font-bold">{page}</span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
                className="btn btn-secondary py-1.5 px-3"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Slide-out/Modal Detail Viewer */}
      {isViewerOpen && activeThread && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex justify-end z-50 animate-fade-in">
          <div className="w-full max-w-3xl bg-white border-l border-slate-100 h-full flex flex-col p-6 shadow-2xl overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">Thread Content Details</h2>
              <button
                onClick={() => setIsViewerOpen(false)}
                className="p-2 hover:bg-slate-50 text-slate-400 hover:text-slate-700 rounded-xl cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Core Info */}
            <div className="space-y-4 mb-6">
              <h1 className="text-xl font-extrabold text-slate-800 leading-snug">{activeThread.thread.title}</h1>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
                  <User className="h-4 w-4 text-indigo-600" />
                  <span>{activeThread.thread.author || 'Anonymous'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
                  <MessageSquare className="h-4 w-4 text-indigo-600" />
                  <span>{activeThread.thread.replies} Replies</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
                  <BarChart2 className="h-4 w-4 text-indigo-600" />
                  <span>{activeThread.thread.views} Views</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
                  <Calendar className="h-4 w-4 text-indigo-600" />
                  <span>{activeThread.thread.thread_date ? new Date(activeThread.thread.thread_date).toLocaleDateString() : 'Unknown'}</span>
                </div>
              </div>
            </div>

            {/* Options bar */}
            <div className="flex items-center justify-between mb-4 bg-slate-50 p-2 rounded-xl border border-slate-100">
              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode('html')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${viewMode === 'html' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  HTML Preview
                </button>
                <button
                  onClick={() => setViewMode('text')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${viewMode === 'text' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Clean Text
                </button>
              </div>
              <a 
                href={activeThread.thread.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-bold"
              >
                <Globe className="h-3.5 w-3.5" />
                <span>Visit Forum Thread</span>
              </a>
            </div>

            {/* Post Content */}
            <div className="flex-1 bg-slate-50/50 border border-slate-100 rounded-2xl p-6 overflow-y-auto min-h-[400px]">
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
                <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                  <FileText className="h-12 w-12 text-slate-300 mb-3" />
                  <p className="font-bold text-slate-600">First Post Content Unavailable</p>
                  <p className="text-xs text-slate-400 mt-1">Wait for scraper job phase 2 to extract details</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
