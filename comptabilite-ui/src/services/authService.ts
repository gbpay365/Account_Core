import api from '../api';

export const authService = {
  async login(email: string, password: string) {
    const response = await api.post('/auth/login', { email, password });
    localStorage.setItem('access_token', response.data.accessToken);
    return response.data;
  },

  async getCurrentUserPermissions(): Promise<string[]> {
    const response = await api.get('/auth/permissions');
    return response.data;
  },

  logout() {
    localStorage.removeItem('access_token');
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem('access_token');
  },
};
