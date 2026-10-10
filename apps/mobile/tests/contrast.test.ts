import { describe, expect, it } from 'vitest';

import { palettes } from '../src/theme/tokens';

/**
 * Text has to be readable on the fill a component draws it on. Tags and soft
 * buttons set their text small, so every pairing here must reach the WCAG AA
 * ratio for body-size text rather than the looser one for large type.
 */
const AA_BODY_TEXT = 4.5;

function channel(value: number) {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  const [red, green, blue] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrast(foreground: string, background: string) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

const colors = palettes.light;

describe('light palette', () => {
  it.each([
    ['body text on the page', colors.text, colors.background],
    ['muted text on the page', colors.textMuted, colors.background],
    ['faint text on the page', colors.textFaint, colors.background],
    ['error text on the page', colors.alert, colors.background],
    ['an outlined live button on the page', colors.liveText, colors.background],
    ['a neutral tag', colors.text, colors.surfaceMuted],
    ['muted text in a notice', colors.textMuted, colors.surfaceMuted],
    ['a live tag', colors.liveText, colors.liveSoft],
    ['a soon tag', colors.soonText, colors.soonSoft],
    ['an alert tag', colors.alertText, colors.alertSoft],
    ['an outlined alert button on the page', colors.alertText, colors.background],
    ['a solid neutral button', colors.textInverse, colors.surfaceInverse],
    ['a solid live button', colors.textInverse, colors.live],
    ['a solid alert button', colors.textInverse, colors.alert],
  ])('%s is readable', (_use, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(AA_BODY_TEXT);
  });
});
