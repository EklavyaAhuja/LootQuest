export const COLORS = {
  bg: '#0b101e', // Base background (Level 0 canvas)
  text: '#dee2f6', // Light text (on-surface)
  border: '#334155', // Card borders
  white: '#1e293b', // Card/Surface background (Level 1 container)
  shadow: '#000000',

  // Accent colors from Neon Syndicate
  primary: '#39ff14', // Neon Green (Primary branding/success)
  secondary: '#00e3fd', // Cyan Tech (Secondary tags/interactions)
  accent: '#f6d1ff', // Lavender/Purple (Tertiary accent)
  success: '#39ff14', // Neon Green (Success state)
  warning: '#ffd600', // Electric Yellow (Warning state)
  danger: '#ffb4ab', // Error Red
  lightBg: '#161b2a', // Lower surface container

  // Stitch Tonal Layers
  surfaceLowest: '#090e1c',
  surfaceLow: '#161b2a',
  surface: '#0e1321',
  surfaceHigh: '#252a39',
  surfaceHighest: '#303444',

  onSurfaceVariant: '#baccb0',

  // Platform Specific Pastel-Cartoon colors (adapted for dark mode cards)
  platform: {
    steam: '#1b3a57', // Slate Sky Blue
    epic: '#1b4d3e', // Slate Green
    gog: '#4d2a33', // Slate Red/Pink
    itch: '#4d3a2a', // Slate Orange
    playstation: '#2c3a5e', // Slate Royal Blue
    xbox: '#3b4e2a', // Slate Lime Green
    nintendo: '#5e2c2c', // Slate Deep Red
    mobile: '#1c4d4d', // Slate Teal
    web: '#4e4c2a', // Slate Yellow
    other: '#3d2c5e', // Slate Lilac
  }
};

export const PLATFORM_COLORS: Record<string, string> = {
  steam: COLORS.platform.steam,
  epic: COLORS.platform.epic,
  gog: COLORS.platform.gog,
  itch: COLORS.platform.itch,
  playstation: COLORS.platform.playstation,
  xbox: COLORS.platform.xbox,
  nintendo: COLORS.platform.nintendo,
  android: COLORS.platform.mobile,
  ios: COLORS.platform.mobile,
  mobile: COLORS.platform.mobile,
  web: COLORS.platform.web,
};

export function getPlatformColor(platform: string): string {
  const p = platform.toLowerCase();
  if (p.includes('steam')) return PLATFORM_COLORS.steam;
  if (p.includes('epic')) return PLATFORM_COLORS.epic;
  if (p.includes('gog')) return PLATFORM_COLORS.gog;
  if (p.includes('itch')) return PLATFORM_COLORS.itch;
  if (p.includes('playstation') || p.includes('ps4') || p.includes('ps5')) return PLATFORM_COLORS.playstation;
  if (p.includes('xbox')) return PLATFORM_COLORS.xbox;
  if (p.includes('nintendo') || p.includes('switch')) return PLATFORM_COLORS.nintendo;
  if (p.includes('android') || p.includes('ios') || p.includes('mobile')) return PLATFORM_COLORS.mobile;
  if (p.includes('web') || p.includes('browser')) return PLATFORM_COLORS.web;
  return COLORS.platform.other;
}

export const FONTS = {
  // Headlines and badges
  bold: 'Quicksand_700Bold',
  headlineMedium: 'Quicksand_600SemiBold',
  headlineRegular: 'Quicksand_500Medium',

  // Body text
  medium: 'DMSans_500Medium',
  regular: 'DMSans_400Regular',
  bodyBold: 'DMSans_700Bold',

  // HUD and metadata tags
  mono: 'SpaceMono_700Bold',
  monoRegular: 'SpaceMono_400Regular',
};

export const COMMON_STYLES = {
  thickBorder: {
    borderWidth: 3,
    borderColor: COLORS.border,
  },
  thinBorder: {
    borderWidth: 2,
    borderColor: COLORS.border,
  },
};
