// Isolated website checks. Run against a Vite server started with:
// VITE_SUPABASE_URL=https://admin-test.supabase.co VITE_SUPABASE_ANON_KEY=test-public-key npm run dev --workspace apps/admin -- --port 5174
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch();
const base = 'http://localhost:5174';
const errors = [];
const point = Buffer.alloc(21);
point.writeUInt8(1, 0);
point.writeUInt32LE(1, 1);
point.writeDoubleLE(-79.38, 5);
point.writeDoubleLE(43.65, 13);
const candidate = {
  id: 'candidate-1',
  proposed_name: 'Riverside Basketball Court',
  address_text: '100 River Road',
  region_id: 1,
  status: 'pending',
  created_at: '2026-09-22T12:00:00Z',
  indoor_state: 'outdoor',
  location: point.toString('hex'),
};
let pending = true;
let decisions = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('https://admin-test.supabase.co/**', async (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').at(-1);
    let data = [];
    if (table === 'is_admin') data = true;
    if (table === 'regions')
      data = [{ id: 1, name: 'Toronto', timezone: 'America/Toronto', is_published: true }];
    if (table === 'sports') data = [{ id: 1, name: 'Basketball', is_active: true }];
    if (table === 'venues')
      data = [
        {
          id: 'venue-1',
          name: 'Existing court',
          region_id: 1,
          status: 'active',
          verification_state: 'unverified',
          indoor_state: 'outdoor',
        },
      ];
    if (table === 'venue_candidates') data = pending ? [candidate] : [];
    if (table === 'venue_candidate_sports')
      data = [{ sport_id: 1, sports: { name: 'Basketball' } }];
    if (table === 'admin_review_candidate') {
      decisions.push(route.request().postDataJSON());
      pending = false;
      data = null;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'access-control-expose-headers': 'content-range',
        'content-range': `0-0/${Array.isArray(data) ? data.length : 0}`,
      },
      body: JSON.stringify(data),
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base);
  await page.getByRole('heading', { name: 'Admin sign in' }).waitFor();
  await page.evaluate(() =>
    localStorage.setItem(
      'sb-admin-test-auth-token',
      JSON.stringify({
        access_token: 'test-token',
        refresh_token: 'test-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: {
          id: 'admin-1',
          email: 'admin@example.test',
          aud: 'authenticated',
          role: 'authenticated',
        },
      }),
    ),
  );
  await page.reload();
  await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
  await page.getByText('Riverside Basketball Court').waitFor();
  mkdirSync('test-results/ui', { recursive: true });
  await page.screenshot({ path: 'test-results/ui/admin-website-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByLabel(/^Decision/).selectOption('reject');
  assert(await page.getByRole('button', { name: 'Confirm review decision' }).isDisabled());
  await page.getByLabel('Review note').fill('Please provide the correct address.');
  await page.getByRole('button', { name: 'Confirm review decision' }).click();
  await page.getByRole('status').filter({ hasText: 'Submission rejected.' }).waitFor();
  assert.equal(decisions[0].p_decision, 'reject');
  assert.equal(decisions[0].p_note, 'Please provide the correct address.');
  await page.getByRole('heading', { name: 'You’re all caught up' }).waitFor();
  for (const decision of ['approve', 'merge']) {
    pending = true;
    await page.getByRole('button', { name: 'Refresh data' }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.getByLabel(/^Decision/).selectOption(decision);
    if (decision === 'approve') await page.getByLabel('Published name').fill('Reviewed court name');
    else {
      assert(await page.getByRole('button', { name: 'Confirm review decision' }).isDisabled());
      await page.getByLabel(/^Existing location/).selectOption('venue-1');
    }
    await page.getByRole('button', { name: 'Confirm review decision' }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(decisions.at(-1).p_decision, decision);
    if (decision === 'approve') assert.equal(decisions.at(-1).p_name, 'Reviewed court name');
    else assert.equal(decisions.at(-1).p_target_venue_id, 'venue-1');
  }
  await page.getByRole('link', { name: 'Location approvals', exact: true }).click();
  await page.getByRole('heading', { name: 'Location approvals', exact: true }).waitFor();
  assert(page.url().endsWith('#approvals'));
  await page.getByRole('link', { name: 'Locations', exact: true }).click();
  await page.goBack();
  await page.getByRole('heading', { name: 'Location approvals', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'Location approvals', exact: true }).waitFor();
  for (const name of ['Locations', 'Activity', 'Regions & sports']) {
    await page.getByRole('link', { name, exact: true }).click();
    await page.getByRole('heading', { name, exact: true }).waitFor();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Page must fit mobile viewport',
  );
  await page.screenshot({ path: 'test-results/ui/admin-website-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    'Admin website passed: sign in, dashboard, approval, duplicate linking, rejection payload and validation, success feedback, empty state, navigation, back, reload, reference pages, mobile width, and no browser errors.',
  );
} finally {
  await browser.close();
}
