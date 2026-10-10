import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

// Requires the mobile web app on port 8081. A stored session and stubbed API
// responses stand in for a signed-in player, so this check needs no account and
// never reaches a backend. It covers what the screens send: each signed-in
// action is driven through the interface, and the request it makes is compared
// with what the database function takes. What the database does with that
// request is covered by the pgTAP tests, and the two ends together by the
// hosted browser checks.

if (existsSync('.env')) process.loadEnvFile('.env');
assert.ok(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  'Set EXPO_PUBLIC_SUPABASE_URL in .env. The stored session is keyed by its project reference.',
);
const projectRef = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL).hostname.split('.')[0];

const APP = 'http://localhost:8081';
const API = /\/(rest|auth|storage|functions)\/v1\//;
const TIMEZONE = 'America/Halifax';
const HERE = { latitude: 46.2382, longitude: -63.1311 };

const PLAYER = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'signed-in-check@example.test',
  aud: 'authenticated',
  role: 'authenticated',
};
const HOST_ID = '10000000-0000-4000-8000-000000000002';
const VENUE_ID = '40000000-0000-4000-8000-000000000001';
/** A session someone else organised that the player has joined. */
const JOINED = {
  session: '20000000-0000-4000-8000-000000000001',
  series: '30000000-0000-4000-8000-000000000001',
};
/** A session the player organised. */
const HOSTED = {
  session: '20000000-0000-4000-8000-000000000002',
  series: '30000000-0000-4000-8000-000000000002',
};

