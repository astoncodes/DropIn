import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

// Requires the mobile web app on port 8081. Every request to the Supabase API is
// refused inside the browser, so this check never reaches a backend and behaves
// the same whether or not one is running. It covers what a player sees when the
// server cannot be reached: an explanation and a way to retry, promptly, that
// stays on screen while background polling keeps failing.

if (existsSync('.env')) process.loadEnvFile('.env');
assert.ok(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  'Set EXPO_PUBLIC_SUPABASE_URL in .env. The signed-in checks derive the session storage key from it.',
);
const projectRef = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL).hostname.split('.')[0];

const APP = 'http://localhost:8081';
const API = /\/(rest|auth|storage|functions)\/v1\//;
const RECORD_ID = '20000000-0000-4000-8000-000000000001';
const PLAYER = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'unreachable-check@example.test',
  aud: 'authenticated',
  role: 'authenticated',
};
const VENUE = {
  venue_id: RECORD_ID,
  canonical_id: RECORD_ID,
  name: 'Recovered Test Court',
  address_text: '1 Test Street',
  aliases: [],
  latitude: 46.2382,
  longitude: -63.1311,
  indoor_state: 'outdoor',
  verification_state: 'unverified',
  sport_ids: [1],
  sport_names: ['Basketball'],
  sport_slugs: ['basketball'],
  here_now: 0,
  heading_there: 0,
  party_count: 0,
  pulse: null,
  last_activity_at: null,
  region_slug: 'charlottetown',
  was_merged: false,
};

/** How long a failure state must hold. Longer than the slowest poll it must survive (15 s). */
const HOLD_MS = 20_000;
/** How soon a failure must be explained. Two attempts a second apart, with margin. */
const PROMPT_MS = 6_000;

