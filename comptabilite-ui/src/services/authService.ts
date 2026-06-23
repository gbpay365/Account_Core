import api from '../api';

export const authService = {
  async login(loginName: string, password: string) {
    const response = await api.post('/auth/login', { loginName, password });
    localStorage.setItem('access_token', response.data.accessToken);
    return response.data;
  },

  async getMe() {
    const response = await api.get('/auth/me');
    return response.data as {
      id: string;
      username: string;
      email: string;
      fullName: string;
      roleId?: string;
      roleName?: string;
    };
  },

  async changePassword(currentPassword: string, newPassword: string) {
    const response = await api.post('/auth/change-password', { currentPassword, newPassword });
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
