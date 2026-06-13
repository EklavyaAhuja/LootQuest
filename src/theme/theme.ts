export const COLORS = {
  bg: '#131313', // Base background (Level 0 canvas)
  text: '#e5e2e1', // Light text (on-surface)
  border: 'rgba(255, 255, 255, 0.05)', // Card borders
  white: '#222222', // Card/Surface background (Level 1 container)
  shadow: '#000000',

  // Accent colors from Stitch Companion Quest
  primary: '#ddb7ff', // Vibrant Purple (Primary branding)
  secondary: '#5de6ff', // Cyan (Secondary tags/interactions)
  accent: '#ddb7ff', // Purple accent
  success: '#4de082', // Green (Success/Claimed state)
  warning: '#FF2449', // Loot Red (Ending Soon/Alerts)
  danger: '#ffb4ab', // Error Red
  lightBg: '#1c1b1b', // Lower surface container (surface-container-low)

  // Stitch Tonal Layers
  surfaceLowest: '#0e0e0e', // surface-container-lowest
  surfaceLow: '#1c1b1b', // surface-container-low
  surface: '#201f1f', // surface-container
  surfaceHigh: '#2a2a2a', // surface-container-high
  surfaceHighest: '#353534', // surface-container-highest
  surfaceCharcoal: '#222222', // surface-charcoal
  surfaceBright: '#393939', // surface-bright

  onSurfaceVariant: '#cfc2d6',
  textMuted: '#858585',
  lootRed: '#FF2449',

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
  // Headlines and badges matching Stitch Plus Jakarta Sans
  bold: 'PlusJakartaSans_700Bold',
  headlineMedium: 'PlusJakartaSans_600SemiBold',
  headlineRegular: 'PlusJakartaSans_500Medium',
  extraBold: 'PlusJakartaSans_800ExtraBold',

  // Body text
  medium: 'PlusJakartaSans_500Medium',
  regular: 'PlusJakartaSans_400Regular',
  bodyBold: 'PlusJakartaSans_700Bold',

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
