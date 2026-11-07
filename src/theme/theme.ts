// ─── Pure Black Hallmark Design System ───────────────────────────────────────
// Pure black canvas · fine micro-lines · Instrument Serif typography · Electric Lime accent

export const COLORS = {
  // Pure Black Canvas & Fine Hairlines
  bg: '#000000',               // pure pitch black canvas
  bgWarm: '#050506',
  bgCard: '#131315',           // sleek elevated surface
  bgCardHover: '#18181c',
  bgModal: '#000000',          // pure pitch black modal

  // Text hierarchy
  text: '#EDEDEB',             // crisp primary emphasis (--tx: #ededeb)
  textSecondary: '#A1A1A6',    // metadata and subtitles (brightened for outdoor readability)
  textMuted: '#636366',        // dim numbers, timestamps
  muted: '#A1A1A6',
  dim: '#636366',
  hairline: '#1C1C1E',

  // Primary emphasis
  accent: '#EDEDEB',           // primary emphasis
  accentLight: 'rgba(237, 237, 235, 0.10)',
  accentMedium: 'rgba(237, 237, 235, 0.20)',

  // Time urgency (one accent #FF8A5B, used ONLY for time pressure)
  time: '#FF8A5B',
  timeUrgent: '#FF8A5B',
  warning: '#FF8A5B',
  warningLight: 'rgba(255, 138, 91, 0.14)',

  // Primary Actions & Buttons
  primary: '#EDEDEB',          // Claim = filled white with black text
  primaryLight: 'rgba(237, 237, 235, 0.10)',
  primaryMedium: 'rgba(237, 237, 235, 0.20)',
  secondary: '#A1A1A6',
  secondaryLight: 'rgba(161, 161, 166, 0.14)',
  info: '#60A5FA',
  infoLight: 'rgba(96, 165, 250, 0.12)',

  // Buttons
  buttonClaimBg: '#EDEDEB',
  buttonClaimText: '#000000',
  buttonClaimedBorder: '#3A3A3D',
  buttonClaimedText: '#A1A1A6',
  buttonDisabled: '#636366',

  // Legacy compatibility
  auroraIndigo: '#6366F1',
  auroraViolet: '#8B5CF6',
  auroraBlue: '#3B82F6',
  auroraTeal: '#10B981',

  // Surfaces
  surface: '#000000',
  surfaceElevated: '#121214',
  surfaceHighest: '#1C1C1E',
  surfaceCharcoal: '#050506',
  surfaceHigh: '#121214',
  surfaceLow: '#000000',
  surfaceLowest: '#000000',
  surfaceBright: '#1A1A1D',
  onSurfaceVariant: '#86868B',
  white: '#FFFFFF',
  shadow: '#000000',

  // Fine 1px micro-borders
  border: '#1C1C1E',
  borderLight: 'rgba(255, 255, 255, 0.08)',
  borderActive: '#EDEDEB',

  // Status
  success: '#34D399',
  danger: '#FF8A5B',

  // Rich Jewel Pill Badges (Apple iOS App Store & Attendify)
  badgeFreeBg: '#07331F',
  badgeFreeText: '#34D399',
  badgeFreeBorder: 'rgba(52, 211, 153, 0.25)',

  badgeUrgentBg: '#2E2209',
  badgeUrgentText: '#FBBF24',
  badgeUrgentBorder: 'rgba(251, 191, 36, 0.25)',

  badgeClaimedBg: 'transparent',
  badgeClaimedText: '#8E8E93',
  badgeClaimedBorder: 'transparent',

  // Platform badges (Rich jelly capsules with subtle colored glows)
  platform: {
    steam: 'rgba(96, 165, 250, 0.16)',
    epic: 'rgba(52, 211, 153, 0.16)',
    gog: 'rgba(244, 114, 182, 0.16)',
    itch: 'rgba(251, 146, 60, 0.16)',
    playstation: 'rgba(59, 130, 246, 0.16)',
    xbox: 'rgba(74, 222, 128, 0.16)',
    nintendo: 'rgba(248, 113, 113, 0.16)',
    mobile: 'rgba(156, 163, 175, 0.16)',
    web: 'rgba(156, 163, 175, 0.16)',
    other: 'rgba(156, 163, 175, 0.16)',
  },

  platformBorder: {
    steam: 'rgba(96, 165, 250, 0.3)',
    epic: 'rgba(52, 211, 153, 0.3)',
    gog: 'rgba(244, 114, 182, 0.3)',
    itch: 'rgba(251, 146, 60, 0.3)',
    playstation: 'rgba(59, 130, 246, 0.3)',
    xbox: 'rgba(74, 222, 128, 0.3)',
    nintendo: 'rgba(248, 113, 113, 0.3)',
    mobile: 'rgba(156, 163, 175, 0.3)',
    web: 'rgba(156, 163, 175, 0.3)',
    other: 'rgba(156, 163, 175, 0.3)',
  },

  platformText: {
    steam: '#60A5FA',
    epic: '#34D399',
    gog: '#F472B6',
    itch: '#FB923C',
    playstation: '#93C5FD',
    xbox: '#4ADE80',
    nintendo: '#F87171',
    mobile: '#9CA3AF',
    web: '#9CA3AF',
    other: '#9CA3AF',
  },
};

