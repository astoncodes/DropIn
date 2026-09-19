/**
 * Semantic design tokens.
 *
 * Colours are named for meaning, not appearance, so a screen never says
 * "green" — it says `live`. Swapping the palette then cannot silently change
 * what a colour communicates.
 *
 * The colour language, applied consistently:
 *   live   (green)  playable, happening now, verified
 *   soon   (amber)  heading there, upcoming, needs attention
 *   info   (blue)   navigation, neutral information
 *   alert  (coral)  errors, closures, destructive actions
 *   accent (lime)   sparing highlight on live surfaces only
 *
 * Not every surface is coloured. Colour marks state; the rest is ink on paper.
 */

const brand = {
  fieldInk: '#102B26',
  fieldGreen: '#21BC89',
  electricLime: '#C8F56A',
  electricBlue: '#3B82F6',
  gameAmber: '#FFB547',
  liveCoral: '#FF5D5D',
  offWhite: '#F7F7F2',
} as const;

export type ThemeName = 'light';

export type Palette = {
  background: string;
  backgroundElevated: string;
  surface: string;
  surfaceMuted: string;
  surfaceInverse: string;
  border: string;
  borderStrong: string;

  text: string;
  textMuted: string;
  textFaint: string;
  textInverse: string;

  live: string;
  liveSoft: string;
  liveText: string;
  soon: string;
  soonSoft: string;
  soonText: string;
  info: string;
  infoSoft: string;
  alert: string;
  alertSoft: string;
  accent: string;

  /** Translucent fill for glass surfaces before blur is applied. */
  glassFill: string;
  glassBorder: string;
  /** Opaque stand-in when blur is unavailable or Reduce Transparency is on. */
  glassOpaque: string;

  scrim: string;
  mapOverlayInk: string;
};

export const palettes: Record<ThemeName, Palette> = {
  light: {
    background: brand.offWhite,
    backgroundElevated: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceMuted: '#EEF0EA',
    surfaceInverse: brand.fieldInk,
    border: '#E3E7DF',
    borderStrong: '#C3CBBB',

    text: brand.fieldInk,
    textMuted: '#5E706A',
    textFaint: '#6D7D76',
    textInverse: brand.offWhite,

    live: '#00865C',
    liveSoft: '#E4F3EB',
    liveText: '#006B49',
    soon: '#B9720A',
    soonSoft: '#FFF0D6',
    soonText: '#7A4A00',
    info: '#2563EB',
    infoSoft: '#DEE9FF',
    alert: '#C2302F',
    alertSoft: '#FFE2E2',
    accent: '#7FB625',

    glassFill: 'rgba(255,255,255,0.72)',
    glassBorder: 'rgba(8,19,15,0.08)',
    glassOpaque: '#FFFFFF',

    scrim: 'rgba(8,19,15,0.45)',
    mapOverlayInk: brand.fieldInk,
  },
};

/** 8-point spacing. Touch targets never go below 44. */
export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const typeScale = {
  display: { fontSize: 36, lineHeight: 41, fontWeight: '800' as const, letterSpacing: -1.3 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.8 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' as const },
  caption: { fontSize: 13, lineHeight: 17, fontWeight: '500' as const },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '700' as const, letterSpacing: 0.4 },
  /** Live counts should read like a scoreboard, not body copy. */
  score: { fontSize: 28, lineHeight: 30, fontWeight: '800' as const, letterSpacing: -1 },
} as const;

/**
 * Motion. Entering elements use ease-out so movement starts immediately —
 * ease-in delays the exact moment the eye is watching and reads as sluggish.
 * Everything here stays under 300ms; this is UI, not marketing.
 */
export const motion = {
  instant: 120,
  fast: 160,
  base: 200,
  slow: 260,
  easeOut: [0.23, 1, 0.32, 1] as const,
  easeInOut: [0.77, 0, 0.175, 1] as const,
  /** Press feedback. Subtle enough to feel, not enough to notice. */
  pressScale: 0.97,
} as const;

export const elevation = {
  card: {
    shadowColor: '#08130F',
    shadowOpacity: 0.035,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  floating: {
    shadowColor: '#08130F',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;

/** The same sport identity is used on filters, cards and both map renderers. */
export const sportColors: Record<string, string> = {
  basketball: '#F26A21',
  soccer: '#00865C',
  volleyball: '#7951D4',
  pickleball: '#D69A00',
  tennis: '#2378DD',
  badminton: '#B3327A',
  'ice-hockey': '#397EA0',
};

export function sportColor(slug: string | null | undefined): string {
  return (slug && sportColors[slug]) || '#226B56';
}
