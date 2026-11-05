import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createClient } from '@supabase/supabase-js';
import ts from 'typescript';
import { adminKey, hostedProject } from '../supabase-project.mjs';

// Fixture writes require an explicitly selected hosted project matching .env.
const hostedRef = process.argv.find((arg) => arg.startsWith('--project-ref='))?.split('=')[1];
if (!hostedRef)
  throw new Error(
    'Pass --project-ref=YOUR_TEST_PROJECT_REF explicitly; the test creates and removes temporary fixtures.',
  );
const project = hostedProject();
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname, `${hostedRef}.supabase.co`);
assert.equal(project.ref, hostedRef, 'Selected project must match the configured app project.');
const serviceKey = await adminKey(project);
const config = {
  API_URL: url,
  ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  SERVICE_ROLE_KEY: serviceKey,
};
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options);
const anonymous = createClient(config.API_URL, config.ANON_KEY, options);
const users = [];
let objectPath;
let fixtureVenue;
function unwrap(result) {
  if (result.error) throw result.error;
  return result.data;
}
try {
  for (const [name, args] of [
    ['current_profile', {}],
    ['is_session_member', { p_session_id: '00000000-0000-0000-0000-000000000000' }],
    [
      'join_run_session',
      { p_run_series_id: '00000000-0000-0000-0000-000000000000', p_occurrence_date: '2026-09-13' },
    ],
  ]) {
    const result = await anonymous.rpc(name, args);
    assert.equal(result.error?.code, '42501', `${name} requires a signed-in API role`);
  }
  const clients = [];
  for (const role of ['member', 'outsider']) {
    const email = `social-${role}-${crypto.randomUUID()}@example.test`;
    const password = crypto.randomUUID();
    // Generate and redeem a signup token without sending a message to any inbox.
    const { user, properties } = unwrap(
      await admin.auth.admin.generateLink({ type: 'signup', email, password }),
    );
    users.push(user.id);
    const client = createClient(config.API_URL, config.ANON_KEY, options);
    unwrap(await client.auth.verifyOtp({ token_hash: properties.hashed_token, type: 'signup' }));
    unwrap(await client.auth.signInWithPassword({ email, password }));
    clients.push(client);
  }
  const [member, outsider] = clients;
  assert.ok(unwrap(await member.rpc('current_profile')));
  unwrap(
    await member.rpc('update_own_profile', {
      p_display_name: 'Integration player',
      p_sport_ids: [],
      p_complete_onboarding: true,
    }),
  );
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
  fixtureVenue = crypto.randomUUID();

  unwrap(
    await admin.from('venues').insert({
      id: fixtureVenue,
      region_id: region.id,
      name: 'Temporary integration test venue',
      location: `SRID=4326;POINT(${lon} ${lat})`,
    }),
  );
  unwrap(await admin.from('venue_sports').insert({ venue_id: fixtureVenue, sport_id: sport.id }));
  const newRunInput = {
    p_venue_id: fixtureVenue,
    p_sport_id: sport.id,
    p_starts_on: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    p_start_time: '19:00',
    p_end_time: '20:00',
    p_weeks: 4,
    p_title: 'Integration run',
  };
  assert.ok(
    (await anonymous.rpc('create_run', newRunInput)).error,
    'anonymous run creation denied',
  );
  assert.ok(
    (await member.rpc('create_run', { ...newRunInput, p_weeks: 13 })).error,
    'runs cannot exceed 12 weeks',
  );
  const venueSessionId = unwrap(await member.rpc('create_run', newRunInput));
  assert.ok(venueSessionId, 'existing venue sessions still work');
  const venuesBefore = unwrap(await anonymous.from('venues').select('id')).length;
  const candidatesBefore = unwrap(await member.from('venue_candidates').select('id')).length;
  const pinInput = {
    p_lat: 43.65,
    p_lon: -79.38,
    p_location_name: 'Temporary park meeting spot',
    p_sport_id: sport.id,
    p_starts_on: newRunInput.p_starts_on,
    p_start_time: '19:00',
    p_end_time: '20:00',
    p_weeks: 1,
    p_title: 'Spontaneous integration session',
    p_timezone: 'America/Toronto',
  };
  assert.ok(
    (await anonymous.rpc('create_run_at_pin', pinInput)).error,
    'pin sessions require authentication',
  );
  assert.ok(
    (await member.rpc('create_run_at_pin', { ...pinInput, p_lat: 91 })).error,
    'invalid coordinates are rejected',
  );
  const sessionId = unwrap(await member.rpc('create_run_at_pin', pinInput));
  assert.equal(
    unwrap(await anonymous.from('venues').select('id')).length,
    venuesBefore,
    'pin does not create a venue',
  );
  assert.equal(
    unwrap(await member.from('venue_candidates').select('id')).length,
    candidatesBefore,
    'pin bypasses the venue review queue',
  );
  const pinSession = unwrap(
    await member.from('run_sessions').select('*').eq('id', sessionId).single(),
  );
  assert.equal(pinSession.venue_id, null);
  assert.equal(pinSession.latitude, pinInput.p_lat);
  assert.equal(pinSession.longitude, pinInput.p_lon);
  const scheduled = unwrap(await anonymous.rpc('upcoming_runs', { p_days: 14 }));
  const listedPin = scheduled.find((run) => run.run_series_id === pinSession.run_series_id);
  assert.ok(listedPin, 'pin session is immediately discoverable');
  assert.equal(listedPin.venue_name, pinInput.p_location_name);
  assert.equal(listedPin.latitude, pinInput.p_lat);
  const membership = unwrap(
    await member
      .from('session_memberships')
      .select('role')
      .eq('session_id', sessionId)
      .eq('user_id', users[0])
      .single(),
  );
  assert.equal(membership.role, 'organizer');
  const createdSession = unwrap(
    await member.from('run_sessions').select('*').eq('id', sessionId).single(),
  );
  assert.equal(
    unwrap(
      await member.rpc('join_run_session', {
        p_run_series_id: createdSession.run_series_id,
        p_occurrence_date: createdSession.occurrence_date,
      }),
    ),
    sessionId,
    'rejoining returns the same session',
  );
  const message = `Integration message ${crypto.randomUUID()}`;
  unwrap(
    await member
      .from('session_messages')
      .insert({ session_id: sessionId, user_id: users[0], body: message }),
  );
  assert.equal(
    unwrap(await member.from('session_messages').select('body').eq('body', message)).length,
    1,
  );
  assert.equal(
    unwrap(await outsider.from('session_messages').select('body').eq('body', message)).length,
    0,
  );
  assert.ok(
    (
      await outsider
        .from('session_messages')
        .insert({ session_id: sessionId, user_id: users[1], body: 'Forbidden' })
    ).error,
  );

  // Exercise the real mobile publishing implementation with a real hosted API.
  const transpile = (path) =>
    ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText;
  const feedOrder = { exports: {} };
  vm.runInNewContext(transpile('apps/mobile/src/features/community/feed-order.ts'), feedOrder);
  const context = {
    exports: {},
    require: (name) => {
      if (name.endsWith('/supabase')) return { supabase: member };
      // The feed loads only for a signed-in player: the member, users[0].
      if (name.endsWith('/auth-context'))
        return { useSession: () => ({ session: { user: { id: users[0] } } }) };
      if (name === './feed-order') return feedOrder.exports;
      return { useQuery: (options) => options };
    },
    fetch,
    Date,
    Math,
    Number,
    Error,
    Promise,
  };
  vm.runInNewContext(transpile('apps/mobile/src/features/community/api.ts'), context);
  const photoArgs = {
    p_session_id: sessionId,
    p_lat: pinInput.p_lat,
    p_lon: pinInput.p_lon,
    p_accuracy: 10,
    p_observed_at: new Date().toISOString(),
  };
  unwrap(await member.rpc('check_session_photo_location', photoArgs));
  unwrap(
    await member.rpc('check_session_photo_location', {
      ...photoArgs,
      p_lat: pinInput.p_lat + 0.0044,
      p_accuracy: 100,
    }),
  );
  unwrap(
    await member.rpc('check_session_photo_location', {
      ...photoArgs,
      p_session_id: venueSessionId,
      p_lat: lat,
      p_lon: lon,
    }),
  );
  for (const override of [
    { p_lat: pinInput.p_lat + 0.01 }, // Over a kilometre away.
    { p_lat: pinInput.p_lat + 0.0046 }, // Just outside 500 metres.
    { p_accuracy: 101 },
    { p_accuracy: null },
    { p_lat: 91 },
    { p_observed_at: new Date(Date.now() - 180000).toISOString() },
    { p_observed_at: new Date(Date.now() + 60000).toISOString() },
  ]) {
    assert.ok(
      (
        await member.rpc('create_session_photo_post', {
          ...photoArgs,
          p_caption: 'Must fail',
          ...override,
        })
      ).error,
      'invalid or distant locations cannot create a post',
    );
  }
  assert.ok((await anonymous.rpc('check_session_photo_location', photoArgs)).error);
  assert.ok((await outsider.rpc('check_session_photo_location', photoArgs)).error);
  assert.ok(
    (
      await member
        .from('session_posts')
        .insert({ session_id: sessionId, author_id: users[0], caption: 'Bypass' })
    ).error,
    'direct post insertion cannot bypass proximity',
  );
  const caption = `Integration photo ${crypto.randomUUID()}`;
  const postId = await context.exports.publishSessionPost({
    sessionId,
    userId: users[0],
    caption,
    location: {
      latitude: pinInput.p_lat,
      longitude: pinInput.p_lon,
      accuracy: 10,
      observedAt: new Date().toISOString(),
    },
    asset: {
      uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      kind: 'image',
      mimeType: 'image/png',
      width: 1,
      height: 1,
    },
  });
  const media = unwrap(
    await member.from('session_media').select('*').eq('post_id', postId).single(),
  );
  objectPath = media.storage_path;
  assert.ok(objectPath.startsWith(users[0] + '/'));
  assert.equal(
    (await anonymous.from('session_posts').select('caption').eq('id', postId)).error?.code,
    '42501',
    'posts need sign-in',
  );
  assert.equal(
    unwrap(await outsider.from('session_posts').select('caption').eq('id', postId).single())
      .caption,
    caption,
    'any signed-in player can read a post, member or not',
  );
  const publicPins = await context.exports.usePublicSessionPins([sport.id]).queryFn();
  assert.ok(
    publicPins.some((pin) => pin.id === sessionId),
    'session pin is available to the map',
  );
  const overview = await context.exports.useSessionOverview(sessionId, users[0]).queryFn();
  assert.equal(overview.venueName, pinInput.p_location_name);
  const feed = await context.exports.useCommunityFeed().queryFn();
  assert.equal(feed.find((post) => post.id === postId).venueName, pinInput.p_location_name);
  const joined = await context.exports.useJoinedSessions(users[0]).queryFn();
  assert.equal(
    joined.find((session) => session.id === sessionId).venueName,
    pinInput.p_location_name,
  );
  const url = anonymous.storage.from('session-media').getPublicUrl(objectPath).data.publicUrl;
  assert.notEqual((await fetch(url)).status, 200, 'photos are not public');
  assert.ok(
    (await anonymous.storage.from('session-media').createSignedUrl(objectPath, 60)).error,
    'a visitor cannot get a photo link',
  );
  const { signedUrl } = unwrap(
    await outsider.storage.from('session-media').createSignedUrl(objectPath, 60),
  );
  assert.equal((await fetch(signedUrl)).status, 200, 'a signed-in player opens it by signed link');
  for (const verification of [null, new Date(Date.now() - 16 * 60000).toISOString()]) {
    unwrap(
      await admin
        .from('session_posts')
        .update({ location_verified_at: verification })
        .eq('id', postId),
    );
    const deniedPath = `${users[0]}/${postId}/denied.png`;
    assert.ok(
      (
        await member.storage
          .from('session-media')
          .upload(deniedPath, new Uint8Array([1]), { contentType: 'image/png' })
      ).error,
      'unverified or expired posts cannot receive uploads',
    );
    assert.ok(
      (
        await member.from('session_media').insert({
          post_id: postId,
          uploader_id: users[0],
          kind: 'image',
          storage_path: deniedPath,
        })
      ).error,
      'unverified or expired posts cannot receive media metadata',
    );
  }
  const failedCaption = `Failed integration upload ${crypto.randomUUID()}`;
  await assert.rejects(
    context.exports.publishSessionPost({
      sessionId,
      userId: users[0],
      caption: failedCaption,
      location: {
        latitude: pinInput.p_lat,
        longitude: pinInput.p_lon,
        accuracy: 10,
        observedAt: new Date().toISOString(),
      },
      asset: {
        uri: 'data:image/png;base64,aGVsbG8=',
        kind: 'image',
        mimeType: 'image/png',
        width: -1,
      },
    }),
  );
  assert.equal(
    unwrap(await member.from('session_posts').select('id').eq('caption', failedCaption)).length,
    0,
    'metadata failure removes the partially published post',
  );
  const folders = unwrap(await member.storage.from('session-media').list(users[0]));
  let remainingCount = 0;
  for (const folder of folders) {
    remainingCount += unwrap(
      await member.storage.from('session-media').list(`${users[0]}/${folder.name}`),
    ).length;
  }
  assert.equal(remainingCount, 1, 'metadata failure removes the uploaded object');
  unwrap(await member.storage.from('session-media').remove([objectPath]));
  assert.equal(
    unwrap(await member.storage.from('session-media').list(`${users[0]}/${postId}`)).length,
    0,
  );
  objectPath = undefined;
  // Occurrence controls: authenticated ownership, isolated recurrence, and durable history.
  const editInput = {
    p_session_id: sessionId,
    p_title: 'Updated meeting',
    p_date: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10),
    p_start_time: '17:00',
    p_end_time: '18:00',
    p_timezone: 'America/Toronto',
    p_location_name: 'Updated park entrance',
    p_lat: 43.66,
    p_lon: -79.39,
  };
  for (const client of [anonymous, outsider]) {
    assert.ok((await client.rpc('edit_run_session', editInput)).error, 'only organizer can edit');
    assert.ok(
      (await client.rpc('cancel_run_session', { p_session_id: sessionId })).error,
      'only organizer can cancel',
    );
  }
  assert.ok((await anonymous.rpc('leave_run_session', { p_session_id: sessionId })).error);
  assert.ok(
    (await member.rpc('leave_run_session', { p_session_id: sessionId })).error,
    'active organizer cannot abandon session',
  );
  assert.ok((await member.rpc('edit_run_session', { ...editInput, p_end_time: '16:00' })).error);
  assert.ok((await member.rpc('edit_run_session', { ...editInput, p_lat: 91 })).error);
  assert.ok(
    (await member.rpc('edit_run_session', { ...editInput, p_timezone: 'Fake/Zone' })).error,
  );
  assert.ok((await member.rpc('edit_run_session', { ...editInput, p_date: '2020-01-01' })).error);
  unwrap(await member.rpc('edit_run_session', editInput));
  const moved = await context.exports.useSessionOverview(sessionId, users[0]).queryFn();
  assert.equal(moved.title, editInput.p_title);
  assert.equal(moved.venueName, editInput.p_location_name);
  assert.equal(moved.isOrganizer, true);
  const movedListings = unwrap(
    await anonymous.rpc('upcoming_runs', { p_from: moved.starts_at, p_days: 2 }),
  );
  const movedListing = movedListings.find(
    (item) => item.run_series_id === pinSession.run_series_id,
  );
  assert.ok(movedListing, 'moved occurrence discoverable beyond original recurrence window');
  assert.equal(movedListing.title, editInput.p_title);
  assert.equal(movedListing.latitude, editInput.p_lat);
  assert.equal(movedListing.starts_at, moved.starts_at);
  const joinInput = {
    p_run_series_id: pinSession.run_series_id,
    p_occurrence_date: pinSession.occurrence_date,
  };
  assert.equal(
    unwrap(await outsider.rpc('join_run_session', joinInput)),
    sessionId,
    'join moved session retains identity',
  );
  assert.equal(
    unwrap(await member.from('run_sessions').select('title').eq('id', sessionId).single()).title,
    editInput.p_title,
    'join does not reset edits',
  );
  assert.ok((await outsider.rpc('edit_run_session', editInput)).error, 'member is not organizer');
  assert.ok((await outsider.rpc('cancel_run_session', { p_session_id: sessionId })).error);
  assert.equal(
    unwrap(await outsider.from('session_messages').select('id').eq('body', message)).length,
    1,
  );
  unwrap(await outsider.rpc('leave_run_session', { p_session_id: sessionId }));
  unwrap(await outsider.rpc('leave_run_session', { p_session_id: sessionId }));
  assert.equal(
    unwrap(await outsider.from('session_messages').select('id').eq('body', message)).length,
    0,
    'leaving revokes chat reads',
  );
  assert.ok(
    (
      await outsider
        .from('session_messages')
        .insert({ session_id: sessionId, user_id: users[1], body: 'After leaving' })
    ).error,
  );
  assert.ok(
    (
      await outsider
        .from('session_posts')
        .insert({ session_id: sessionId, author_id: users[1], caption: 'After leaving' })
    ).error,
  );
  assert.equal(
    unwrap(await member.from('session_memberships').select('user_id').eq('session_id', sessionId))
      .length,
    1,
    'leaving removes only caller',
  );
  unwrap(await outsider.rpc('join_run_session', joinInput));
  // Move back into map horizon before cancellation, so the map assertion tests cancellation itself.
  unwrap(await member.rpc('edit_run_session', { ...editInput, p_date: pinInput.p_starts_on }));
  assert.ok(
    (await context.exports.usePublicSessionPins([sport.id]).queryFn()).some(
      (pin) => pin.id === sessionId,
    ),
  );
  unwrap(await member.rpc('cancel_run_session', { p_session_id: sessionId }));
  unwrap(await member.rpc('cancel_run_session', { p_session_id: sessionId }));
  assert.ok(
    (await member.rpc('edit_run_session', editInput)).error,
    'cancelled session cannot be edited',
  );
  assert.ok(
    (await outsider.rpc('join_run_session', joinInput)).error,
    'cancelled session cannot be rejoined',
  );
  assert.equal(
    unwrap(await anonymous.rpc('upcoming_runs', { p_days: 30 })).filter(
      (item) => item.run_series_id === pinSession.run_series_id,
    ).length,
    0,
  );
  assert.equal(
    (await context.exports.usePublicSessionPins([sport.id]).queryFn()).some(
      (pin) => pin.id === sessionId,
    ),
    false,
    'cancelled pin removed from map',
  );
  assert.ok((await context.exports.useSessionOverview(sessionId, users[0]).queryFn()).cancelled_at);
  assert.equal(
    unwrap(await outsider.from('session_messages').select('id').eq('body', message)).length,
    1,
    'cancelled chat history retained for members',
  );
  assert.ok(
    (
      await member
        .from('session_messages')
        .insert({ session_id: sessionId, user_id: users[0], body: 'After cancellation' })
    ).error,
  );
  assert.ok(
    (
      await member
        .from('session_posts')
        .insert({ session_id: sessionId, author_id: users[0], caption: 'After cancellation' })
    ).error,
  );
  assert.ok(
    (
      await member.storage
        .from('session-media')
        .upload(`${users[0]}/${postId}/cancelled.png`, new Uint8Array([1]), {
          contentType: 'image/png',
        })
    ).error,
    'cancelled sessions reject media uploads',
  );
  unwrap(await member.rpc('leave_run_session', { p_session_id: sessionId }));
  assert.equal(
    unwrap(await member.from('session_messages').select('id').eq('body', message)).length,
    0,
  );
  const recurring = unwrap(
    await member.from('run_sessions').select('*').eq('id', venueSessionId).single(),
  );
  const weeksBefore = unwrap(await anonymous.rpc('upcoming_runs', { p_days: 30 })).filter(
    (item) => item.run_series_id === recurring.run_series_id,
  );
  assert.equal(weeksBefore.length, 4);
  unwrap(
    await member.rpc('edit_run_session', {
      ...editInput,
      p_session_id: venueSessionId,
      p_date: newRunInput.p_starts_on,
    }),
  );
  const weeksEdited = unwrap(await anonymous.rpc('upcoming_runs', { p_days: 30 })).filter(
    (item) => item.run_series_id === recurring.run_series_id,
  );
  assert.equal(
    weeksEdited.filter((item) => item.title === editInput.p_title).length,
    1,
    'edit applies to one week only',
  );
  unwrap(await member.rpc('cancel_run_session', { p_session_id: venueSessionId }));
  const weeksAfter = unwrap(await anonymous.rpc('upcoming_runs', { p_days: 30 })).filter(
    (item) => item.run_series_id === recurring.run_series_id,
  );
  assert.equal(weeksAfter.length, 3, 'cancel applies to one week only');
  assert.ok(weeksAfter.every((item) => item.title === newRunInput.p_title));
  console.log(
    'PASS: signup token verification, account sign-in, profile update, venue/pin session creation without moderation, discovery, chat privacy, proximity enforcement (venue/pin, boundary, stale/inaccurate GPS, direct-insert and expired-upload rejection), mobile image publishing, signed-in feed and signed-link photo access, storage cleanup, organizer editing/cancellation, participant leave/rejoin, and recurrence isolation.',
  );
} finally {
  if (objectPath) unwrap(await admin.storage.from('session-media').remove([objectPath]));
  for (const id of users) unwrap(await admin.auth.admin.deleteUser(id));
  if (fixtureVenue) {
    unwrap(await admin.from('venues').delete().eq('id', fixtureVenue));
  }
}
