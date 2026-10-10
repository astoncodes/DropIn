# TODO

Open work only. Anything listed here is genuinely unbuilt or unverified — if it
is done, delete the entry rather than leaving a ticked box behind.

## Keep the hosted projects running

Free-plan Supabase projects pause after a week without activity. The app
project and the test project were both found paused on 2026-10-09. While they
are paused the apps have no backend and `npm run db:test` cannot connect.

- [ ] Restore both projects from the Supabase dashboard, then run
      `npm run db:test` to confirm the test project still matches the
      migrations.
- [ ] Decide how to stop this recurring before players depend on the app: the
      Pro plan, or a scheduled request that keeps each project active.

## Verify moderation with real accounts

`20260926120000_content_moderation.sql` is applied to the test and app projects
(`npm run db:test` passes; `npm run db:types` is unchanged).

- [ ] Report, block and remove content end to end with real accounts,
      including deleting a removed post's files from Storage.

## Store release

Account and configuration work is listed step by step in
[docs/release.md](docs/release.md).

- [ ] Apple Developer Program and Google Play Console accounts; start the Play
      closed test early if the account is a new personal one.
- [ ] `eas init`, then commit `owner` and `extra.eas.projectId` in `app.config.ts`.
- [ ] EAS production environment variables, custom SMTP, provider settings,
      the Android OAuth client with signing-key SHA-1s, and a published Google
      consent screen.
- [ ] Host the web build so `/privacy`, `/terms`, `/support` and
      `/delete-account` are public; set `EXPO_PUBLIC_SITE_URL`.
- [ ] Confirm the choices in `features/legal/legal-config.ts`: minimum age 16,
      Prince Edward Island governing law, 24-hour report review, operator name.

## Moderation gaps

- [ ] **Sign in with Apple token revocation.** Apple asks apps to revoke a
      deleted account's Apple tokens through its REST API. `delete-account`
      does not; it needs the authorization code from a fresh Apple sign-in and
      the Sign in with Apple key as function secrets.
- [ ] **Check-in notes are not reportable.** They are visible to signed-in
      players while a check-in is active, but `report_target` has no kind for
      them.
- [ ] **No automatic filtering.** Reports and blocks act after content is
      posted. Decide whether names, titles and captions need a blocked-term
      check at write time.

## Client gaps

- [ ] **Venue search sends a request on every keystroke** when choosing an
      existing venue for a session (the `session-venues` query in
      `new-run-screen.tsx`). Search on submit, as place search does, or debounce.
- [ ] **The Chats list downloads every message of every joined session** to
      find each session's latest one (`useJoinedSessions`). The API caps a
      response at its row limit, so past that some chats lose their preview.
      Read one latest message per session instead, through a database function
      or an embedded `limit(1)`, and verify it against the hosted API.
- [ ] **No error reporting.** Neither app sends failures anywhere; the admin
      website writes them to the browser console only. Choose a service before
      launch.
- [ ] **Avatars.** `profiles.avatar_path` is granted and returned by
      `venue_activity()`, but nothing uploads or displays a photo, so players
      appear as initials.

## After the redesign

- [ ] **See it on a phone.** The redesign was reviewed in the web build at phone
      and desktop widths. The display typeface is loaded at startup with
      `expo-font`; check it, the map pins and the pinned action bars in iOS and
      Android builds.
- [ ] **Update the hosted browser scripts.** `browser-social.mjs`,
      `browser-venue-review.mjs`, `live-presence.mjs --browser` and
      `account-deletion.mjs` drive screens by label and cannot run without a
      Supabase access token, so they were already behind the interface ("Edit
      profile", "Yes, leave session") and are further behind now: session
      creation uses a day strip and time chips instead of typed fields.
- [ ] **App icon and splash screen** still use the earlier mark. Redraw them to
      match the wordmark.

## Dependencies

- [ ] `npm audit` still reports advisories that need major upgrades
      (`react-native-reanimated`, `expo-router`) or have no fixed release
      (`node-forge`, `uuid`). All are build tooling or transitive packages.
      Re-check after the next Expo SDK upgrade.
- [ ] `@rnmapbox/maps` 10.3.7 is available within the declared range. Take it
      together with a native build that can be run, not as a lockfile-only
      change.

## Run database tests in CI

- [ ] Add `SUPABASE_TEST_PROJECT_REF`, `SUPABASE_TEST_DB_URL`, and `SUPABASE_ACCESS_TOKEN` to a GitHub
      environment named `database-tests`, and set its `SUPABASE_PROJECT_REF`
      variable to the app project for isolation checks. Run
      `.github/workflows/database.yml` manually to verify the setup.
- [ ] Once it passes reliably, move that workflow off `workflow_dispatch` so it
      guards pull requests.

## Unreachable schema

Each of these is fully modelled, read by an RPC, and rendered by the app, but has
no write path. They are not placeholders — they are finished halves.

- [ ] **Venue pulse.** `create_check_in()` takes no pulse argument, so
      `check_ins.pulse` is always null. Add the parameter and a picker.
- [ ] **Venue conditions.** No insert policy, grant or RPC. Adding one must also
      fix `venue_conditions_one_per_kind_per_reporter`, whose predicate
      `expires_at > '-infinity'` matches every row — it currently means "one
      report per kind per reporter ever", not "one live report".
- [ ] **Venue merging.** `merge_venues()` does not exist, so nothing writes
      `venues.merged_into_venue_id` and the `merged` status is unreachable. Must
      move references rather than delete, preserve the loser's name as an alias,
      and reject cycles and chains.
- [ ] **Series renewal.** A series stops appearing once `valid_until` passes and
      there is no RPC to extend it, so the organiser's only route is to create a
      new series and lose the history.

## Collapse the repeated definitions in the baseline migration

`20260908010000_baseline.sql` preserves execution order verbatim, so
`upcoming_runs` is defined three times, `join_run_session` three times and
`handle_new_user` twice. Only the last of each is live. Every repeat is a
`create or replace` with an identical signature and return type, so a fresh
apply converges correctly — this is a readability problem, not a correctness
one, and the file header now says so.

- [ ] Keep only the final definition of each. Verify a fresh apply and run
      `npm run db:test` against the result so the rewrite cannot silently
      diverge from the live database.

## There is almost no venue data

The repository seeds four indoor venues; two support active sport filters.
It seeds no outdoor courts or parks. Hosted data may differ.

- [ ] Decide whether to revive automated OSM import or to keep curating by hand.
      No importer or staging tables exist in this checkout.
- [ ] Either way, get a real Charlottetown venue list published. Nothing about
      the core loop can be validated at the current scale.

## Verify social sign-in on device

Native configuration has assertions in
`apps/mobile/tests/node/native-config.test.ts`. Device authentication still needs
manual verification.

- [ ] Confirm `com.playdropin.app` is the identifier registered in the Apple
      Developer portal and as the Google iOS OAuth client. If it is not, change
      `APP_IDENTIFIER` in `app.config.ts` and re-run
      `npx expo prebuild --clean` from `apps/mobile`.
- [ ] Sign in with Apple on a device build: new account, returning user,
      cancellation, sign-out, session persistence.
- [ ] Same for Google on iOS and Android.
- [ ] Same for Google on web, which takes the `signInWithOAuth` redirect in
      `google-sign-in.web.ts` rather than the native SDK.
- [ ] Confirm email magic links still work on both.