const failures = [];
async function check(name, run) {
  try {
    await run();
    console.log(`ok      ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`not ok  ${name}\n        ${String(error.message).split('\n')[0]}`);
  }
}

/** A context whose API requests fail unless `served` holds a response for the path. */
async function unreachableContext(browser, { signedIn }) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 46.2382, longitude: -63.1311 },
    permissions: ['geolocation'],
  });
  const served = new Map();
  await context.route(API, async (route) => {
    const { pathname } = new URL(route.request().url());
    const body = served.get(pathname);
    if (body === undefined) return route.abort('internetdisconnected');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  if (signedIn) {
    await context.addInitScript(
      ([key, user]) => {
        localStorage.setItem(
          key,
          JSON.stringify({
            access_token: 'unreachable-check-token',
            refresh_token: 'unreachable-check-refresh',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expires_in: 3600,
            token_type: 'bearer',
            user,
          }),
        );
      },
      [`sb-${projectRef}-auth-token`, PLAYER],
    );
  }
  return { context, served };
}

const button = (page, name) => page.getByRole('button', { name, exact: true });

/** Starts counting every DOM state in which the named button is absent, however brief. */
async function countAbsences(page, name) {
  await page.evaluate((label) => {
    const present = () => document.querySelector(`[role="button"][aria-label="${label}"]`) !== null;
    window.absences = 0;
    new MutationObserver(() => {
      if (!present()) window.absences += 1;
    }).observe(document.body, { childList: true, subtree: true });
  }, name);
  return () => page.evaluate(() => window.absences);
}

mkdirSync('test-results/ui', { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  // --- Detail screens, which need an account, and the live map, which does not
  const visitor = await unreachableContext(browser, { signedIn: false });
  const player = await unreachableContext(browser, { signedIn: true });
  const [sessionPage, venuePage, livePage] = await Promise.all([
    player.context.newPage(),
    player.context.newPage(),
    visitor.context.newPage(),
  ]);
  await Promise.all([
    sessionPage.goto(`${APP}/session/${RECORD_ID}`),
    venuePage.goto(`${APP}/venue/${RECORD_ID}`),
    livePage.goto(`${APP}/`),
  ]);

  const held = [];
  await check('session: explains the failure promptly, with retry and a way back', async () => {
    await sessionPage
      .getByText('Could not load this session', { exact: true })
      .waitFor({ timeout: PROMPT_MS });
    await button(sessionPage, 'Try again').waitFor({ timeout: 1000 });
    await button(sessionPage, 'Go back').waitFor({ timeout: 1000 });
    held.push(['session', await countAbsences(sessionPage, 'Try again')]);
  });
  await check('venue: an unreachable server is not reported as a missing venue', async () => {
    await venuePage
      .getByText('Could not load this venue', { exact: true })
      .waitFor({ timeout: PROMPT_MS });
    await button(venuePage, 'Try again').waitFor({ timeout: 1000 });
    assert.equal(await venuePage.getByText('Venue not found', { exact: true }).count(), 0);
    held.push(['venue', await countAbsences(venuePage, 'Try again')]);
  });
  await check('live map: explains the failure promptly, with retry', async () => {
    await livePage
      .getByText("Can't reach Drop In", { exact: true })
      .waitFor({ timeout: PROMPT_MS });
    await button(livePage, 'Try again').waitFor({ timeout: 1000 });
    held.push(['live map', await countAbsences(livePage, 'Try again')]);
  });

  await sessionPage.waitForTimeout(HOLD_MS);
  for (const [screen, absences] of held) {
    await check(`${screen}: the retry stays on screen while polling keeps failing`, async () => {
      assert.equal(await absences(), 0, 'the retry button was removed and redrawn');
    });
  }
  await sessionPage.screenshot({ path: 'test-results/ui/unreachable-session.png' });
  await venuePage.screenshot({ path: 'test-results/ui/unreachable-venue.png' });

  await check('venue: Try again loads the venue once the server answers', async () => {
    player.served.set('/rest/v1/rpc/venue_details', [VENUE]);
    await button(venuePage, 'Try again').click();
    await venuePage.getByText(VENUE.name, { exact: true }).first().waitFor({ timeout: PROMPT_MS });
  });
  await check('venue: a loaded venue survives refreshes that fail', async () => {
    player.served.delete('/rest/v1/rpc/venue_details');
    await venuePage.waitForTimeout(HOLD_MS);
    assert.ok(await venuePage.getByText(VENUE.name, { exact: true }).first().isVisible());
    assert.equal(
      await venuePage.getByText('Could not load this venue', { exact: true }).count(),
      0,
    );
    assert.equal(await venuePage.getByText('Venue not found', { exact: true }).count(), 0);
  });

  await check('a malformed id is "not found" without asking the server', async () => {
    for (const [path, message] of [
      ['/venue/not-a-venue-id', 'Venue not found'],
      ['/session/not-a-session-id', 'Session unavailable'],
    ]) {
      const page = await player.context.newPage();
      // Counted per page: the screens opened above are still polling in this context.
      const sent = [];
      page.on('request', (request) => {
        if (API.test(request.url())) sent.push(new URL(request.url()).pathname);
      });
      await page.goto(`${APP}${path}`);
      await page.getByText(message, { exact: true }).waitFor({ timeout: PROMPT_MS });
      await page.waitForTimeout(1500);
      assert.deepEqual(sent, [], `${path} sent requests`);
      await page.close();
    }
  });
  await visitor.context.close();

  // --- Signed in: screens that read the player's own data ------------------
  const signedIn = async (path) => {
    const page = await player.context.newPage();
    await page.goto(`${APP}${path}`);
    return page;
  };
  await check(
    'sign-in: a failed profile lookup offers a retry instead of a blank screen',
    async () => {
      const page = await signedIn('/sign-in');
      await button(page, 'Try again').waitFor({ timeout: PROMPT_MS });
      await page.screenshot({ path: 'test-results/ui/unreachable-sign-in.png' });
    },
  );
  await check('chats: explains the failure promptly', async () => {
    const page = await signedIn('/chats');
    await page.getByText('Could not load chats', { exact: true }).waitFor({ timeout: PROMPT_MS });
    await button(page, 'Try again').waitFor({ timeout: 1000 });
  });
  await check(
    'check-in: an unreachable server is not reported as an unavailable venue',
    async () => {
      const page = await signedIn(`/check-in/${RECORD_ID}`);
      await page
        .getByText('Could not load this venue', { exact: true })
        .waitFor({ timeout: PROMPT_MS });
      await button(page, 'Try again').waitFor({ timeout: 1000 });
      assert.equal(await page.getByText('This venue is unavailable.', { exact: true }).count(), 0);
    },
  );
  await check('create session: says why there are no sports to choose', async () => {
    const page = await signedIn('/run/new');
    await page
      .getByText('Could not load the sports list.', { exact: false })
      .waitFor({ timeout: PROMPT_MS });
    await button(page, 'Try again').waitFor({ timeout: 1000 });
    await page.screenshot({ path: 'test-results/ui/unreachable-create-session.png' });
  });
  await player.context.close();
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(`\nFAIL: ${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log(
  '\nPASS: unreachable-server states are prompt, stable under polling, recoverable and distinct from "not found".',
);
