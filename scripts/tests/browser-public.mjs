import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

// Requires locally running mobile (8081) and admin (5173) apps. Email delivery
// is intercepted; this script never sends an email or creates an account.
mkdirSync('test-results/ui', { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      geolocation: { latitude: 46.234, longitude: -63.129 },
      permissions: ['geolocation'],
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('http://localhost:8081/');
    // The results sheet resizes only by dragging; the list view is the control
    // a pointer, a keyboard or a screen reader can all use.
    await page.getByRole('button', { name: 'Show list view', exact: true }).click();
    await page
      .getByRole('button', { name: / away\.$/ })
      .first()
      .click();
    await page.getByText('Create a session here', { exact: true }).waitFor();
    await page.screenshot({ path: 'test-results/ui/venue.png' });
    await page.getByText('Create a session here', { exact: true }).click();
    await page.getByText('Sign in to organize', { exact: true }).waitFor();
    await page.goto('http://localhost:8081/feed');
    await page.getByRole('button', { name: 'Search sessions', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Search sessions', exact: true })
      .fill('NoMatchingGameHere');
    await page.getByText('No matching sessions', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await page.getByRole('tab', { name: 'Moments', exact: true }).click();
    assert.equal(
      await page.getByRole('tab', { name: 'Moments', exact: true }).getAttribute('aria-selected'),
      'true',
    );
    await page.goto('http://localhost:8081/sign-in');
    await page.getByRole('textbox', { name: 'Email address', exact: true }).fill('invalid');
    await page.getByRole('button', { name: 'Continue with email', exact: true }).click();
    await page
      .getByText('Enter a valid email address to get your sign-in link.', { exact: true })
      .waitFor();
    let otpCalls = 0;
    await page.route('**/auth/v1/otp*', async (route) => {
      otpCalls++;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page
      .getByRole('textbox', { name: 'Email address', exact: true })
      .fill('ui-flow@example.test');
    await page.getByRole('button', { name: 'Continue with email', exact: true }).click();
    await page.getByText('Check your email', { exact: true }).waitFor();
    assert.equal(otpCalls, 1);
    await page.getByRole('button', { name: 'Use a different email', exact: true }).click();
    await page.getByRole('textbox', { name: 'Email address', exact: true }).waitFor();
    await page.setViewportSize({ width: 1440, height: 980 });
    await page.goto('http://localhost:8081/');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-results/ui/desktop-live.png' });
    assert.equal(
      await page.getByRole('button', { name: 'Expand venue list', exact: true }).count(),
      0,
    );
    await page.goto('http://localhost:5173');
    await page.getByRole('heading', { name: 'Admin sign in', exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'test-results/ui/admin-mobile.png' });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS: venue navigation; session auth gate; Discover search/filter/Moments; email validation + stubbed delivery; desktop map; responsive admin. No runtime exceptions. No emails sent.',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
