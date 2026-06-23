import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface UIState {
  sidebarOpen: boolean;
  language: 'fr' | 'en';
  activeCompanyId: string;
  activeFiscalYear: number;
}

const initialState: UIState = {
  sidebarOpen: true,
  language: (localStorage.getItem('lang') as 'fr' | 'en') || 'fr',
  activeCompanyId: '00000000-0000-0000-0000-000000000000',
  activeFiscalYear: new Date().getFullYear(),
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar(state) {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setLanguage(state, action: PayloadAction<'fr' | 'en'>) {
      state.language = action.payload;
      localStorage.setItem('lang', action.payload);
    },
    setActiveCompany(state, action: PayloadAction<string>) {
      state.activeCompanyId = action.payload;
    },
    setActiveFiscalYear(state, action: PayloadAction<number>) {
      state.activeFiscalYear = action.payload;
    },
  },
});

export const { toggleSidebar, setLanguage, setActiveCompany, setActiveFiscalYear } = uiSlice.actions;
export default uiSlice.reducer;
