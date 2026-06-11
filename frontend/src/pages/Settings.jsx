import React, { useEffect, useState } from 'react';
import { Plus, Trash, Globe, Key, Clock, Shield, Sliders, Bot, Send, Info, MessageSquare, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import useStore from '../store/useStore';
import apiService from '../api/apiService';
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

      {/* Telegram Bot Configuration Panel */}
      <TelegramSettingsPanel />
    </div>
  );
}

function TelegramSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [watchEnabled, setWatchEnabled] = useState(true);
  const [botToken, setBotToken] = useState('');
  const [adminChatId, setAdminChatId] = useState('');
  const [template, setTemplate] = useState('');

  const [statusInfo, setStatusInfo] = useState({
    bot_username: '',
    bot_status: 'Stopped',
    last_error: '',
    has_token_in_env: false,
    has_admin_id_in_env: false,
  });

  const loadSettings = async () => {
    try {
      const data = await apiService.getTelegramSettings();
      setEnabled(data.enabled);
      setWatchEnabled(data.watch_enabled);
      setBotToken(data.bot_token_override || '');
      setAdminChatId(data.admin_chat_id_override || '');
      setTemplate(data.message_template);
      setStatusInfo({
        bot_username: data.bot_username || '',
        bot_status: data.bot_status || 'Stopped',
        last_error: data.last_error || '',
        has_token_in_env: data.has_token_in_env,
        has_admin_id_in_env: data.has_admin_id_in_env,
      });
    } catch (err) {
      toast.error('Failed to load Telegram settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await apiService.updateTelegramSettings({
        enabled,
        watch_enabled: watchEnabled,
        bot_token_override: botToken || null,
        admin_chat_id_override: adminChatId || null,
        message_template: template,
      });
      toast.success('Telegram configuration updated successfully');
      loadSettings();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update Telegram settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await apiService.testTelegramBot("⚡ Test message from Altenete Scraper Admin Dashboard!");
      toast.success('Test message sent successfully to Telegram admin!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send test message');
    } finally {
      setTesting(false);
    }
  };

  // Preview renderer helper
  const renderPreview = () => {
    let preview = template;
    const dummy = {
      title: "Sample XenForo Database Dump 2026",
      author: "XenForoAdmin",
      url: "https://altenens.is/threads/sample.12345/",
      content: "This is a sample text preview of the XenForo post contents that will be scraped and automatically sent to your Telegram account.",
      scraped_at: new Date().toLocaleString()
    };
    
    Object.keys(dummy).forEach(key => {
      preview = preview.replaceAll(`{${key}}`, dummy[key]);
    });

    return preview;
  };

  if (loading) {
    return (
      <div className="glass-card p-8 text-center text-slate-400">
        Loading Telegram Configuration...
      </div>
    );
  }

  return (
    <div className="glass-card p-8 w-full mt-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Telegram Bot Engine</h2>
            <p className="text-xs text-slate-400">Receive real-time notifications about newly crawled posts and database leaks</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase">Bot Status:</span>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                statusInfo.bot_status === 'Running' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                statusInfo.bot_status === 'Error' ? 'bg-red-50 text-red-700 border border-red-200' :
                'bg-slate-50 text-slate-600 border border-slate-200'
              }`}>
                {statusInfo.bot_status === 'Running' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                {statusInfo.bot_status}
              </span>
            </div>
            {statusInfo.bot_username && (
              <span className="text-[11px] font-medium text-slate-400 mt-1">Bot Name: <b className="text-slate-600">@{statusInfo.bot_username}</b></span>
            )}
          </div>
        </div>
      </div>

      {statusInfo.last_error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-500 mt-0.5" />
          <div>
            <span className="font-bold block mb-1">Telegram Connection Issue</span>
            <span>{statusInfo.last_error}</span>
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Left Column: settings fields */}
          <div className="space-y-5">
            <div className="flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
              <div>
                <span className="block font-bold text-slate-800 text-sm">Enable Telegram System</span>
                <span className="text-[11px] text-slate-400 block mt-0.5">Activate or deactivate background polling and alerts</span>
              </div>
              <button
                type="button"
                onClick={() => setEnabled(!enabled)}
                className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all border ${
                  enabled 
                    ? 'bg-emerald-500 !text-white border-emerald-600 shadow-md shadow-emerald-500/10' 
                    : 'bg-white !text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
              <div>
                <span className="block font-bold text-slate-800 text-sm">Watch New Posts</span>
                <span className="text-[11px] text-slate-400 block mt-0.5">Pause or resume delivery of alerts to the administrator</span>
              </div>
              <button
                type="button"
                onClick={() => setWatchEnabled(!watchEnabled)}
                className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all border ${
                  watchEnabled 
                    ? 'bg-indigo-600 !text-white border-indigo-700 shadow-md shadow-indigo-600/10' 
                    : 'bg-white !text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {watchEnabled ? 'Watching' : 'Paused'}
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Bot Token (Override)</span>
                {statusInfo.has_token_in_env && (
                  <span className="text-[10px] text-emerald-600 normal-case font-bold bg-emerald-50 border border-emerald-200/50 px-2 py-0.5 rounded-md">Using env token</span>
                )}
              </label>
              <input
                type="password"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder={statusInfo.has_token_in_env ? "•••••••••••• (Set in environment variables)" : "Enter telegram bot token"}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Admin Chat ID (Override)</span>
                {statusInfo.has_admin_id_in_env && (
                  <span className="text-[10px] text-emerald-600 normal-case font-bold bg-emerald-50 border border-emerald-200/50 px-2 py-0.5 rounded-md">Using env chat ID</span>
                )}
              </label>
              <input
                type="text"
                value={adminChatId}
                onChange={(e) => setAdminChatId(e.target.value)}
                placeholder={statusInfo.has_admin_id_in_env ? `${statusInfo.has_admin_id_in_env} (Set in environment variables)` : "Enter admin chat ID"}
                className="input-field"
              />
              <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span>Tip: Link bot by clicking <b>/start</b>. First sender automatically claims admin if left blank.</span>
              </p>
            </div>
          </div>

          {/* Right Column: Custom Message Template & Preview */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Message Template</label>
              <textarea
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                className="input-field h-44 font-mono text-xs p-4 resize-none leading-relaxed"
                placeholder="Enter message template..."
                required
              />
              <p className="text-[10px] text-slate-400 mt-2">
                Placeholders: <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600 font-bold">{'{title}'}</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600 font-bold">{'{author}'}</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600 font-bold">{'{url}'}</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600 font-bold">{'{content}'}</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600 font-bold">{'{scraped_at}'}</code>
              </p>
            </div>

            <div>
              <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Live Notification Preview</span>
              </span>
              <div className="p-4 bg-slate-800 text-slate-100 rounded-2xl text-xs font-sans whitespace-pre-wrap leading-relaxed shadow-inner max-h-56 overflow-y-auto border border-slate-700">
                {renderPreview()}
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap justify-between items-center gap-4 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !enabled}
            className="btn btn-secondary flex items-center gap-2 font-bold py-2.5 px-5 cursor-pointer disabled:opacity-50"
            title={!enabled ? "Please enable bot first to send test messages" : ""}
          >
            {testing ? (
              <span>Sending...</span>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>Test Connection</span>
              </>
            )}
          </button>

          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary flex items-center gap-2 font-bold py-2.5 px-6 cursor-pointer"
          >
            {saving ? (
              <span>Saving Changes...</span>
            ) : (
              <>
                <span>Save Bot Settings</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

