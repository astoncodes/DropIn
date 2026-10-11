# TODO

Open work only. Anything listed here is genuinely unbuilt or unverified — if it
is done, delete the entry rather than leaving a ticked box behind.

Entries are grouped by what the work needs, so a group can be handed to whoever
has it: a phone, access to the hosted project, an account or a decision, or
only the code.

## Needs a phone

The redesign was reviewed in the web builds only. Start from
`npx expo prebuild --clean` in `apps/mobile`: the icon, the splash screen and
the two removed native modules (`expo-blur`, `expo-glass-effect`) reach a native
project no other way. The first two parts are assigned in issue #14.

### The redesign on a device

On iOS and on Android:

- [ ] **Icon and launch.** The icon on the home screen; on Android also the
      round mask and a themed icon. The splash screen is white with the wordmark
      and gives way to the first screen without a change of colour. On
      Android 12 or later the wordmark is not clipped by the splash circle.
- [ ] **Typeface.** Titles, figures and buttons are condensed, not the system
      font, on a cold start with and without a connection. The font loads with
      `expo-font` before the splash screen hides (`apps/mobile/app/_layout.tsx`);
      if it cannot load, the app still opens in the system font.
- [ ] **Live map.** Venue pins are solid ink with a white glyph, session pins
      are outlined, and a live count is a green badge. The results sheet drags.
      The filter chips and the add button clear the notch.
- [ ] **Venue.** The row of figures fits on one line. "Check in here" and "I'm
      on my way" stay pinned above the home indicator.
- [ ] **Check in.** The note field is not hidden by the keyboard. A check-in
      more than 250 metres from the venue is refused with the database's
      message.
- [ ] **Create a session.** The day strip and the start-time strip scroll, and
      the start strip opens at the selected time. The pin drags. The button is
      reachable with the keyboard open.
- [ ] **Session.** The message field sits above the keyboard. Going and Maybe
      stay pinned.
- [ ] **Largest text size and Reduce Motion** on the screens above.

### Sign-in on a device

Native configuration has assertions in
`apps/mobile/tests/node/native-config.test.ts`. Device authentication still needs
manual verification.

- [ ] Confirm `com.playdropin.app` is the identifier registered in the Apple
      Developer portal and as the Google iOS OAuth client. The Apple setup
      checklist in issue #3 named `com.dropin.app`. If the registered one
      differs, change `APP_IDENTIFIER` in `app.config.ts` and re-run
      `npx expo prebuild --clean` from `apps/mobile`.
- [ ] Sign in with Apple on a device build: new account, returning user,
      cancellation, sign-out, session persistence.
- [ ] Same for Google on iOS and Android.
- [ ] Confirm email magic links still work on both.

### Map package

- [ ] `@rnmapbox/maps` 10.3.7 is available within the declared range. Take it
      together with a native build that can be run, not as a lockfile-only
      change.

## Needs access to the hosted project

The Supabase access token (`SUPABASE_ACCESS_TOKEN`, see `.env.example`) or the
dashboard. The hosted scripts and the moderation check are assigned in
issue #14.

### Hosted scripts

None has been run since the redesign. They create temporary accounts in the
project `.env` points at and remove them when they finish. With the app on
port 8081 and the admin website on port 5173:

```bash
npm run test:supabase -- --project-ref=YOUR_PROJECT_REF
npm run test:browser:supabase -- --project-ref=YOUR_PROJECT_REF
npm run test:presence -- --project-ref=YOUR_PROJECT_REF --browser
npm run test:browser:venues -- --project-ref=YOUR_PROJECT_REF
node scripts/tests/account-deletion.mjs --project-ref=YOUR_PROJECT_REF
```

- [ ] All five pass. The four that drive a browser were brought up to date by
      reading the screens and by driving the same steps against stubbed
      responses (`npm run test:browser:signed-in`), so the first run against a
      hosted project may still find a label that differs.

### Moderation with real accounts

`20260926120000_content_moderation.sql` is applied to the test and app projects
(`npm run db:test` passes; `npm run db:types` is unchanged). No script covers
this end to end.

- [ ] Report, block and remove content with real accounts, including deleting
      a removed post's files from Storage.

### Database tests in CI

- [ ] The repository has no `database-tests` environment yet, and creating one
      needs admin rights on it. Add `SUPABASE_TEST_PROJECT_REF`,
      `SUPABASE_TEST_DB_URL` and `SUPABASE_ACCESS_TOKEN` to it as secrets, and
      set its `SUPABASE_PROJECT_REF` variable to the app project for isolation
      checks. Run `.github/workflows/database.yml` manually to verify the setup.
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

### Sign-in on the web

- [ ] Google in the web build: new account, returning user, cancellation,
      sign-out, session persistence. It takes the `signInWithOAuth` redirect in
      `google-sign-in.web.ts` rather than the native SDK, so it depends on the
      provider settings in Supabase.

### Venue data

The repository seeds four indoor venues; two support active sport filters. It
seeds no outdoor courts or parks. On 2026-10-11 the live project returned seven
venues around Charlottetown: one outdoor, none verified.

- [ ] Decide whether to revive automated OSM import or to keep curating by hand.
      No importer or staging tables exist in this checkout.
- [ ] Either way, get a real Charlottetown venue list published. Nothing about
      the core loop can be validated at the current scale.

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
