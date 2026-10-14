# TODO

Open work only. Anything listed here is genuinely unbuilt or unverified — if it
is done, delete the entry rather than leaving a ticked box behind.

Entries are grouped by what the work needs, so a group can be handed to whoever
has it: a phone, access to the hosted project, an account or a decision, or
only the code.

## Needs a phone

The redesign, the icon and splash screen, and Apple and Google sign-in were
checked in iOS and Android builds in issue #14. Run
`npx expo prebuild --clean` in `apps/mobile` after any change to
`app.config.ts`, the icon or a native package; a native project picks those up
no other way.

### Sign-in on a device

- [ ] Confirm email sign-in links open the app and sign in, on iOS and on
      Android. Assigned in issue #14.

### Native package updates

Both need a native build that can be run, so they are not lockfile-only
changes. Assigned in issue #15.

- [ ] `@rnmapbox/maps` 10.3.7 is available within the declared range.
- [ ] Six Expo packages have newer SDK 57 patch releases, so `npx expo-doctor`
      fails its version check: `expo`, `expo-crypto`, `expo-dev-client`,
      `expo-location`, `expo-router` and `expo-splash-screen`. Align them with
      `npx expo install --check`.

## Needs access to the hosted project

### Database tests in CI

The `database-tests` environment exists in the GitHub repository and holds the
two project references. The repository belongs to a personal account, so only
its owner can add the rest. Assigned in issue #16.

- [ ] Add two secrets to that environment: `SUPABASE_TEST_DB_URL` (the test
      connection URL in the root `.env`) and `SUPABASE_ACCESS_TOKEN` (a personal
      access token, which starts with `sbp_`; a project's secret key is refused).
      Then run `.github/workflows/database.yml` by hand to verify the setup.
- [ ] Once that workflow passes reliably, move it off `workflow_dispatch` so it
      guards pull requests.

## Needs an account, a setting or a decision

### Keep the hosted projects running

Free-plan Supabase projects pause after a week without activity. The app
project and the test project were both found paused on 2026-10-09 and restored
the next day. While they are paused the apps have no backend and
`npm run db:test` cannot connect.

- [ ] Decide how to stop this recurring before players depend on the app: the
      Pro plan, or a scheduled request that keeps each project active.

### Store release

Account and configuration work is listed step by step in
[docs/release.md](docs/release.md). Assigned in issue #17. The Apple Developer
account is active, and the EAS project is linked under the `tomiwaadewumi` Expo
account.

- [ ] Google Play Console account; start the closed test early if it is a new
      personal one.
- [ ] EAS production environment variables, custom SMTP, provider settings,
      the Android OAuth client with signing-key SHA-1s, and a published Google
      consent screen.
- [ ] Host the web build so `/privacy`, `/terms`, `/support` and
      `/delete-account` are public; set `EXPO_PUBLIC_SITE_URL`.
- [ ] Confirm the choices in `features/legal/legal-config.ts`: minimum age 16,
      Prince Edward Island governing law, 24-hour report review, operator name.

### Sign-in on the web

"Continue with Google" in the web build is refused by Google with
`redirect_uri_mismatch`. It takes the `signInWithOAuth` redirect in
`google-sign-in.web.ts` rather than the native SDK, so it depends on settings
only the owner of the Supabase and Google Cloud projects can change. Assigned in
issue #18.

- [ ] In Supabase, under Authentication → Providers → Google, list the Web
      client ID first and the iOS one second, with the Web client's secret. The
      first ID is the one sent to Google, and it is the iOS one today.
- [ ] In Google Cloud, add the project's `/auth/v1/callback` address to the Web
      client's authorised redirect URIs. Google refuses the Web client without
      it.
- [ ] Then check a new account, a returning one, cancelling, signing out and
      staying signed in after a reload.

### Venue data

The repository seeds four indoor venues; two support active sport filters. It
seeds no outdoor courts or parks. On 2026-10-11 the live project returned seven
venues around Charlottetown: one outdoor, none verified.

- [ ] Decide whether to revive automated OSM import or to keep curating by hand.
      No importer or staging tables exist in this checkout.
- [ ] Either way, get a real Charlottetown venue list published. Nothing about
      the core loop can be validated at the current scale.
- [ ] Decide whether venues just across the border should be accepted. The
      Canada-wide regions are rectangles, so Seattle, Chicago, Detroit and
      Boston fall inside them and would be labelled as Canadian regions.

### Before launch

- [ ] **Error reporting.** Neither app sends failures anywhere; the admin
      website writes them to the browser console only. Choose a service.
- [ ] **Automatic filtering.** Reports and blocks act after content is posted.
      Decide whether names, titles and captions need a blocked-term check at
      write time.

## Needs only the code

### Moderation gaps

- [ ] **Sign in with Apple token revocation.** Apple asks apps to revoke a
      deleted account's Apple tokens through its REST API. `delete-account`
      does not; it needs the authorization code from a fresh Apple sign-in and
      the Sign in with Apple key as function secrets.
- [ ] **Check-in notes are not reportable.** They are visible to signed-in
      players while a check-in is active, but `report_target` has no kind for
      them.

### Client gaps

- [ ] **Venue search sends a request on every keystroke** when choosing an
      existing venue for a session (the `session-venues` query in
      `new-run-screen.tsx`). Search on submit, as place search does, or debounce.
- [ ] **The Chats list downloads every message of every joined session** to
      find each session's latest one (`useJoinedSessions`). The API caps a
      response at its row limit, so past that some chats lose their preview.
      Read one latest message per session instead, through a database function
      or an embedded `limit(1)`, and verify it against the hosted API.
- [ ] **The map/list toggle covers the first row in list view.** On the live
      screen at phone width, the floating map button sits over the first
      venue's figure ("12 HERE NOW" reads as a cut-off number). Move the toggle
      or start the list below it.
- [ ] **Avatars.** `profiles.avatar_path` is granted and returned by
      `venue_activity()`, but nothing uploads or displays a photo, so players
      appear as initials.

### Unreachable schema

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

### Collapse the repeated definitions in the baseline migration

`20260908010000_baseline.sql` preserves execution order verbatim, so
`upcoming_runs` is defined three times, `join_run_session` three times and
`handle_new_user` twice. Only the last of each is live. Every repeat is a
`create or replace` with an identical signature and return type, so a fresh
apply converges correctly — this is a readability problem, not a correctness
one, and the file header now says so.

- [ ] Keep only the final definition of each. Verify a fresh apply and run
      `npm run db:test` against the result so the rewrite cannot silently
      diverge from the live database.

### Dependencies

- [ ] `npm audit` reported 31 advisories on 2026-10-11 (20 high, 11 moderate,
      none critical). They need major upgrades (`react-native-reanimated`,
      `expo-router`) or have no fixed release (`node-forge`, `uuid`). All are
      build tooling or transitive packages. Re-check after the next Expo SDK
      upgrade.