const VENUE = {
  venue_id: VENUE_ID,
  canonical_id: VENUE_ID,
  name: 'Signed-in Check Court',
  address_text: '1 Test Street',
  aliases: [],
  ...HERE,
  indoor_state: 'outdoor',
  verification_state: 'admin_verified',
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

const tomorrowEvening = new Date(Date.now() + 26 * 3_600_000);
const OCCURRENCE_DATE = tomorrowEvening.toISOString().slice(0, 10);
const session = ({ session: id, series }) => ({
  id,
  run_series_id: series,
  occurrence_date: OCCURRENCE_DATE,
  starts_at: tomorrowEvening.toISOString(),
  ends_at: new Date(tomorrowEvening.getTime() + 2 * 3_600_000).toISOString(),
  venue_id: VENUE_ID,
  sport_id: 1,
  region_id: 1,
  title: null,
  location_name: null,
  ...HERE,
  cancelled_at: null,
  created_at: new Date(Date.now() - 86_400_000).toISOString(),
});

/** What each table returns before any filter in the request is applied. */
const TABLES = {
  sports: [
    { id: 1, name: 'Basketball', slug: 'basketball', is_active: true, sort_order: 1 },
    { id: 2, name: 'Soccer', slug: 'soccer', is_active: true, sort_order: 2 },
  ],
  regions: [{ id: 1, timezone: TIMEZONE, is_published: true }],
  venues: [{ id: VENUE_ID, name: VENUE.name, address_text: VENUE.address_text, region_id: 1 }],
  profiles: [
    { id: PLAYER.id, display_name: 'Check Player' },
    { id: HOST_ID, display_name: 'Check Host' },
  ],
  profile_sports: [{ profile_id: PLAYER.id, sport_id: 1 }],
  run_series: [
    { id: JOINED.series, title: 'Joined check run', organizer_id: HOST_ID, timezone: TIMEZONE },
    { id: HOSTED.series, title: 'Hosted check run', organizer_id: PLAYER.id, timezone: TIMEZONE },
  ],
  run_sessions: [session(JOINED), session(HOSTED)],
  session_memberships: [
    { session_id: JOINED.session, user_id: PLAYER.id, attendance: 'going' },
    { session_id: HOSTED.session, user_id: PLAYER.id, attendance: 'going' },
  ],
};

/** Functions that only read. Anything else called through `/rpc/` is a write. */
const READS = {
  current_profile: () => ({
    id: PLAYER.id,
    display_name: 'Check Player',
    avatar_path: null,
    home_region_id: 1,
    onboarding_completed_at: new Date(Date.now() - 86_400_000).toISOString(),
    created_at: new Date(Date.now() - 172_800_000).toISOString(),
    updated_at: new Date(Date.now() - 86_400_000).toISOString(),
  }),
  nearby_venues: () => [VENUE],
  venue_details: (body) => (body?.p_venue_id === VENUE_ID ? [VENUE] : []),
  venue_activity: () => [],
  upcoming_runs: () => [],
  run_attendance: (body) =>
    [JOINED, HOSTED]
      .filter(({ series }) => body?.p_series_ids?.includes(series))
      .map(({ series, session: id }) => ({
        run_series_id: series,
        occurrence_date: OCCURRENCE_DATE,
        going_count: 4,
        maybe_count: 1,
        my_response: 'going',
        session_id: id,
      })),
};

/** Applies the `eq`, `in` and `is.null` filters PostgREST was sent to a table's rows. */
function rowsFor(url) {
  let rows = TABLES[url.pathname.split('/').at(-1)] ?? [];
  for (const [column, filter] of url.searchParams) {
    const known = (row) => column in row;
    if (filter.startsWith('eq.')) {
      rows = rows.filter((row) => !known(row) || String(row[column]) === filter.slice(3));
    } else if (filter.startsWith('in.(')) {
      const wanted = filter
        .slice(4, -1)
        .split(',')
        .map((value) => value.replace(/^"|"$/g, ''));
      rows = rows.filter((row) => !known(row) || wanted.includes(String(row[column])));
    }
  }
  return rows;
}

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

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: HERE,
    permissions: ['geolocation'],
    timezoneId: TIMEZONE,
  });
  /** Every write the app attempted, in order: the function or table, and what was sent. */
  const writes = [];
  await context.route(API, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const name = url.pathname.split('/').at(-1);
    const respond = (status, body) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.pathname.includes('/auth/v1/')) {
      if (name === 'logout') writes.push({ target: 'logout', sent: null });
      return respond(200, PLAYER);
    }
    if (url.pathname.includes('/rpc/')) {
      const sent = request.postDataJSON();
      if (READS[name]) return respond(200, READS[name](sent));
      writes.push({ target: name, sent });
      // Creating a session answers with its id, which the app then opens.
      return respond(200, name.startsWith('create_run') ? JOINED.session : null);
    }
    if (request.method() !== 'GET') {
      writes.push({ target: `${request.method()} ${name}`, sent: request.postDataJSON() });
      return respond(201, []);
    }
    const rows = rowsFor(url);
    const single = (request.headers().accept ?? '').includes('vnd.pgrst.object');
    return respond(200, single ? (rows[0] ?? null) : rows);
  });
  await context.addInitScript(
    ([key, user]) => {
      // Signing out removes the session; only a first visit should restore it.
      if (sessionStorage.getItem('signed-in-check')) return;
      sessionStorage.setItem('signed-in-check', 'stored');
      localStorage.setItem(
        key,
        JSON.stringify({
          access_token: 'signed-in-check-token',
          refresh_token: 'signed-in-check-refresh',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }),
      );
    },
    [`sb-${projectRef}-auth-token`, PLAYER],
  );

  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const button = (name) => page.getByRole('button', { name, exact: true });
  const confirm = (name) => page.getByRole('dialog').getByRole('button', { name, exact: true });
  /** Waits for the app to send `target`, and returns what it sent. */
  async function sentTo(target) {
    await expectSoon(
      () => writes.some((write) => write.target === target),
      `${target} was never sent`,
    );
    return writes.findLast((write) => write.target === target).sent;
  }
  async function expectSoon(condition, message) {
    const deadline = Date.now() + 8_000;
    while (!condition()) {
      assert.ok(Date.now() < deadline, message);
      await page.waitForTimeout(100);
    }
  }

  await check('check in: sends the venue, sport, position, length, party and note', async () => {
    await page.goto(`${APP}/venue/${VENUE_ID}`);
    await button('Check in here').click();
    await page.waitForURL(`**/check-in/${VENUE_ID}`);
    await button('More players').click();
    await page.getByRole('textbox', { name: 'Check-in note' }).fill('Bringing a ball.');
    await button('Check in now').click();
    const sent = await sentTo('create_check_in');
    assert.ok(!Number.isNaN(Date.parse(sent.p_observed_at)), 'p_observed_at is not a time');
    assert.deepEqual(
      { ...sent, p_observed_at: 'a time', p_accuracy: typeof sent.p_accuracy },
      {
        p_venue_id: VENUE_ID,
        p_sport_id: 1,
        p_lat: HERE.latitude,
        p_lon: HERE.longitude,
        p_accuracy: 'number',
        p_observed_at: 'a time',
        p_duration_minutes: 90,
        p_party_size: 2,
        p_note: 'Bringing a ball.',
      },
    );
  });

  await check('on my way: sends the venue, sport and arrival time', async () => {
    await page.goto(`${APP}/check-in/${VENUE_ID}`);
    await page.getByRole('tab', { name: 'On my way' }).click();
    await button("I'm on my way").click();
    assert.deepEqual(await sentTo('set_arrival_intent'), {
      p_venue_id: VENUE_ID,
      p_sport_id: 1,
      p_eta_minutes: 30,
    });
  });

  await check(
    'create session at a venue: the tapped day, start and length become dates and times',
    async () => {
      await page.goto(`${APP}/venue/${VENUE_ID}`);
      await page.getByRole('button', { name: /Create a session here/ }).click();
      await page.waitForURL('**/run/new**');
      await page.getByRole('textbox', { name: 'Session name' }).fill('Check run');
      await button('Basketball').click();
      // The strip starts at "Today"; the second named day is the day after tomorrow.
      await page
        .getByRole('button', { name: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2}$/ })
        .nth(1)
        .click();
      await button('7:00 PM').click();
      await button('1 hr 30 min').click();
      await button('4 weeks').click();
      await button('Create session and open chat').click();
      const dayAfterTomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(
        Date.now() + 2 * 86_400_000,
      );
      assert.deepEqual(await sentTo('create_run'), {
        p_sport_id: 1,
        p_starts_on: dayAfterTomorrow,
        p_start_time: '19:00',
        p_end_time: '20:30',
        p_weeks: 4,
        p_title: 'Check run',
        p_venue_id: VENUE_ID,
      });
      await page.waitForURL(`**/session/${JOINED.session}`);
    },
  );

  await check('create session at a pin: sends the spot, its name and its time zone', async () => {
    await page.goto(`${APP}/run/new`);
    await page.getByRole('textbox', { name: 'Session name' }).fill('Check pin run');
    await button('Soccer').click();
    await button('6:30 PM').click();
    await button('Use my location').click();
    await page.getByRole('textbox', { name: 'Meeting spot name' }).fill('East side of the park');
    await button('Create session and open chat').click();
    const sent = await sentTo('create_run_at_pin');
    assert.match(sent.p_starts_on, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(
      { ...sent, p_starts_on: 'a date' },
      {
        p_sport_id: 2,
        p_starts_on: 'a date',
        p_start_time: '18:30',
        p_end_time: '19:30',
        p_weeks: 1,
        p_title: 'Check pin run',
        p_lat: HERE.latitude,
        p_lon: HERE.longitude,
        p_location_name: 'East side of the park',
        p_timezone: TIMEZONE,
      },
    );
  });

  await check('session: changing the answer sends the series, date and answer', async () => {
    await page.goto(`${APP}/session/${JOINED.session}`);
    await button('Maybe').click();
    assert.deepEqual(await sentTo('set_run_attendance'), {
      p_run_series_id: JOINED.series,
      p_occurrence_date: OCCURRENCE_DATE,
      p_attendance: 'maybe',
    });
  });

  await check('session chat: a message is stored for this session and player', async () => {
    await page.goto(`${APP}/session/${JOINED.session}`);
    await page.getByRole('tab', { name: 'Chat' }).click();
    await page.getByRole('textbox', { name: 'Message the session' }).fill('See you at the court.');
    await button('Send').click();
    assert.deepEqual(await sentTo('POST session_messages'), {
      session_id: JOINED.session,
      user_id: PLAYER.id,
      body: 'See you at the court.',
    });
  });

  await check('session: leaving asks first, then names the session', async () => {
    await page.goto(`${APP}/session/${JOINED.session}`);
    await page.getByRole('button', { name: /Leave session/ }).click();
    await page.getByText('Leave this session?', { exact: true }).waitFor();
    assert.ok(!writes.some((write) => write.target === 'leave_run_session'), 'left without asking');
    await confirm('Leave session').click();
    assert.deepEqual(await sentTo('leave_run_session'), { p_session_id: JOINED.session });
  });

  await check('session: the organiser cancelling asks first, then names the session', async () => {
    await page.goto(`${APP}/session/${HOSTED.session}`);
    await page.getByRole('button', { name: /Cancel session/ }).click();
    await page.getByText('Cancel this session?', { exact: true }).waitFor();
    assert.ok(
      !writes.some((write) => write.target === 'cancel_run_session'),
      'cancelled without asking',
    );
    await confirm('Cancel session').click();
    assert.deepEqual(await sentTo('cancel_run_session'), { p_session_id: HOSTED.session });
  });

  await check('profile: saving sends the name and the chosen sports', async () => {
    await page.goto(`${APP}/profile`);
    await button('Edit').click();
    await page.getByRole('textbox', { name: 'Display name' }).fill('Check Organizer');
    await button('Soccer').click();
    await button('Save profile').click();
    const sent = await sentTo('update_own_profile');
    assert.deepEqual(
      { ...sent, p_sport_ids: [...sent.p_sport_ids].sort() },
      { p_display_name: 'Check Organizer', p_sport_ids: [1, 2], p_complete_onboarding: true },
    );
  });

  await check('profile: signing out ends the session and offers sign-in', async () => {
    await page.goto(`${APP}/profile`);
    await page.getByRole('button', { name: /Sign out/ }).click();
    await sentTo('logout');
    await button('Sign in or create account').waitFor();
  });

  await check('no screen threw an error', async () => {
    assert.deepEqual(pageErrors, []);
  });
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(`\nFAIL: ${failures.length} signed-in check(s) failed.`);
  process.exit(1);
}
console.log('\nPASS: each signed-in action sends the request its database function takes.');
