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

  async deleteJob(id) {
    const res = await client.delete(`/api/jobs/${id}`);
    return res.data;
  },

  async getSubJobs(parentId) {
    const res = await client.get(`/api/jobs/${parentId}/sub-jobs`);
    return res.data;
  },

  async getJobQueue() {
    const res = await client.get('/api/jobs/queue/status');
    return res.data;
  },

  async pauseScheduler() {
    const res = await client.post('/api/jobs/scheduler/pause');
    return res.data;
  },

  async resumeScheduler() {
    const res = await client.post('/api/jobs/scheduler/resume');
    return res.data;
  },

  async pauseSchedulerJob(jobId) {
    const res = await client.post(`/api/jobs/scheduler/jobs/${jobId}/pause`);
    return res.data;
  },

  async resumeSchedulerJob(jobId) {
    const res = await client.post(`/api/jobs/scheduler/jobs/${jobId}/resume`);
    return res.data;
  },

  async runSchedulerJobNow(jobId) {
    const res = await client.post(`/api/jobs/scheduler/jobs/${jobId}/run`);
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

  async getHealthCheck() {
    const res = await client.get('/api/dashboard/health-check');
    return res.data;
  },

  async getScreenshotUrl() {
    const res = await client.get('/api/dashboard/screenshot', { responseType: 'blob' });
    return URL.createObjectURL(res.data);
  },

  // Admin Logs
  async getLogs(limit = 300, search = '', level = '') {
    const params = { limit };
    if (search) params.search = search;
    if (level) params.level = level;
    const res = await client.get('/api/admin/logs', { params });
    return res.data;
  },

  // Scraped Content & Threads
  async getThreads(page = 1, search = '', configId = '', sortBy = 'scraped_at', sortDir = 'desc') {
    const params = { page, per_page: 15, sort_by: sortBy, sort_dir: sortDir };
    if (search) params.search = search;
    if (configId) params.config_id = configId;
    const res = await client.get('/api/forums/threads', { params });
    return res.data;
  },

  async getThreadDetails(id) {
    const res = await client.get(`/api/forums/threads/${id}`);
    return res.data;
  },

  async exportThreads(search = '', configId = '', format = 'csv') {
    const params = { format };
    if (search) params.search = search;
    if (configId) params.config_id = configId;
    const res = await client.get('/api/forums/threads/export', { 
      params,
      responseType: 'blob'
    });
    return res.data;
  },

  // Scraped Posts (First Post Content)
  async getPosts(page = 1, search = '', configId = '', hasContent = null) {
    const params = { page, per_page: 20 };
    if (search) params.search = search;
    if (configId) params.config_id = configId;
    if (hasContent !== null) params.has_content = hasContent;
    const res = await client.get('/api/posts', { params });
    return res.data;
  },

  async exportPosts(search = '', configId = '', format = 'txt') {
    const params = { format };
    if (search) params.search = search;
    if (configId) params.config_id = configId;
    const res = await client.get('/api/posts/export', {
      params,
      responseType: 'blob'
    });
    return res.data;
  },
};

export default apiService;
