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
  bg:           '#0d0f14',
  surface:      '#1a1d26',
  surface2:     '#22262f',
  primary:      '#d97706',
  onPrimary:    '#0d0f14',
  text:         '#fef3c7',
  textDim:      '#a8a29e',
  muted:        '#78716c',
  border:       'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.14)',
  gold:         '#fbbf24',
  danger:       '#ef4444',
  grappling:    '#a78bfa',
  conditioning: '#10b981',
  performance:  '#3b82f6',
};

export const lightTheme: ThemeColors = {
  bg:           '#f8f4ec',
  surface:      '#ffffff',
  surface2:     '#f0ece3',
  primary:      '#b45309',
  onPrimary:    '#ffffff',
  text:         '#1c1917',
  textDim:      '#57534e',
  muted:        '#a8a29e',
  border:       'rgba(0,0,0,0.07)',
  borderStrong: 'rgba(0,0,0,0.14)',
  gold:         '#d97706',
  danger:       '#dc2626',
  grappling:    '#7c3aed',
  conditioning: '#059669',
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
  ink:       '#17140F',
  vermilion: '#D8432A',
  cream:     '#EBE0CC',
  bone:      '#F4F0E7',
} as const;
