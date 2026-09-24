import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { hostedProject } from '../supabase-project.mjs';

// Creates only temporary identities, submissions and venues. No email is sent.
const { ref, token } = hostedProject();
assert.equal(
  process.argv.find((a) => a.startsWith('--project-ref='))?.split('=')[1],
  ref,
  'Explicit --project-ref must match the configured app project.',
);
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname, `${ref}.supabase.co`);
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
  headers: { Authorization: `Bearer ${token}` },
});
assert(response.ok);
const serviceKey = (await response.json()).find((k) => k.name === 'service_role')?.api_key;
assert(serviceKey);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, options);
const users = [],
  venues = [];
const errors = [];
const name = `Temporary review test ${crypto.randomUUID().slice(0, 8)}`;
const browser = await chromium.launch();
mkdirSync('test-results/ui', { recursive: true });
function unwrap(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
async function identity() {
  const { user, properties } = unwrap(
    await admin.auth.admin.generateLink({
      type: 'signup',
      email: `review-${crypto.randomUUID()}@example.test`,
      password: crypto.randomUUID(),
    }),
  );
  users.push(user.id);
  const client = createClient(url, anon, options);
  const { session } = unwrap(
    await client.auth.verifyOtp({ token_hash: properties.hashed_token, type: 'signup' }),
  );
  unwrap(
    await client.rpc('update_own_profile', {
      p_display_name: 'Temporary reviewer test',
      p_sport_ids: [],
      p_complete_onboarding: true,
    }),
  );
  return { user, session, client };
}
async function pageFor(session, geolocation) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ...(geolocation ? { geolocation, permissions: ['geolocation'] } : {}),
  });
  await context.addInitScript(
    ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    { key: `sb-${ref}-auth-token`, session },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  page.on('pageerror', (error) => errors.push(error.message));
  return page;
}
try {
  const submitter = await identity();
  const reviewer = await identity();
  unwrap(
    await admin
      .from('admin_users')
      .insert({ user_id: reviewer.user.id, note: 'Temporary browser review verification' }),
  );
  const mobile = await pageFor(submitter.session, { latitude: 43.6532, longitude: -79.3832 });
  await mobile.goto('http://localhost:8081/venue-submission/new');
  const proceed = mobile.getByRole('button', { name: 'None of these — continue', exact: true });
  await proceed.waitFor();
  assert.equal(
    await proceed.getAttribute('aria-disabled'),
    'true',
    'Default coordinates must require explicit selection',
  );
  await mobile.getByRole('button', { name: 'Use my location', exact: true }).click();
  await mobile.getByText(/Final coordinates: 43.653200, -79.383200/).waitFor();
  await mobile.context().setGeolocation({ latitude: 46.24, longitude: -63.14 });
  await mobile.getByRole('button', { name: 'Use my location', exact: true }).click();
  await mobile.getByText(/Final coordinates: 46.240000, -63.140000/).waitFor();
  await proceed.click();
  await mobile.getByRole('textbox', { name: 'Venue name', exact: true }).fill(name);
  await mobile.getByRole('button', { name: 'Basketball', exact: true }).click();
  await mobile.getByRole('button', { name: 'Outdoor', exact: true }).click();
  await mobile.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await mobile.getByText('Submitted for review', { exact: true }).waitFor();
  const candidate = unwrap(
    await admin.from('venue_candidates').select('*').eq('submitted_by', submitter.user.id).single(),
  );
  assert(['pending', 'possible_duplicate'].includes(candidate.status));
  await mobile.getByRole('button', { name: 'View your submissions', exact: true }).click();
  await mobile.getByText(name, { exact: true }).waitFor();
  await mobile.getByText('Under review', { exact: true }).waitFor();
  const publicClient = createClient(url, anon, options);
  assert.equal(unwrap(await publicClient.from('venues').select('id').eq('name', name)).length, 0);
  assert(
    (
      await submitter.client.rpc('admin_review_candidate', {
        p_candidate_id: candidate.id,
        p_decision: 'approve',
      })
    ).error,
  );
  console.log(
    'PASS: explicit location, venue submission, private pending venue, non-admin review denied',
  );
  const adminPage = await pageFor(reviewer.session);
  await adminPage.goto('http://localhost:5173');
  await adminPage.getByRole('link', { name: 'Location approvals', exact: true }).click();
  await adminPage.getByRole('textbox', { name: 'Search by name', exact: true }).fill(name);
  await adminPage
    .getByRole('row')
    .filter({ hasText: name })
    .getByRole('button', { name: 'Review', exact: true })
    .click();
  await adminPage.screenshot({ path: 'test-results/ui/venue-review-dialog.png' });
  await adminPage.getByLabel(/^Decision/).selectOption('approve');
  await adminPage.getByRole('button', { name: 'Confirm review decision', exact: true }).click();
  await adminPage.getByRole('dialog').waitFor({ state: 'hidden' });
  const approved = unwrap(
    await admin
      .from('venue_candidates')
      .select('status,published_venue_id')
      .eq('id', candidate.id)
      .single(),
  );
  if (approved.published_venue_id) venues.push(approved.published_venue_id);
  assert.equal(approved.status, 'approved');
  assert(approved.published_venue_id);
  const published = unwrap(
    await publicClient
      .from('venues')
      .select('id,name')
      .eq('id', approved.published_venue_id)
      .single(),
  );
  assert.equal(published.name, name);
  assert(
    (
      await reviewer.client.rpc('admin_review_candidate', {
        p_candidate_id: candidate.id,
        p_decision: 'reject',
        p_note: 'Repeated decision must fail',
      })
    ).error,
  );
  await mobile.goto(`http://localhost:8081/venue/${published.id}`);
  await mobile.getByText(name, { exact: true }).first().waitFor();
  await mobile.getByText('Create a session here', { exact: true }).waitFor();
  await mobile.screenshot({ path: 'test-results/ui/venue-reviewed.png' });
  const audit = unwrap(
    await admin.from('admin_audit_log').select('action').eq('entity_id', candidate.id),
  );
  assert(audit.some((row) => row.action === 'candidate.approve'));
  const basketball = unwrap(
    await publicClient.from('sports').select('id').eq('slug', 'basketball').single(),
  );
  for (const decision of ['reject', 'merge']) {
    const proposedName = `${name} ${decision}`;
    const [submitted] = unwrap(
      await submitter.client.rpc('submit_venue', {
        p_name: proposedName,
        p_lat: 46.24,
        p_lon: -63.14,
        p_sport_ids: [basketball.id],
        p_indoor_state: 'outdoor',
      }),
    );
    assert(submitted);
    const item = unwrap(
      await admin
        .from('venue_candidates')
        .select('id,status')
        .eq('proposed_name', proposedName)
        .eq('submitted_by', submitter.user.id)
        .single(),
    );
    assert.equal(item.status, 'possible_duplicate');
    await adminPage
      .getByRole('textbox', { name: 'Search by name', exact: true })
      .fill(proposedName);
    await adminPage
      .getByRole('row')
      .filter({ hasText: proposedName })
      .getByRole('button', { name: 'Review', exact: true })
      .click();
    await adminPage.getByLabel(/^Decision/).selectOption(decision);
    if (decision === 'reject') {
      const note = adminPage.getByLabel(/^Review note/);
      assert.equal(await note.getAttribute('required'), '');
      await note.fill('Temporary verification: not a separate sports venue.');
    } else {
      await adminPage.getByLabel(/^Existing location/).selectOption(published.id);
    }
    await adminPage.getByRole('button', { name: 'Confirm review decision', exact: true }).click();
    await adminPage.getByRole('dialog').waitFor({ state: 'hidden' });
    const reviewed = unwrap(
      await admin
        .from('venue_candidates')
        .select('status,published_venue_id,review_note')
        .eq('id', item.id)
        .single(),
    );
    assert.equal(reviewed.status, decision === 'reject' ? 'rejected' : 'merged');
    assert.equal(reviewed.published_venue_id, decision === 'reject' ? null : published.id);
    const canonical = unwrap(
      await publicClient.from('venues').select('name').eq('id', published.id).single(),
    );
    assert.equal(canonical.name, name, 'Linking preserves the reviewed venue name');
  }
  console.log(
    'PASS: duplicate evidence, rejection with reason, explicit linking without overwriting canonical name',
  );
  await adminPage.getByRole('link', { name: 'Locations', exact: true }).click();
  await adminPage.getByRole('textbox', { name: 'Search by name', exact: true }).fill(name);
  const manage = () =>
    adminPage
      .getByRole('row')
      .filter({ hasText: name })
      .getByRole('button', { name: 'Manage', exact: true });
  await manage().click();
  await adminPage
    .getByLabel('Address', { exact: true })
    .fill('Temporary browser verification address');
  await adminPage.getByLabel('I have verified this venue', { exact: true }).check();
  await adminPage.getByRole('button', { name: 'Save venue changes', exact: true }).click();
  await adminPage.getByRole('dialog').waitFor({ state: 'hidden' });
  const edited = unwrap(
    await admin
      .from('venues')
      .select('address_text,verification_state')
      .eq('id', published.id)
      .single(),
  );
  assert.equal(edited.address_text, 'Temporary browser verification address');
  assert.equal(edited.verification_state, 'admin_verified');
  for (const status of ['removed', 'active']) {
    await manage().click();
    await adminPage.getByLabel(/^Publication/).selectOption(status);
    await adminPage.getByRole('button', { name: 'Save venue changes', exact: true }).click();
    await adminPage.getByRole('dialog').waitFor({ state: 'hidden' });
    const nearby = unwrap(
      await publicClient.rpc('nearby_venues', { p_lat: 46.24, p_lon: -63.14, p_radius_m: 100 }),
    );
    assert.equal(
      nearby.some((v) => v.venue_id === published.id),
      status === 'active',
    );
  }
  console.log('PASS: venue address edit, verification, removal from discovery and restoration');
  await mobile.goto('http://localhost:8081/profile');
  await mobile.getByRole('button', { name: 'Your venue submissions', exact: true }).click();
  await mobile.getByText('Approved', { exact: true }).waitFor();
  await mobile.getByText('Not approved', { exact: true }).waitFor();
  await mobile.getByText('Linked to an existing venue', { exact: true }).waitFor();
  await mobile
    .getByText('Temporary verification: not a separate sports venue.', { exact: true })
    .waitFor();
  await mobile.screenshot({ path: 'test-results/ui/venue-submission-history.png' });
  await mobile.getByRole('button', { name: `View venue: ${name}`, exact: true }).click();
  await mobile.getByText('Create a session here', { exact: true }).waitFor();
  const unrelated = await pageFor(reviewer.session, { latitude: 46.24, longitude: -63.14 });
  await unrelated.goto('http://localhost:8081/venue-submission');
  await unrelated.getByText('Know a great place to play?', { exact: true }).waitFor();
  assert.equal(await unrelated.getByText(name, { exact: true }).count(), 0);
  console.log(
    'PASS: persistent submission history, reviewer outcomes, linked venue navigation and account isolation',
  );
  const denied = await pageFor(submitter.session);
  await denied.goto('http://localhost:8081/venue-submission/new');
  await denied.getByText('Enable location to play', { exact: true }).waitFor();
  assert.equal(await denied.getByRole('textbox', { name: 'Venue name', exact: true }).count(), 0);
  await denied.screenshot({ path: 'test-results/ui/venue-submission-denied.png' });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: responsive admin approval, public venue navigation, final decision enforcement, audit record; no runtime exceptions',
  );
} finally {
  await browser.close();
  // Recover approved fixture IDs even if a browser assertion failed after publication.
  if (users.length) {
    const candidates = unwrap(
      await admin.from('venue_candidates').select('published_venue_id').in('submitted_by', users),
    );
    venues.push(...candidates.map((c) => c.published_venue_id).filter(Boolean));
    unwrap(await admin.from('venue_candidates').delete().in('submitted_by', users));
    unwrap(await admin.from('admin_audit_log').delete().in('actor_id', users));
  }
  if (venues.length)
    unwrap(
      await admin
        .from('venues')
        .delete()
        .in('id', [...new Set(venues)]),
    );
  for (const id of users) unwrap(await admin.auth.admin.deleteUser(id));
  console.log('Removed temporary review fixtures.');
}
