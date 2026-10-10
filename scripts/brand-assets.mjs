// Draws the app icon, the splash image and both favicons from the wordmark: the
// name in Barlow Condensed Bold with a green full stop (docs/design-system.md).
// Run it after changing the brand colours or the typeface, then review the
// images it rewrites:
//   node scripts/brand-assets.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const require = createRequire(import.meta.url);

/** A colour from the token file, so the images follow the palette the app uses. */
function token(name) {
  const tokens = readFileSync(root('apps/mobile/src/theme/tokens.ts'), 'utf8');
  const match = tokens.match(new RegExp(`\\b${name}: '(#[0-9A-Fa-f]{6})'`));
  if (!match) throw new Error(`apps/mobile/src/theme/tokens.ts no longer declares ${name}.`);
  return match[1];
}

const INK = token('ink');
const GREEN = token('courtGreen');
const WHITE = token('textInverse');

const typeface = readFileSync(
  require.resolve('@expo-google-fonts/barlow-condensed/700Bold/BarlowCondensed_700Bold.ttf'),
).toString('base64');

/**
 * `ground` fills the square (`corner` rounds it, as a share of its width);
 * leaving it out keeps the image transparent. `letters` and `stop` colour the
 * name and its full stop.
 */
const ASSETS = [
  {
    // iOS and the stores mask the corners themselves, and reject transparency.
    file: 'apps/mobile/assets/images/icon.png',
    size: 1024,
    mark: 'stacked',
    scale: 1,
    ground: INK,
    letters: WHITE,
    stop: GREEN,
  },
  {
    // Android crops this layer to a circle or a squircle and promises only the
    // middle 61% of it, so the name is drawn inside that. The ink behind it is
    // set in app.config.ts.
    file: 'apps/mobile/assets/images/android-icon-foreground.png',
    size: 1024,
    mark: 'stacked',
    scale: 0.64,
    letters: WHITE,
    stop: GREEN,
  },
  {
    // Android tints this one itself for themed icons; only its shape is used.
    file: 'apps/mobile/assets/images/android-icon-monochrome.png',
    size: 1024,
    mark: 'stacked',
    scale: 0.64,
    letters: WHITE,
    stop: WHITE,
  },
  {
    // Android 12 shows the splash image through a circle two thirds as wide,
    // so the line is kept well inside that.
    file: 'apps/mobile/assets/images/splash-icon.png',
    size: 1024,
    mark: 'line',
    scale: 0.56,
    letters: INK,
    stop: GREEN,
  },
  {
    file: 'apps/mobile/assets/images/favicon.png',
    size: 512,
    mark: 'initial',
    scale: 0.74,
    ground: INK,
    corner: 0.22,
    letters: WHITE,
    stop: GREEN,
  },
  {
    file: 'apps/admin/public/favicon.png',
    size: 192,
    mark: 'initial',
    scale: 0.74,
    ground: INK,
    corner: 0.22,
    letters: WHITE,
    stop: GREEN,
  },
];

/** Runs in the page: draws one asset on a canvas that fills the viewport. */
function draw(asset) {
  const { size, mark, scale, ground, corner = 0, letters, stop } = asset;
  const canvas = document.querySelector('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, size, size);
  if (ground) {
    context.fillStyle = ground;
    context.beginPath();
    context.roundRect(0, 0, size, size, size * corner);
    context.fill();
  }

  const setSize = (fontSize) => {
    context.font = `700 ${fontSize}px Brand`;
  };
  const width = (text) => context.measureText(text).width;
  /** The inked extent of a string, which is what the eye centres, not its advance. */
  const inked = (text) => {
    const box = context.measureText(text);
    return {
      left: box.actualBoundingBoxLeft,
      width: box.actualBoundingBoxLeft + box.actualBoundingBoxRight,
    };
  };
  const capHeight = () => context.measureText('D').actualBoundingBoxAscent;
  /** Draws `text` and then a full stop, kerned as the typeface sets them together. */
  const write = (text, x, baseline) => {
    context.fillStyle = letters;
    context.fillText(text, x, baseline);
    context.fillStyle = stop;
    context.fillText('.', x + width(`${text}.`) - width('.'), baseline);
  };

  if (mark === 'stacked') {
    // "Drop" over "In.", set flush left: the wider line is centred and the
    // shorter one hangs from its left edge.
    const fontSize = size * 0.4 * scale;
    setSize(fontSize);
    const cap = capHeight();
    const gap = fontSize * 0.2;
    const top = (size - (cap * 2 + gap)) / 2;
    const wide = inked('Drop');
    const x = (size - wide.width) / 2 + wide.left;
    context.fillStyle = letters;
    context.fillText('Drop', x, top + cap);
    write('In', x, top + cap * 2 + gap);
    return;
  }

  const text = mark === 'line' ? 'Drop In' : 'D';
  // `scale` is the share of the square the inked line spans (a line) or the
  // letter's size against the square (an initial).
  setSize(100);
  const fontSize = mark === 'line' ? (size * scale * 100) / inked(`${text}.`).width : size * scale;
  setSize(fontSize);
  const whole = inked(`${text}.`);
  write(text, (size - whole.width) / 2 + whole.left, (size + capHeight()) / 2);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.setContent(`<style>
    @font-face { font-family: Brand; font-weight: 700; src: url(data:font/ttf;base64,${typeface}); }
    html, body { margin: 0; background: transparent; }
    canvas { display: block; }
  </style><canvas></canvas>`);
  await page.evaluate(() => document.fonts.load('700 100px Brand'));

  for (const asset of ASSETS) {
    await page.setViewportSize({ width: asset.size, height: asset.size });
    await page.evaluate(draw, asset);
    // A screenshot of an opaque page has no alpha channel, which is the form
    // the app icon must take; the others keep their transparency.
    const transparent = !asset.ground || Boolean(asset.corner);
    writeFileSync(root(asset.file), await page.screenshot({ omitBackground: transparent }));
    console.log(`Drew ${asset.file} (${asset.size}px)`);
  }
} finally {
  await browser.close();
}
