export type ThemeColors = {
  bg:           string;
  surface:      string;
  surface2:     string;
  primary:      string;
  onPrimary:    string;
  text:         string;
  textDim:      string;
  muted:        string;
  border:       string;
  borderStrong: string;
  gold:         string;
  danger:       string;
  // Category badge colors (same in both themes)
  grappling:    string;
  conditioning: string;
  performance:  string;
};

export const darkTheme: ThemeColors = {
  bg:           '#0a0b0d',
  surface:      '#141518',
  surface2:     '#1b1d21',
  primary:      '#C8F031',
  onPrimary:    '#0a0b0d',
  text:         '#f2f3f0',
  textDim:      '#9da29b',
  muted:        '#6e736d',
  border:       'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.14)',
  gold:         '#fbbf24',
  danger:       '#ef4444',
  grappling:    '#a78bfa',
  conditioning: '#14b8a6',
  performance:  '#3b82f6',
};

export const lightTheme: ThemeColors = {
  bg:           '#f6f7f4',
  surface:      '#ffffff',
  surface2:     '#eceee8',
  primary:      '#65A30D',
  onPrimary:    '#ffffff',
  text:         '#191c17',
  textDim:      '#555a4f',
  muted:        '#9ca394',
  border:       'rgba(0,0,0,0.07)',
  borderStrong: 'rgba(0,0,0,0.14)',
  gold:         '#b45309',
  danger:       '#dc2626',
  grappling:    '#7c3aed',
  conditioning: '#0d9488',
  performance:  '#2563eb',
};

// Kept for backward-compat during migration — will be removed once all screens use useTheme()
export const T = darkTheme;

export const R = { card: 12, sm: 8, chip: 999 };

export const D = { rowH: 60, pad: 18, cardPad: 17, gap: 12, stack: 14 };

export const F = {
  ui:        'SpaceGrotesk_400Regular',
  uiMed:     'SpaceGrotesk_500Medium',
  uiSemi:    'SpaceGrotesk_600SemiBold',
  uiBold:    'SpaceGrotesk_700Bold',
  mono:      'JetBrainsMono_500Medium',
  monoBold:  'JetBrainsMono_600SemiBold',
  wordmark:  'BricolageGrotesque_800ExtraBold',
  brand:     'Archivo_800ExtraBold',
} as const;

export const BRAND = {
  ink:      '#0A0B0D', // near-black graphite — icon/splash background, on-light mark
  volt:     '#C8F031', // electric lime accent — on dark surfaces only
  voltDeep: '#65A30D', // accent for light backgrounds (volt is unreadable on white)
  steel:    '#E8EAE3', // cool light neutral (replaces cream)
  bone:     '#F6F7F4', // near-white paper — on-dark mark, light bg
} as const;
