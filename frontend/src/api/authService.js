import client from './client';

const TOKEN_KEY = 'token';

const authService = {
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  },

  removeToken() {
    localStorage.removeItem(TOKEN_KEY);
  },

  isAuthenticated() {
    return !!this.getToken();
  },

  async login(username, password) {
    const res = await client.post('/api/auth/login', { username, password });
    if (res.data && res.data.access_token) {
      this.setToken(res.data.access_token);
    }
    return res.data;
  },

  logout() {
    this.removeToken();
  },

  async getCurrentUser() {
    const res = await client.get('/api/auth/me');
    return res.data;
  }
};

export default authService;
