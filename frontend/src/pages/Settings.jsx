import React, { useEffect, useState } from 'react';
import { Plus, Trash, Globe, Key, Clock, Shield, Sliders } from 'lucide-react';
import useStore from '../store/useStore';
import toast from 'react-hot-toast';

export default function Settings() {
  const { configs, fetchConfigs, createConfig, deleteConfig } = useStore();

  const [name, setName] = useState('');
  const [forumUrl, setForumUrl] = useState('https://altenens.is');
  const [forumSectionUrl, setForumSectionUrl] = useState('https://altenens.is/forums/accounts-and-database-dumps.45/');
  const [xfUsername, setXfUsername] = useState('');
  const [xfPassword, setXfPassword] = useState('');
  const [maxPages, setMaxPages] = useState(0);
  const [scrapeDelay, setScrapeDelay] = useState(2.0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !forumUrl || !forumSectionUrl || !xfUsername || !xfPassword) {
      toast.error('Please fill out all required fields');
      return;
    }
    setIsSubmitting(true);
    const success = await createConfig({
      name,
      forum_url: forumUrl,
      forum_section_url: forumSectionUrl,
      xf_username: xfUsername,
      xf_password: xfPassword,
      max_pages: Number(maxPages),
      scrape_delay: Number(scrapeDelay),
    });
    setIsSubmitting(false);
    if (success) {
      toast.success('Configuration saved successfully');
      setName('');
      setXfUsername('');
      setXfPassword('');
      fetchConfigs();
    } else {
      toast.error('Failed to save configuration');
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to delete this configuration? All associated thread records will lose references.')) {
      const success = await deleteConfig(id);
      if (success) {
        toast.success('Configuration deleted');
      } else {
        toast.error('Failed to delete configuration');
      }
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Create Settings Form */}
        <div className="glass-card p-8 w-full lg:w-[450px] shrink-0 h-fit">
          <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Sliders className="h-5 w-5 text-indigo-600" />
            <span>New Target Configuration</span>
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Config Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Altenens Dumps Section"
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Base Forum URL</label>
              <input
                type="url"
                value={forumUrl}
                onChange={(e) => setForumUrl(e.target.value)}
                placeholder="https://altenens.is"
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Section Forum URL</label>
              <input
                type="url"
                value={forumSectionUrl}
                onChange={(e) => setForumSectionUrl(e.target.value)}
                placeholder="https://altenens.is/forums/..."
                className="input-field"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Username</label>
                <input
                  type="text"
                  value={xfUsername}
                  onChange={(e) => setXfUsername(e.target.value)}
                  placeholder="XenForo Account"
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Password</label>
                <input
                  type="password"
                  value={xfPassword}
                  onChange={(e) => setXfPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-field"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Max Pages</label>
                <input
                  type="number"
                  value={maxPages}
                  onChange={(e) => setMaxPages(e.target.value)}
                  placeholder="0 (all)"
                  className="input-field"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Delay (Sec)</label>
                <input
                  type="number"
                  value={scrapeDelay}
                  onChange={(e) => setScrapeDelay(e.target.value)}
                  placeholder="2.0"
                  className="input-field"
                  step="0.1"
                  min="0.5"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary w-full py-3.5 mt-4 font-bold flex items-center justify-center gap-2 cursor-pointer transition-all duration-200"
            >
              <span>Save Configuration</span>
            </button>
          </form>
        </div>

        {/* Existing Configs List */}
        <div className="glass-card p-8 flex-1 w-full">
          <h2 className="text-lg font-bold text-slate-800 mb-6">Target Configurations</h2>
          <div className="space-y-4">
            {configs.map((c) => (
              <div key={c.id} className="p-5 bg-slate-50/50 rounded-2xl border border-slate-100 hover:border-slate-200 transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold text-slate-800 text-base">{c.name}</h3>
                    {c.is_active && (
                      <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 rounded-md text-[10px] font-bold uppercase tracking-wider">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-slate-400" />
                      <span className="font-medium text-slate-500">{c.forum_section_url}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Key className="h-3.5 w-3.5 text-slate-400" />
                      <span className="font-medium text-slate-500">Account: <b className="text-slate-700 font-bold">{c.xf_username}</b></span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-medium text-slate-500">Delay: <b className="text-slate-700 font-bold">{c.scrape_delay}s</b></span>
                      </div>
                      <div className="font-medium text-slate-500">
                        <span>Max Pages: <b className="text-slate-700 font-bold">{c.max_pages === 0 ? 'All' : c.max_pages}</b></span>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(c.id)}
                  className="p-3 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 text-red-600 rounded-xl transition-all cursor-pointer self-end md:self-auto"
                >
                  <Trash className="h-4 w-4" />
                </button>
              </div>
            ))}

            {configs.length === 0 && (
              <div className="text-center py-12 text-slate-400 italic">
                No configurations created yet. Define one on the left.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
