import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { adminKey, hostedProject } from '../supabase-project.mjs';

const selected = process.argv.find((arg) => arg.startsWith('--project-ref='))?.split('=')[1];
const { ref, token } = hostedProject();
assert.equal(
  selected,
  ref,
  'Explicit --project-ref must match the configured project; temporary fixtures are created and cleaned up.',
);
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = await adminKey({ ref, token });
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, options);
const anonymous = createClient(url, anonKey, options);
const users = [];
let venueId, browser;
function unwrap(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
async function denied(client, fn, input, message) {
  assert((await client.rpc(fn, input)).error, message);
}
try {
  const players = [];
  for (const name of ['Presence Test Player', 'Presence Test Visitor']) {
    const { user, properties } = unwrap(
      await admin.auth.admin.generateLink({
        type: 'signup',
        email: `presence-${crypto.randomUUID()}@example.test`,
        password: crypto.randomUUID(),
      }),
    );
    users.push(user.id);
    const client = createClient(url, anonKey, options);
    const { session } = unwrap(
      await client.auth.verifyOtp({ type: 'signup', token_hash: properties.hashed_token }),
    );
    unwrap(
      await client.rpc('update_own_profile', {
        p_display_name: name,
        p_sport_ids: [],
        p_complete_onboarding: true,
      }),
    );
    players.push({ client, session });
  }
  const [owner, outsider] = players;
  const region = unwrap(
    await anonymous
      .from('regions')
      .select('id,min_lat,max_lat,min_lon,max_lon')
      .eq('is_published', true)
      .limit(1)
      .single(),
  );
  const sport = unwrap(
    await anonymous.from('sports').select('id').eq('is_active', true).limit(1).single(),
  );
  const lat = (Number(region.min_lat) + Number(region.max_lat)) / 2;
  const lon = (Number(region.min_lon) + Number(region.max_lon)) / 2;
  venueId = crypto.randomUUID();
  unwrap(
    await admin.from('venues').insert({
      id: venueId,
      region_id: region.id,
      name: 'Temporary presence test court',
      location: `SRID=4326;POINT(${lon} ${lat})`,
    }),
  );
  unwrap(await admin.from('venue_sports').insert({ venue_id: venueId, sport_id: sport.id }));
  const input = {
    p_venue_id: venueId,
    p_sport_id: sport.id,
    p_lat: lat,
    p_lon: lon,
    p_accuracy: 10,
    p_observed_at: new Date().toISOString(),
    p_duration_minutes: 90,
    p_party_size: 5,
    p_note: '  Test note  ',
  };
  await denied(anonymous, 'create_check_in', input, 'Anonymous check-in denied');
  for (const bad of [
    { p_accuracy: 101 },
    { p_lat: lat + 1 },
    { p_sport_id: -1 },
    { p_duration_minutes: 29 },
    { p_duration_minutes: 241 },
    { p_party_size: 21 },
    { p_note: 'x'.repeat(121) },
    { p_observed_at: new Date(Date.now() - 180000).toISOString() },
    { p_observed_at: new Date(Date.now() + 60000).toISOString() },
  ]) {
    await denied(
      owner.client,
      'create_check_in',
      { ...input, ...bad },
      'Invalid check-in rejected',
    );
  }
  const arrivalInput = { p_venue_id: venueId, p_sport_id: sport.id, p_eta_minutes: 15 };
  const arrival1 = unwrap(await owner.client.rpc('set_arrival_intent', arrivalInput));
  const arrival2 = unwrap(await owner.client.rpc('set_arrival_intent', arrivalInput));
  assert(
    unwrap(await admin.from('arrival_intents').select('cancelled_at').eq('id', arrival1).single())
      .cancelled_at,
  );
  await denied(
    outsider.client,
    'cancel_arrival_intent',
    { p_intent_id: arrival2 },
    'Another player cannot cancel arrival',
  );
  const checkIn = unwrap(await owner.client.rpc('create_check_in', input));
  assert.equal(
    unwrap(await anonymous.rpc('venue_details', { p_venue_id: venueId }))[0].here_now,
    5,
  );
  const row = unwrap(await owner.client.from('check_ins').select('*').eq('id', checkIn).single());
  assert.equal(row.note, 'Test note');
  assert.equal(row.distance_to_venue_m, 0);
  assert.equal(row.reported_accuracy_m, 10);
  assert.equal(
    unwrap(
      await admin
        .from('arrival_intents')
        .select('fulfilled_by_check_in_id')
        .eq('id', arrival2)
        .single(),
    ).fulfilled_by_check_in_id,
    checkIn,
  );
  await denied(
    outsider.client,
    'end_check_in',
    { p_check_in_id: checkIn },
    'Another player cannot check out owner',
  );
  await denied(
    outsider.client,
    'extend_check_in',
    { p_check_in_id: checkIn },
    'Another player cannot extend',
  );
  unwrap(await owner.client.rpc('extend_check_in', { p_check_in_id: checkIn, p_minutes: 30 }));
  await denied(
    owner.client,
    'extend_check_in',
    { p_check_in_id: checkIn, p_minutes: 121 },
    'Four-hour total window enforced',
  );
  const replacement = unwrap(
    await owner.client.rpc('create_check_in', {
      ...input,
      p_observed_at: new Date().toISOString(),
    }),
  );
  assert.equal(
    unwrap(await admin.from('check_ins').select('end_reason').eq('id', checkIn).single())
      .end_reason,
    'replaced',
  );
  unwrap(await owner.client.rpc('end_check_in', { p_check_in_id: replacement }));
  assert.equal(
    unwrap(await anonymous.rpc('venue_details', { p_venue_id: venueId }))[0].here_now,
    0,
  );
  await denied(
    owner.client,
    'extend_check_in',
    { p_check_in_id: replacement },
    'Ended check-in cannot be extended',
  );
  const expiring = unwrap(
    await owner.client.rpc('create_check_in', {
      ...input,
      p_observed_at: new Date().toISOString(),
    }),
  );
  unwrap(
    await admin
      .from('check_ins')
      .update({
        started_at: new Date(Date.now() - 120000).toISOString(),
        expires_at: new Date(Date.now() - 1000).toISOString(),
      })
      .eq('id', expiring),
  );
  assert.equal(
    unwrap(await anonymous.rpc('venue_details', { p_venue_id: venueId }))[0].here_now,
    0,
  );
  assert.equal(unwrap(await anonymous.rpc('venue_activity', { p_venue_id: venueId })).length, 0);
  assert.equal(
    unwrap(await outsider.client.from('check_ins').select('id').eq('id', expiring)).length,
    0,
  );
  console.log(
    'PASS presence API: location, durations, party size, ownership, replacement, arrival fulfillment, checkout, expiry and privacy.',
  );

  if (process.argv.includes('--browser')) {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      geolocation: { latitude: lat, longitude: lon, accuracy: 10 },
      permissions: ['geolocation'],
    });
    await context.addInitScript(
      ({ key, value }) => {
        if (!sessionStorage.getItem('presence-fixture')) {
          localStorage.setItem(key, JSON.stringify(value));
          sessionStorage.setItem('presence-fixture', '1');
        }
      },
      { key: `sb-${ref}-auth-token`, value: owner.session },
    );
    const page = await context.newPage();
    const errors = [];
    let intentionallyOffline = false;
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (
        message.type() === 'error' &&
        !message.text().includes('status of 400') &&
        !(intentionallyOffline && message.text().includes('net::ERR_INTERNET_DISCONNECTED'))
      )
        errors.push(message.text());
    });
    page.setDefaultTimeout(30000);
    await page.goto(`http://localhost:8081/venue/${venueId}`);
    await page.getByRole('button', { name: "I'm on my way", exact: true }).click();
    await page.getByRole('button', { name: "I'm on my way", exact: true }).click();
    await page.getByText("You're on your way", { exact: true }).filter({ visible: true }).waitFor();
    await page.getByRole('button', { name: "I've arrived · check in", exact: true }).click();
    await page.getByRole('button', { name: 'More players', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Check-in note' })
      .fill('Test fixture: bringing a ball');
    await page.getByRole('button', { name: 'Check in now', exact: true }).click();
    await page.getByText("You're checked in", { exact: true }).filter({ visible: true }).waitFor();
    assert.equal(
      unwrap(await anonymous.rpc('venue_details', { p_venue_id: venueId }))[0].here_now,
      2,
    );
    const active = unwrap(
      await owner.client.from('check_ins').select('*').is('ended_at', null).single(),
    );
    const extensionResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/rpc/extend_check_in') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Stay 30 min longer', exact: true }).click();
    assert((await extensionResponse).ok(), 'Extension request succeeds');
    const extended = unwrap(
      await owner.client.from('check_ins').select('expires_at').eq('id', active.id).single(),
    );
    assert.equal(Date.parse(extended.expires_at) - Date.parse(active.expires_at), 1800000);
    mkdirSync('test-results/ui', { recursive: true });
    await page.screenshot({ path: 'test-results/ui/check-in.png', fullPage: true });
    await page.getByRole('button', { name: 'Check out', exact: true }).click();
    await page
      .getByText("You're checked in", { exact: true })
      .filter({ visible: true })
      .waitFor({ state: 'hidden' });
    assert.equal(
      unwrap(await anonymous.rpc('venue_details', { p_venue_id: venueId }))[0].here_now,
      0,
    );
    await context.setGeolocation({ latitude: lat + 1, longitude: lon, accuracy: 10 });
    await page.getByRole('button', { name: 'Check in here', exact: true }).click();
    await page.getByRole('button', { name: 'Check in now', exact: true }).click();
    await page
      .getByText('Move within 250 metres of the venue to check in.', { exact: true })
      .waitFor();
    const timerCheckIn = unwrap(
      await owner.client.rpc('create_check_in', {
        ...input,
        p_observed_at: new Date().toISOString(),
      }),
    );
    unwrap(
      await admin
        .from('check_ins')
        .update({ expires_at: new Date(Date.now() + 12000).toISOString() })
        .eq('id', timerCheckIn),
    );
    await page.goto(`http://localhost:8081/venue/${venueId}`);
    await page.getByText("You're checked in", { exact: true }).filter({ visible: true }).waitFor();
    await page.getByText('Presence Test Player +4', { exact: true }).waitFor();
    intentionallyOffline = true;
    await context.setOffline(true);
    await page
      .getByText("You're checked in", { exact: true })
      .filter({ visible: true })
      .waitFor({ state: 'hidden' });
    await page.getByText('Presence Test Player +4', { exact: true }).waitFor({ state: 'hidden' });
    assert.match(await page.getByText('Here now', { exact: true }).locator('..').innerText(), /^0/);
    await context.setOffline(false);
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log(
      'PASS presence browser: arrival → check-in → party/note → extension → checkout → distant location error → offline expiry.',
    );
  }
} finally {
  await browser?.close();
  for (const id of users) unwrap(await admin.auth.admin.deleteUser(id));
  if (venueId) unwrap(await admin.from('venues').delete().eq('id', venueId));
  console.log('Temporary presence fixtures removed.');
}
