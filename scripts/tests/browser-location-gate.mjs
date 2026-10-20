import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

if (existsSync('.env')) process.loadEnvFile('.env');
assert.ok(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  'Set EXPO_PUBLIC_SUPABASE_URL in .env. The signed-in checks derive the session storage key from it.',
);
const projectRef = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
/** A stored session stands in for a player; their API calls are answered locally. */
const PLAYER = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'location-check@example.test',
  aud: 'authenticated',
  role: 'authenticated',
};
const PROFILE = {
  id: PLAYER.id,
  display_name: 'Location Check',
  avatar_path: null,
  home_region_id: null,
  onboarding_completed_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

mkdirSync('test-results/ui', { recursive: true });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  const errors = [],
    nearbyRequests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/rpc/nearby_venues')) nearbyRequests.push(request.postDataJSON());
  });
  await page.goto('http://localhost:8081/');
  await page.getByText('Enable location to play', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Create session', exact: true }).count(), 0);
  assert.equal(await page.locator('.mapboxgl-map').count(), 0);
  assert.deepEqual(nearbyRequests, [], 'Denied permission must not query a fallback location');
  await page.screenshot({ path: 'test-results/ui/location-required.png' });
  await page.getByRole('button', { name: 'Browse upcoming sessions', exact: true }).waitFor();

  // Sign-in, browsing and account settings (including deletion) must not depend
  // on location consent (App Store Review Guideline 5.1.1). A visitor can reach
  // sign-in; everything else needs a signed-in player.
  await page.goto('http://localhost:8081/sign-in');
  await page.getByText('Continue with email', { exact: true }).first().waitFor();
  assert.equal(await page.getByText('Enable location to play', { exact: true }).count(), 0);

  const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await playerContext.route(/\/(rest|auth|storage|functions)\/v1\//, (route) => {
    const { pathname } = new URL(route.request().url());
    let body = [];
    if (pathname.includes('/auth/v1/')) body = PLAYER;
    if (pathname.endsWith('/rpc/current_profile')) body = PROFILE;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await playerContext.addInitScript(
    ([key, user]) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          access_token: 'location-check-token',
          refresh_token: 'location-check-refresh',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }),
      ),
    [`sb-${projectRef}-auth-token`, PLAYER],
  );
  const player = await playerContext.newPage();
  player.setDefaultTimeout(25000);
  player.on('pageerror', (error) => errors.push(error.message));
  player.on('request', (request) => {
    if (request.url().includes('/rpc/nearby_venues')) nearbyRequests.push(request.postDataJSON());
  });
  for (const route of ['/run/new', '/venue-submission/new']) {
    await player.goto(`http://localhost:8081${route}`);
    await player.getByText('Enable location to play', { exact: true }).waitFor();
    assert.equal(await player.locator('.mapboxgl-map').count(), 0);
  }
  for (const [route, heading] of [
    ['/feed', 'Discover'],
    ['/scheduled', 'Scheduled'],
    ['/chats', 'Chats'],
    ['/profile', 'Profile'],
  ]) {
    await player.goto(`http://localhost:8081${route}`);
    await player.getByRole('heading', { name: heading, exact: true }).waitFor();
    assert.equal(await player.getByText('Enable location to play', { exact: true }).count(), 0);
  }
  assert.deepEqual(nearbyRequests, [], 'Screens without a location must not query venues');
  await playerContext.close();
  await page.goto('http://localhost:8081/');
  await page.getByText('Enable location to play', { exact: true }).waitFor();
  await context.setGeolocation({ latitude: 43.6532, longitude: -79.3832 });
  const firstNearby = page.waitForRequest((r) => r.url().includes('/rpc/nearby_venues'));
  await context.grantPermissions(['geolocation']);
  const payload = (await firstNearby).postDataJSON();
  assert.equal(payload.p_lat, 43.6532);
  assert.equal(payload.p_lon, -79.3832);
  await page.getByRole('button', { name: 'Create session', exact: true }).waitFor();
  await context.clearPermissions();
  await page.getByText('Enable location to play', { exact: true }).waitFor();
  assert.equal(await page.locator('.mapboxgl-map').count(), 0);
  await context.grantPermissions(['geolocation']);
  await page.getByRole('button', { name: 'Create session', exact: true }).waitFor();
  assert(
    nearbyRequests.every(
      (p) => Math.abs(p.p_lat - 43.6532) < 0.01 && Math.abs(p.p_lon + 79.3832) < 0.01,
    ),
  );
  const unavailableContext = await browser.newContext({ permissions: ['geolocation'] });
  await unavailableContext.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_success, failure) =>
      failure?.({
        code: 2,
        message: 'Test GPS unavailable',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      });
  });
  const unavailable = await unavailableContext.newPage();
  unavailable.on('pageerror', (error) => errors.push(error.message));
  await unavailable.goto('http://localhost:8081/');
  await unavailable
    .getByText('We couldn’t get a location. Check that location services are on, then try again.', {
      exact: true,
    })
    .waitFor();
  assert.equal(await unavailable.locator('.mapboxgl-map').count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: denied location gates only location screens and leaves sign-in, browsing and profile usable; permission grant uses actual GPS; revocation blocks again; restoration recovers; unavailable GPS has no fallback.',
  );
} finally {
  await browser.close();
}
