import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

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
  for (const route of ['/run/new', '/venue-submission/new']) {
    await page.goto(`http://localhost:8081${route}`);
    await page.getByText('Enable location to play', { exact: true }).waitFor();
    assert.equal(await page.locator('.mapboxgl-map').count(), 0);
  }
  // Sign-in, browsing and account settings (including deletion) must not depend
  // on location consent (App Store Review Guideline 5.1.1).
  for (const [route, heading] of [
    ['/feed', 'Discover'],
    ['/scheduled', 'Scheduled'],
    ['/chats', 'Chats'],
    ['/profile', 'Profile'],
    ['/sign-in', 'Continue with email'],
  ]) {
    await page.goto(`http://localhost:8081${route}`);
    await page.getByText(heading, { exact: true }).first().waitFor();
    assert.equal(await page.getByText('Enable location to play', { exact: true }).count(), 0);
  }
  assert.deepEqual(nearbyRequests, [], 'Screens without a location must not query venues');
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
