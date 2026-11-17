/**
 * Semantic design tokens.
 *
 * The interface is ink on white, like a printed box score. Colour is not
 * decoration here: it marks state, and the state that matters most is `live`.
 *
 *   live   (green)  people are playing right now, or the action that puts you
 *                   among them (checking in, going)
 *   soon   (amber)  on the way, starting soon, needs attention
 *   alert  (red)    errors, closures, destructive actions
 *
 * Everything else — text, buttons, icons, map pins — is ink. A screen with no
 * live activity on it has no green on it, which is what makes the green mean
 * something when it appears.
 */

const brand = {
  ink: '#0F1A16',
  courtGreen: '#00865C',
} as const;

export type ThemeName = 'light';

export type Palette = {
  /** The page: a cool light grey, so the white surfaces on it read as objects. */
  background: string;
  backgroundElevated: string;
  /** Cards, groups of rows, inputs, bars, and things that float over the map. */
  surface: string;
  /** A grey leaning slightly green, for quiet fills such as skeletons and avatars. */
  surfaceMuted: string;
  surfaceInverse: string;
  /** Hairline rules between rows. */
  border: string;
  /** Control outlines. */
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
  alert: string;
  alertSoft: string;
  /** Red text on `alertSoft`; `alert` itself is too light to read on its own tint. */
  alertText: string;

  scrim: string;
};

export const palettes: Record<ThemeName, Palette> = {
  light: {
    background: '#F2F4F3',
    backgroundElevated: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceMuted: '#E8ECEA',
    surfaceInverse: brand.ink,
    border: 'rgba(15,26,22,0.09)',
    borderStrong: 'rgba(15,26,22,0.26)',

    text: brand.ink,
    textMuted: '#525D58',
    textFaint: '#5E6964',
    textInverse: '#FFFFFF',

    live: brand.courtGreen,
    liveSoft: '#D9EFE3',
    liveText: '#006B49',
    soon: '#B4610A',
    soonSoft: '#F8E7CC',
    soonText: '#7A4300',
    alert: '#C2302F',
    alertSoft: '#F8E0DD',
    alertText: '#A82726',

    scrim: 'rgba(15,26,22,0.5)',
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

/**
 * Corners are soft. Tags are the squarest thing on screen, inputs and badges
 * are rounded, cards and groups of rows rounder still, and sheets the most.
 * Buttons, chips and icon buttons are full pills, which is what makes a card
 * of straight text and a row of actions read as two different things.
 */
export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
  xxl: 32,
  pill: 999,
} as const;

/**
 * Two voices. Barlow Condensed, an athletic signage face, carries titles,
 * numbers, labels and buttons; the platform's own font carries sentences, so
 * anything read at length stays as legible as the rest of the phone.
 *
 * The condensed faces are loaded by name in the root layout. Their weight is
 * part of the face, so styles that use them never set `fontWeight`.
 */
export const fonts = {
  display: 'BarlowCondensed_700Bold',
  displayMedium: 'BarlowCondensed_600SemiBold',
} as const;

export const typeScale = {
  /** Screen titles. */
  display: { fontFamily: fonts.display, fontSize: 40, lineHeight: 40 },
  /** The subject of a detail screen, and dialog-sized headings. */
  title: { fontFamily: fonts.display, fontSize: 32, lineHeight: 34 },
  /** Row titles and section headings. */
  heading: { fontFamily: fonts.displayMedium, fontSize: 22, lineHeight: 26 },
  /** Small capitals for section labels, stat labels and tags. */
  label: {
    fontFamily: fonts.displayMedium,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 1.1,
    textTransform: 'uppercase' as const,
  },
  button: { fontFamily: fonts.displayMedium, fontSize: 19, lineHeight: 22, letterSpacing: 0.2 },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600' as const },
  caption: { fontSize: 14, lineHeight: 19, fontWeight: '400' as const },
  micro: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
  /** Live counts and times read like a scoreboard, not like body copy. */
  score: { fontFamily: fonts.display, fontSize: 44, lineHeight: 42 },
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

/**
 * Three depths. `card` lifts a white surface off the grey page just enough to
 * read as an object; `raised` sits under solid buttons; `floating` is for
 * things over the page or the map: sheets, dialogs, toasts, map panels.
 */
export const elevation = {
  card: {
    shadowColor: '#0F1A16',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#0F1A16',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  floating: {
    shadowColor: '#0F1A16',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
} as const;
