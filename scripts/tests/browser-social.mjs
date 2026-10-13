import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { adminKey, hostedProject } from '../supabase-project.mjs';

// Explicit target selection is required: this test creates temporary accounts
// and sessions on the configured hosted project and removes them in finally.
const selectedRef = process.argv.find((arg) => arg.startsWith('--project-ref='))?.split('=')[1];
if (!selectedRef)
  throw new Error(
    'Pass --project-ref=YOUR_PROJECT_REF to authorize temporary hosted test fixtures.',
  );
fs.mkdirSync('test-results/ui', { recursive: true });
const { ref, token } = hostedProject();
const url = process.env.EXPO_PUBLIC_SUPABASE_URL,
  anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
assert.equal(ref, selectedRef, 'Selected test project must match the configured app project.');
assert.equal(new URL(url).hostname, `${ref}.supabase.co`);
const users = [];
let admin, browser;
const errors = [];
function unwrap(r) {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
async function fixture() {
  const { user, properties } = unwrap(
    await admin.auth.admin.generateLink({
      type: 'signup',
      email: `ui-${crypto.randomUUID()}@example.test`,
      password: crypto.randomUUID(),
    }),
  );
  users.push(user.id);
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const data = unwrap(
    await client.auth.verifyOtp({ token_hash: properties.hashed_token, type: 'signup' }),
  );
  return { client, session: data.session };
}
async function pageFor(session) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 46.234, longitude: -63.129 },
    permissions: ['geolocation'],
  });
  await ctx.addInitScript(
    ({ key, value }) => {
      if (!sessionStorage.getItem('fixture-started')) {
        localStorage.setItem(key, JSON.stringify(value));
        sessionStorage.setItem('fixture-started', '1');
      }
    },
    { key: `sb-${ref}-auth-token`, value: session },
  );
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.setDefaultTimeout(20000);
  return page;
}
(async () => {
  const key = await adminKey({ ref, token });
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  browser = await chromium.launch({ headless: true });
  try {
    const host = await fixture(),
      guest = await fixture();
    const hostPage = await pageFor(host.session);
    await hostPage.goto('http://localhost:8081/callback');
    await hostPage.getByRole('textbox', { name: 'Display name', exact: true }).fill('UI Test Host');
    await hostPage.getByRole('button', { name: 'Basketball', exact: true }).click();
    await hostPage.getByRole('button', { name: 'Finish account setup', exact: true }).click();
    await hostPage.getByText('UI Test Host', { exact: true }).waitFor();
    console.log('PASS browser: onboarding');
    await hostPage.getByRole('button', { name: 'Edit', exact: true }).click();
    await hostPage
      .getByRole('textbox', { name: 'Display name', exact: true })
      .fill('UI Test Organizer');
    await hostPage.getByRole('button', { name: 'Save profile', exact: true }).click();
    await hostPage.getByText('UI Test Organizer', { exact: true }).waitFor();
    await hostPage.screenshot({ path: 'test-results/ui/profile-authenticated.png' });
    console.log('PASS browser: profile edit');
    await hostPage.goto('http://localhost:8081/run/new');
    const title = 'UI verification ' + crypto.randomUUID().slice(0, 8);
    await hostPage.getByRole('textbox', { name: 'Session name', exact: true }).fill(title);
    await hostPage.getByRole('button', { name: 'Basketball', exact: true }).click();
    // The day strip starts at "Today"; the second named day is two days ahead.
    // An explicit evening start keeps the default length inside the day.
    await hostPage
      .getByRole('button', { name: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2}$/ })
      .nth(1)
      .click();
    await hostPage.getByRole('button', { name: '7:00 PM', exact: true }).click();
    await hostPage.getByRole('button', { name: 'Use my location', exact: true }).click();
    await hostPage.getByText(/Meeting pin:/).waitFor();
    await hostPage
      .getByRole('textbox', { name: 'Meeting spot name', exact: true })
      .fill('Temporary UI test meeting spot');
    await hostPage
      .getByRole('button', { name: 'Create session and open chat', exact: true })
      .click();
    await hostPage.getByText(title, { exact: true }).waitFor();
    const sessionUrl = hostPage.url();
    const id = sessionUrl.split('/session/')[1];
    assert(id);
    await hostPage.screenshot({ path: 'test-results/ui/session-authenticated.png' });
    console.log('PASS browser: create pin session');
    await hostPage.getByRole('tab', { name: 'Chat', exact: true }).click();
    await hostPage
      .getByRole('textbox', { name: 'Message the session', exact: true })
      .fill('Test fixture: see you at the court.');
    await hostPage.getByRole('button', { name: 'Send', exact: true }).click();
    await hostPage.getByText('Test fixture: see you at the court.', { exact: true }).waitFor();
    console.log('PASS browser: organizer chat send');
    const guestPage = await pageFor(guest.session);
    unwrap(
      await guest.client.rpc('update_own_profile', {
        p_display_name: 'UI Test Player',
        p_sport_ids: [],
        p_complete_onboarding: true,
      }),
    );
    await guestPage.goto(sessionUrl);
    await guestPage.getByRole('tab', { name: 'Chat', exact: true }).click();
    await guestPage.getByText('The chat is for people who joined', { exact: true }).waitFor();
    assert.equal(
      await guestPage.getByText('Test fixture: see you at the court.', { exact: true }).count(),
      0,
    );
    await guestPage.getByRole('button', { name: 'Join session', exact: true }).click();
    await guestPage.getByText('Test fixture: see you at the court.', { exact: true }).waitFor();
    await guestPage
      .getByRole('textbox', { name: 'Message the session', exact: true })
      .fill('Test fixture: I am joining.');
    await guestPage.getByRole('button', { name: 'Send', exact: true }).click();
    await hostPage.getByText('Test fixture: I am joining.', { exact: true }).waitFor();
    await hostPage.screenshot({ path: 'test-results/ui/chat-authenticated.png' });
    console.log('PASS browser: private two-account chat and polling');
    await guestPage.goto('http://localhost:8081/scheduled');
    await guestPage.getByText(title, { exact: true }).waitFor();
    console.log('PASS browser: joined session appears in Scheduled');
    await guestPage.goto(sessionUrl);
    await guestPage.getByRole('button', { name: /Leave session/ }).click();
    await guestPage
      .getByRole('dialog')
      .getByRole('button', { name: 'Leave session', exact: true })
      .click();
    await guestPage.getByRole('button', { name: 'Join session', exact: true }).waitFor();
    console.log('PASS browser: leave session');
    await hostPage.goto(sessionUrl);
    await hostPage.getByRole('button', { name: /Cancel session/ }).click();
    await hostPage
      .getByRole('dialog')
      .getByRole('button', { name: 'Cancel session', exact: true })
      .click();
    await hostPage.getByText('Session cancelled', { exact: true }).waitFor();
    await hostPage.goto('http://localhost:8081/scheduled');
    await hostPage.getByRole('tab', { name: 'Past', exact: true }).click();
    await hostPage.getByText(title, { exact: true }).waitFor();
    console.log('PASS browser: cancel occurrence and schedule history');
    await hostPage.goto('http://localhost:8081/profile');
    await hostPage.getByRole('button', { name: /Sign out/ }).click();
    await hostPage
      .getByRole('button', { name: 'Sign in or create account', exact: true })
      .waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS browser: sign out; no runtime exceptions.');
  } finally {
    if (browser) await browser.close();
    for (const id of users.reverse()) {
      const result = await admin.auth.admin.deleteUser(id);
      if (result.error) throw new Error('Test user cleanup failed: ' + result.error.message);
    }
    console.log('Temporary accounts and their sessions cleaned up.');
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
