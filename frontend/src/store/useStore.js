import { create } from 'zustand';
import authService from '../api/authService';
import apiService from '../api/apiService';

const useStore = create((set, get) => ({
  user: null,
  isAuthenticated: authService.isAuthenticated(),
  loading: false,
  error: null,

  // Auth Actions
  login: async (username, password) => {
    set({ loading: true, error: null });
    try {
      await authService.login(username, password);
      set({ isAuthenticated: true });
      await get().fetchCurrentUser();
      return true;
    } catch (err) {
      set({ error: err.response?.data?.detail || 'Login failed', loading: false });
      return false;
    }
  },

  logout: () => {
    authService.logout();
    set({ user: null, isAuthenticated: false });
  },

  fetchCurrentUser: async () => {
    try {
      const userData = await authService.getCurrentUser();
      set({ user: userData, loading: false });
    } catch (err) {
      get().logout();
    }
  },

  // Forum Configs State
  configs: [],
  fetchConfigs: async () => {
    try {
      const data = await apiService.getConfigs();
      set({ configs: data });
    } catch (err) {
      console.error('Error fetching configs:', err);
    }
  },

  createConfig: async (configData) => {
    try {
      const data = await apiService.createConfig(configData);
      set((state) => ({ configs: [data, ...state.configs] }));
      return true;
    } catch (err) {
      console.error('Error creating config:', err);
      return false;
    }
  },

  deleteConfig: async (id) => {
    try {
      await apiService.deleteConfig(id);
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
      const data = await apiService.getJobs(page, status);
      set({ jobs: data.items, totalJobs: data.total });
    } catch (err) {
      console.error('Error fetching jobs:', err);
    }
  },

  fetchJobDetails: async (id) => {
    try {
      const data = await apiService.getJobDetails(id);
      set({ activeJob: data.job, jobLogs: data.logs });
    } catch (err) {
      console.error('Error fetching job details:', err);
    }
  },

  createJob: async (jobData) => {
    try {
      const data = await apiService.createJob(jobData);
      set((state) => ({ jobs: [data, ...state.jobs] }));
      return true;
    } catch (err) {
      console.error('Error creating job:', err);
      return false;
    }
  },

  cancelJob: async (id) => {
    try {
      await apiService.cancelJob(id);
      get().fetchJobs();
      return true;
    } catch (err) {
      console.error('Error cancelling job:', err);
      return false;
    }
  },

  retryJob: async (id) => {
    try {
      await apiService.retryJob(id);
      get().fetchJobs();
      return true;
    } catch (err) {
      console.error('Error retrying job:', err);
      return false;
    }
  },

  deleteJob: async (id) => {
    try {
      await apiService.deleteJob(id);
      get().fetchJobs();
      return true;
    } catch (err) {
      console.error('Error deleting job:', err);
      return false;
    }
  },

  // Dashboard Stats
  dashboardStats: null,
  dashboardActivity: [],
  recentJobs: [],
  healthCheckData: null,
  healthCheckLoading: false,
  healthCheckError: null,
  screenshotUrl: null,
  screenshotLoading: false,

  fetchDashboardData: async () => {
    try {
      const [stats, activity, recent] = await Promise.all([
        apiService.getDashboardStats(),
        apiService.getDashboardActivity(),
        apiService.getRecentJobs(),
      ]);
      set({
        dashboardStats: stats,
        dashboardActivity: activity,
        recentJobs: recent,
      });
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
    }
  },

  fetchHealthCheck: async () => {
    set({ healthCheckLoading: true, healthCheckError: null });
    try {
      const data = await apiService.getHealthCheck();
      set({ healthCheckData: data, healthCheckLoading: false });
    } catch (err) {
      set({ healthCheckError: err.response?.data?.detail || 'Failed to run health checks', healthCheckLoading: false });
    }
  },

  fetchScreenshot: async () => {
    set({ screenshotLoading: true });
    try {
      const url = await apiService.getScreenshotUrl();
      set({ screenshotUrl: url, screenshotLoading: false });
    } catch (err) {
      console.error('Failed to capture screenshot:', err);
      set({ screenshotLoading: false });
    }
  },

  // Threads State
  threads: [],
  totalThreads: 0,
  totalPages: 0,
  activeThread: null,
  fetchThreads: async (page = 1, search = '', configId = '', sortBy = 'scraped_at', sortDir = 'desc') => {
    try {
      const data = await apiService.getThreads(page, search, configId, sortBy, sortDir);
      set({
        threads: data.items,
        totalThreads: data.total,
        totalPages: data.total_pages,
      });
    } catch (err) {
      console.error('Error fetching threads:', err);
    }
  },

  fetchThreadDetails: async (id) => {
    try {
      const data = await apiService.getThreadDetails(id);
      set({ activeThread: data });
    } catch (err) {
      console.error('Error fetching thread details:', err);
    }
  },

  exportThreads: async (search = '', configId = '', format = 'csv') => {
    try {
      return await apiService.exportThreads(search, configId, format);
    } catch (err) {
      console.error('Error exporting threads:', err);
      return null;
    }
  },
}));

export default useStore;