export const FONTS = {
  display: 'PlusJakartaSans_700Bold',
  displayBold: 'PlusJakartaSans_700Bold',
  serif: 'PlusJakartaSans_700Bold',
  bold: 'PlusJakartaSans_700Bold',
  headlineRegular: 'PlusJakartaSans_600SemiBold',
  semiBold: 'PlusJakartaSans_600SemiBold',
  extraBold: 'PlusJakartaSans_700Bold',

  medium: 'PlusJakartaSans_500Medium',
  regular: 'PlusJakartaSans_500Medium',
  bodyBold: 'PlusJakartaSans_700Bold',

  mono: 'JetBrainsMono_700Bold',
  monoRegular: 'JetBrainsMono_400Regular',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 48,
};

export const RADIUS = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  button: 12,
  tag: 6,
  pill: 12, // Refined 12px squircle replaces generic 999 oval pills
  cardTop: 16,
  cardBottom: 16,
  heroTop: 20,
  heroBottom: 20,
};

export const SHADOWS = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 3,
  },
  elevated: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 6,
  },
  floating: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
  },
};

export function getPlatformColor(platform: string): string {
  const p = platform.toLowerCase();
  if (p.includes('steam')) return COLORS.platform.steam;
  if (p.includes('epic')) return COLORS.platform.epic;
  if (p.includes('gog')) return COLORS.platform.gog;
  if (/\bitch(?:\.io)?\b/i.test(p)) return COLORS.platform.itch;
  if (p.includes('playstation') || p.includes('ps4') || p.includes('ps5')) return COLORS.platform.playstation;
  if (p.includes('xbox')) return COLORS.platform.xbox;
  if (p.includes('nintendo') || p.includes('switch')) return COLORS.platform.nintendo;
  if (p.includes('android') || p.includes('ios') || p.includes('mobile')) return COLORS.platform.mobile;
  if (p.includes('web') || p.includes('browser')) return COLORS.platform.web;
  return COLORS.platform.other;
}

export function getPlatformTextColor(platform: string): string {
  const p = platform.toLowerCase();
  if (p.includes('steam')) return COLORS.platformText.steam;
  if (p.includes('epic')) return COLORS.platformText.epic;
  if (p.includes('gog')) return COLORS.platformText.gog;
  if (/\bitch(?:\.io)?\b/i.test(p)) return COLORS.platformText.itch;
  if (p.includes('playstation') || p.includes('ps4') || p.includes('ps5')) return COLORS.platformText.playstation;
  if (p.includes('xbox')) return COLORS.platformText.xbox;
  if (p.includes('nintendo') || p.includes('switch')) return COLORS.platformText.nintendo;
  if (p.includes('android') || p.includes('ios') || p.includes('mobile')) return COLORS.platformText.mobile;
  if (p.includes('web') || p.includes('browser')) return COLORS.platformText.web;
  return COLORS.platformText.other;
}
