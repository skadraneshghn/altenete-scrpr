import client from './client';

const apiService = {
  // Configurations
  async getConfigs() {
    const res = await client.get('/api/forums/configs');
    return res.data;
  },

  async createConfig(configData) {
    const res = await client.post('/api/forums/configs', configData);
    return res.data;
  },

  async deleteConfig(id) {
    const res = await client.delete(`/api/forums/configs/${id}`);
    return res.data;
  },

  // Jobs
  async getJobs(page = 1, status = '') {
    const params = { page, per_page: 10 };
    if (status) params.status = status;
    const res = await client.get('/api/jobs', { params });
    return res.data;
  },

  async getJobDetails(id) {
    const res = await client.get(`/api/jobs/${id}`);
    return res.data;
  },

  async createJob(jobData) {
    const res = await client.post('/api/jobs', jobData);
    return res.data;
  },

  async cancelJob(id) {
    const res = await client.post(`/api/jobs/${id}/cancel`);
    return res.data;
  },

  async retryJob(id) {
    const res = await client.post(`/api/jobs/${id}/retry`);
    return res.data;
  },

  // Dashboard Metrics
  async getDashboardStats() {
    const res = await client.get('/api/dashboard/stats');
    return res.data;
  },

  async getDashboardActivity() {
    const res = await client.get('/api/dashboard/activity');
    return res.data;
  },

  async getRecentJobs() {
    const res = await client.get('/api/dashboard/recent-jobs');
    return res.data;
  },

  // Scraped Content & Threads
  async getThreads(page = 1, search = '') {
    const params = { page, per_page: 15 };
    if (search) params.search = search;
    const res = await client.get('/api/forums/threads', { params });
    return res.data;
  },

  async getThreadDetails(id) {
    const res = await client.get(`/api/forums/threads/${id}`);
    return res.data;
  }
};

export default apiService;
