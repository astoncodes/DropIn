import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { setUpAdminAuthenticator } from '../admin-mfa.mjs';
import { adminKey, hostedProject } from '../supabase-project.mjs';

// Requires the mobile web app on port 8081 and the admin website on port 5173.
// Creates three temporary accounts (an author, a reporter and a moderator), a
// session, a chat message and a photo post on the configured hosted project,
// and removes them when it finishes. The moderator sets up an authenticator on
// the admin website, which goes with the account. No email is sent.
//
// It covers what no other check does against a real backend: a report made in
// the app reaches the admin queue, removing content deletes it and its files,
// dismissing a report keeps the content, and a block hides a player's messages
// from the blocker until it is lifted.

const { ref, token } = hostedProject();
assert.equal(
  process.argv.find((arg) => arg.startsWith('--project-ref='))?.split('=')[1],
  ref,
  'Explicit --project-ref must match the configured project; temporary fixtures are created and removed.',
);
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname, `${ref}.supabase.co`);
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, await adminKey({ ref, token }), options);

const APP = 'http://localhost:8081';
const ADMIN_SITE = 'http://localhost:5173';
const SPOT = { latitude: 46.2382, longitude: -63.1311 };
const run = crypto.randomUUID().slice(0, 8);
const AUTHOR = `Moderation Author ${run}`;
const CAPTION = `Temporary moderation photo ${run}`;
const MESSAGE = `Temporary moderation message ${run}`;
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);

const users = [];
const errors = [];
function unwrap(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
async function identity(name) {
  const { user, properties } = unwrap(
    await admin.auth.admin.generateLink({
      type: 'signup',
      email: `moderation-${crypto.randomUUID()}@example.test`,
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
      p_display_name: name,
      p_sport_ids: [],
      p_complete_onboarding: true,
    }),
  );
  return { id: user.id, session, client };
}
/** Removes an account the way account deletion does, so its stored files go too. */
async function removeAccount(id) {
  if (!(await admin.auth.admin.getUserById(id)).data.user) return;
  unwrap(await admin.rpc('prepare_account_deletion', { p_user_id: id }));
  for (;;) {
    const paths = unwrap(await admin.rpc('account_deletion_objects', { p_user_id: id })).map(
      (row) => row.storage_path,
    );
    if (!paths.length) break;
    unwrap(await admin.storage.from('session-media').remove(paths));
    unwrap(await admin.rpc('ack_account_deletion_objects', { p_user_id: id, p_paths: paths }));
  }
  unwrap(await admin.auth.admin.deleteUser(id));
}

let browser;
async function pageFor(session, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({
    viewport,
    geolocation: SPOT,
    permissions: ['geolocation'],
  });
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: `sb-${ref}-auth-token`, value: session },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(25_000);
  page.on('pageerror', (error) => errors.push(error.message));
  return page;
}
const reportsAbout = async (targetId) =>
  unwrap(await admin.from('content_reports').select('status').eq('target_id', targetId));

