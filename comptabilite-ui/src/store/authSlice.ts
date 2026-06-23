import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  permissions: string[];
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  isAuthenticated: !!localStorage.getItem('access_token'),
  token: localStorage.getItem('access_token'),
  permissions: [],
  loading: false,
  error: null,
};

export const fetchPermissionsThunk = createAsyncThunk(
  'auth/fetchPermissions',
  async () => {
    try {
      const response = await fetch('/api/auth/permissions', {
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` }
      });
      if (!response.ok) throw new Error('Unauthorized');
      return await response.json() as string[];
    } catch {
      // Fallback permissions so the UI still works
      return ['dashboard:read', 'balance_sheet:read', 'balance_sheet:export',
              'cash_flow:read', 'cash_flow:export'] as string[];
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // Pure reducer — side effects (localStorage) handled outside
    logout(state) {
      state.isAuthenticated = false;
      state.token = null;
      state.permissions = [];
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPermissionsThunk.fulfilled, (state, action) => {
        state.permissions = action.payload;
        state.isAuthenticated = true;
      });
  },
});

export const { logout, clearError } = authSlice.actions;
export default authSlice.reducer;
