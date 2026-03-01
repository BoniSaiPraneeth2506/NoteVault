// Color palette for NoteVault — Light & Dark themes

export const LightTheme = {
  primary: '#4F46E5',
  primaryLight: '#EEF2FF',
  primaryDark: '#3730A3',
  secondary: '#22C55E',
  secondaryLight: '#DCFCE7',
  background: '#F1F5F9',
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFC',
  card: '#FFFFFF',
  noteYellow: '#FCD34D',
  noteRed: '#EF4444',
  noteGreen: '#10B981',
  noteBlue: '#3B82F6',
  notePurple: '#8B5CF6',
  notePink: '#EC4899',
  noteOrange: '#F97316',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textInverse: '#FFFFFF',
  danger: '#EF4444',
  dangerLight: '#FEE2E2',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  info: '#3B82F6',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  tabBar: '#FFFFFF',
  tabBarBorder: '#E2E8F0',
  overlay: 'rgba(0,0,0,0.5)',
};

export const DarkTheme = {
  primary: '#818CF8',
  primaryLight: '#1E1B4B',
  primaryDark: '#6366F1',
  secondary: '#4ADE80',
  secondaryLight: '#052E16',
  background: '#0F172A',
  surface: '#1E293B',
  surfaceAlt: '#1E293B',
  card: '#1E293B',
  noteYellow: '#FCD34D',
  noteRed: '#EF4444',
  noteGreen: '#10B981',
  noteBlue: '#3B82F6',
  notePurple: '#8B5CF6',
  notePink: '#EC4899',
  noteOrange: '#F97316',
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  textInverse: '#0F172A',
  danger: '#EF4444',
  dangerLight: '#2D1515',
  warning: '#FBBF24',
  warningLight: '#451A03',
  info: '#60A5FA',
  border: '#334155',
  borderLight: '#1E293B',
  tabBar: '#1E293B',
  tabBarBorder: '#334155',
  overlay: 'rgba(0,0,0,0.7)',
};

export const shadows = {
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 4 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 8 },
};

export const layout = {
  padding: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 6, md: 12, lg: 16, xl: 20, round: 9999 },
};

export const noteColors = [
  { name: 'Default', value: null },
  { name: 'Yellow', value: '#FCD34D' },
  { name: 'Red', value: '#EF4444' },
  { name: 'Green', value: '#10B981' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Orange', value: '#F97316' },
];

// Backward compat
export const colors = LightTheme;