mkdirSync('test-results/ui', { recursive: true });
try {
  const author = await identity(AUTHOR);
  const reporter = await identity(`Moderation Reporter ${run}`);
  const moderator = await identity(`Moderation Admin ${run}`);
  unwrap(
    await admin
      .from('admin_users')
      .insert({ user_id: moderator.id, note: 'Temporary moderation check' }),
  );

  // --- Content to report: a session, a chat message and a photo post ---------
  const sport = unwrap(
    await admin.from('sports').select('id').eq('is_active', true).order('sort_order').limit(1),
  )[0];
  const sessionId = unwrap(
    await author.client.rpc('create_run_at_pin', {
      p_lat: SPOT.latitude,
      p_lon: SPOT.longitude,
      p_location_name: `Temporary moderation spot ${run}`,
      p_sport_id: sport.id,
      p_starts_on: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
      p_start_time: '19:00',
      p_end_time: '20:00',
      p_weeks: 1,
      p_title: `Temporary moderation session ${run}`,
      p_timezone: 'America/Halifax',
    }),
  );
  const occurrence = unwrap(
    await admin
      .from('run_sessions')
      .select('run_series_id, occurrence_date')
      .eq('id', sessionId)
      .single(),
  );
  unwrap(
    await reporter.client.rpc('set_run_attendance', {
      p_run_series_id: occurrence.run_series_id,
      p_occurrence_date: occurrence.occurrence_date,
      p_attendance: 'going',
    }),
  );
  const messageId = unwrap(
    await author.client
      .from('session_messages')
      .insert({ session_id: sessionId, user_id: author.id, body: MESSAGE })
      .select('id')
      .single(),
  ).id;
  const postId = unwrap(
    await author.client.rpc('create_session_photo_post', {
      p_session_id: sessionId,
      p_caption: CAPTION,
      p_lat: SPOT.latitude,
      p_lon: SPOT.longitude,
      p_accuracy: 10,
      p_observed_at: new Date().toISOString(),
    }),
  );
  const photoPath = `${author.id}/${postId}/moderation-check.png`;
  unwrap(
    await author.client.storage
      .from('session-media')
      .upload(photoPath, ONE_PIXEL_PNG, { contentType: 'image/png', upsert: false }),
  );
  unwrap(
    await author.client.from('session_media').insert({
      post_id: postId,
      uploader_id: author.id,
      kind: 'image',
      storage_path: photoPath,
      width: 1,
      height: 1,
    }),
  );
  const publicUrl = admin.storage.from('session-media').getPublicUrl(photoPath).data.publicUrl;
  assert.notEqual((await fetch(publicUrl)).status, 200, 'the photo is private');
  const { signedUrl } = unwrap(
    await reporter.client.storage.from('session-media').createSignedUrl(photoPath, 60),
  );
  assert.equal((await fetch(signedUrl)).status, 200, 'a signed-in player opens it by signed link');

  browser = await chromium.launch({ headless: true });
  const app = await pageFor(reporter.session);
  const adminSite = await pageFor(moderator.session, { width: 1280, height: 900 });

  // --- A post is reported in the app and removed by a moderator --------------
  await app.goto(`${APP}/feed`);
  await app.getByRole('tab', { name: 'Moments', exact: true }).click();
  await app.getByText(CAPTION, { exact: true }).waitFor();
  await app.getByRole('button', { name: `Report or block ${AUTHOR}`, exact: true }).click();
  await app.getByRole('button', { name: /Report this post/ }).click();
  await app.getByRole('button', { name: /Sexual content or nudity/ }).click();
  await app.getByRole('textbox', { name: /Add details/ }).fill('Temporary check: please ignore.');
  await app.getByRole('button', { name: 'Send report', exact: true }).click();
  await app.getByText('Thanks for telling us', { exact: true }).waitFor();
  await app.getByRole('button', { name: 'Done', exact: true }).click();
  assert.deepEqual(await reportsAbout(postId), [{ status: 'open' }]);
  console.log('PASS: a post reported in the app is recorded as an open report');

  await adminSite.goto(`${ADMIN_SITE}/#reports`);
  await setUpAdminAuthenticator(adminSite);
  const reportedPost = adminSite.getByRole('row').filter({ hasText: CAPTION });
  await reportedPost.getByText(`Post by ${AUTHOR}`, { exact: true }).waitFor();
  await reportedPost.getByRole('button', { name: 'Review', exact: true }).click();
  await adminSite.getByText('“Temporary check: please ignore.”', { exact: true }).waitFor();
  await adminSite.screenshot({ path: 'test-results/ui/moderation-report.png' });
  await adminSite.getByLabel('Remove content').check();
  await adminSite.getByLabel('Moderator note (optional)').fill('Temporary moderation check');
  await adminSite.getByRole('button', { name: 'Remove content', exact: true }).click();
  await adminSite
    .getByRole('status')
    .filter({ hasText: 'Content removed and reports closed.' })
    .waitFor();
  assert.equal(
    unwrap(await admin.from('session_posts').select('id').eq('id', postId)).length,
    0,
    'the post row is gone',
  );
  assert.equal(
    unwrap(await admin.from('session_media').select('id').eq('post_id', postId)).length,
    0,
    'its media rows are gone',
  );
  assert.equal(
    unwrap(await admin.storage.from('session-media').list(`${author.id}/${postId}`)).length,
    0,
    'its file is gone from storage',
  );
  assert.deepEqual(await reportsAbout(postId), [{ status: 'actioned' }]);
  assert.ok(
    unwrap(await admin.from('admin_audit_log').select('id').eq('actor_id', moderator.id)).length,
    'the removal is in the audit log',
  );
  await app.reload();
  await app.getByRole('tab', { name: 'Moments', exact: true }).click();
  await app.getByText(CAPTION, { exact: true }).waitFor({ state: 'hidden' });
  console.log('PASS: removing it deletes the post, its media rows and its stored file');

  // --- A message is reported, and the report is dismissed --------------------
  const message = app.getByLabel(`${AUTHOR}: ${MESSAGE}`, { exact: true });
  await app.goto(`${APP}/session/${sessionId}?tab=chat`);
  await message.click({ delay: 800 });
  await app.getByRole('button', { name: /Report this message/ }).click();
  await app.getByRole('button', { name: /Harassment or bullying/ }).click();
  await app.getByRole('button', { name: 'Send report', exact: true }).click();
  await app.getByText('Thanks for telling us', { exact: true }).waitFor();
  await app.getByRole('button', { name: 'Done', exact: true }).click();
  assert.deepEqual(await reportsAbout(messageId), [{ status: 'open' }]);

  await adminSite.getByRole('button', { name: 'Refresh data' }).click();
  const reportedMessage = adminSite.getByRole('row').filter({ hasText: MESSAGE });
  await reportedMessage.getByText(`Chat message by ${AUTHOR}`, { exact: true }).waitFor();
  await reportedMessage.getByRole('button', { name: 'Review', exact: true }).click();
  await adminSite.getByLabel('Dismiss reports').check();
  await adminSite.getByRole('button', { name: 'Confirm decision', exact: true }).click();
  await adminSite.getByRole('status').filter({ hasText: 'Reports dismissed.' }).waitFor();
  assert.deepEqual(await reportsAbout(messageId), [{ status: 'dismissed' }]);
  assert.equal(
    unwrap(await admin.from('session_messages').select('id').eq('id', messageId)).length,
    1,
    'a dismissed report leaves the message in place',
  );
  console.log('PASS: dismissing a report keeps the message and closes the report');

  // --- Blocking hides the author's messages; unblocking brings them back -----
  const visibleMessages = async () =>
    unwrap(await reporter.client.from('session_messages').select('id').eq('session_id', sessionId))
      .length;
  await app.reload();
  await message.click({ delay: 800 });
  await app.getByRole('button', { name: new RegExp(`^Block ${AUTHOR}`) }).click();
  await app.getByRole('button', { name: `Block ${AUTHOR}`, exact: true }).click();
  await message.waitFor({ state: 'hidden' });
  assert.equal(await visibleMessages(), 0, 'a blocked author’s messages are withheld');
  assert.equal(
    unwrap(await reporter.client.from('run_sessions').select('id').eq('id', sessionId)).length,
    1,
    'the session itself stays visible to the blocker',
  );

  await app.goto(`${APP}/blocked-players`);
  await app.getByText(AUTHOR, { exact: true }).waitFor();
  await app.getByRole('button', { name: 'Unblock', exact: true }).click();
  await app.getByRole('dialog').getByRole('button', { name: 'Unblock', exact: true }).click();
  await app.getByText(AUTHOR, { exact: true }).waitFor({ state: 'hidden' });
  await app.goto(`${APP}/session/${sessionId}?tab=chat`);
  await message.waitFor();
  assert.equal(await visibleMessages(), 1, 'unblocking shows the messages again');
  console.log('PASS: a block hides the author’s messages from the blocker until it is lifted');

  assert.deepEqual(errors, [], 'no screen threw an error');
  console.log('PASS: moderation end to end with temporary accounts; no runtime exceptions.');
} finally {
  await browser?.close();
  if (users.length) unwrap(await admin.from('admin_audit_log').delete().in('actor_id', users));
  for (const id of users.reverse()) await removeAccount(id);
  console.log('Temporary moderation fixtures removed.');
}
