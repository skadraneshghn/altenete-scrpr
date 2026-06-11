import { create } from 'zustand';
import client from '../api/client';

const useStore = create((set, get) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('token'),
  loading: false,
  error: null,

  // Auth Actions
  login: async (username, password) => {
    set({ loading: true, error: null });
    try {
      const res = await client.post('/api/auth/login', { username, password });
      localStorage.setItem('token', res.data.access_token);
      set({ isAuthenticated: true });
      await get().fetchCurrentUser();
      return true;
    } catch (err) {
      set({ error: err.response?.data?.detail || 'Login failed', loading: false });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ user: null, isAuthenticated: false });
  },

  fetchCurrentUser: async () => {
    try {
      const res = await client.get('/api/auth/me');
      set({ user: res.data, loading: false });
    } catch (err) {
      get().logout();
    }
  },

  // Forum Configs State
  configs: [],
  fetchConfigs: async () => {
    try {
      const res = await client.get('/api/forums/configs');
      set({ configs: res.data });
    } catch (err) {
      console.error('Error fetching configs:', err);
    }
  },

  createConfig: async (configData) => {
    try {
      const res = await client.post('/api/forums/configs', configData);
      set((state) => ({ configs: [res.data, ...state.configs] }));
      return true;
    } catch (err) {
      console.error('Error creating config:', err);
      return false;
    }
  },

  deleteConfig: async (id) => {
    try {
      await client.delete(`/api/forums/configs/${id}`);
      set((state) => ({ configs: state.configs.filter((c) => c.id !== id) }));
      return true;
    } catch (err) {
      console.error('Error deleting config:', err);
      return false;
    }
  },

  // Jobs State
  jobs: [],
  totalJobs: 0,
  activeJob: null,
  jobLogs: [],
  fetchJobs: async (page = 1, status = '') => {
    try {
      const params = { page, per_page: 10 };
      if (status) params.status = status;
      const res = await client.get('/api/jobs', { params });
      set({ jobs: res.data.items, totalJobs: res.data.total });
    } catch (err) {
      console.error('Error fetching jobs:', err);
    }
  },

  fetchJobDetails: async (id) => {
    try {
      const res = await client.get(`/api/jobs/${id}`);
      set({ activeJob: res.data.job, jobLogs: res.data.logs });
    } catch (err) {
      console.error('Error fetching job details:', err);
    }
  },

  createJob: async (jobData) => {
    try {
      const res = await client.post('/api/jobs', jobData);
      set((state) => ({ jobs: [res.data, ...state.jobs] }));
      return true;
    } catch (err) {
      console.error('Error creating job:', err);
      return false;
    }
  },

  cancelJob: async (id) => {
    try {
      await client.post(`/api/jobs/${id}/cancel`);
      get().fetchJobs();
      return true;
    } catch (err) {
      console.error('Error cancelling job:', err);
      return false;
    }
  },

  retryJob: async (id) => {
    try {
      await client.post(`/api/jobs/${id}/retry`);
      get().fetchJobs();
      return true;
    } catch (err) {
      console.error('Error retrying job:', err);
      return false;
    }
  },

  // Dashboard Stats
  dashboardStats: null,
  dashboardActivity: [],
  recentJobs: [],
  fetchDashboardData: async () => {
    try {
      const [statsRes, activityRes, recentRes] = await Promise.all([
        client.get('/api/dashboard/stats'),
        client.get('/api/dashboard/activity'),
        client.get('/api/dashboard/recent-jobs'),
      ]);
      set({
        dashboardStats: statsRes.data,
        dashboardActivity: activityRes.data,
        recentJobs: recentRes.data,
      });
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
    }
  },

  // Threads State
  threads: [],
  totalThreads: 0,
  totalPages: 0,
  activeThread: null,
  fetchThreads: async (page = 1, search = '') => {
    try {
      const params = { page, per_page: 15 };
      if (search) params.search = search;
      const res = await client.get('/api/forums/threads', { params });
      set({
        threads: res.data.items,
        totalThreads: res.data.total,
        totalPages: res.data.total_pages,
      });
    } catch (err) {
      console.error('Error fetching threads:', err);
    }
  },

  fetchThreadDetails: async (id) => {
    try {
      const res = await client.get(`/api/forums/threads/${id}`);
      set({ activeThread: res.data });
    } catch (err) {
      console.error('Error fetching thread details:', err);
    }
  },
}));

export default useStore;
