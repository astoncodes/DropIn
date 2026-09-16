# TODO

Open work only. Anything listed here is genuinely unbuilt or unverified — if it
is done, delete the entry rather than leaving a ticked box behind.

Product decisions belong in `docs/product-rules.md`, not here.

## Database tests have no target

The pgTAP suite is the only layer with no executed coverage: 14 files planning
177 assertions across 25 tables, 43 RLS policies and 38 RPCs. `npm run db:test`
refuses to run without an isolated project, and it is right to — it must never
point at the app database.

- [ ] Create a second, free Supabase project for tests.
- [ ] Apply `supabase/migrations/` and `supabase/tests/fixtures/seed.sql` to it.
- [ ] Set `SUPABASE_TEST_PROJECT_REF` and `SUPABASE_TEST_DB_URL` in `.env`. Use
      the IPv4 pooler connection string; the direct `db.<ref>.supabase.co` host
      is IPv6-only and unreachable from some networks.
- [ ] Run `npm run db:test` and fix whatever the 177 assertions surface.
- [ ] Add the same two values plus `SUPABASE_ACCESS_TOKEN` to a GitHub
      environment named `database-tests`. It does not exist yet, so
      `.github/workflows/database.yml` has never run.
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

- [ ] Keep only the final definition of each. **Do not attempt this until
      `npm run db:test` runs**: rewriting an applied migration without being
      able to execute the pgTAP suite against the result is how a fresh deploy
      silently diverges from the live database.

## Bound `upcoming_runs()` server-side

`runWindowDays()` clamps the window in the mobile client, which is the only
caller today. The rule belongs in the database as well — `p_days` is currently
uncapped, so any caller can ask it to materialise occurrences across an
arbitrary range.

- [ ] Cap `p_days` inside `upcoming_runs()` at `RUN_SERIES.maxWeeksValid * 7`.
- [ ] Add a pgTAP assertion. Blocked on the test project above.

## There is almost no venue data

Four hand-written indoor venues, of which two are reachable by any sport filter.
No outdoor courts and no parks, which is the premise of the product.

- [ ] Decide whether to revive automated OSM import or to keep curating by hand.
      The Python importer was removed in `b63c492` and the staging tables it
      needed were never created.
- [ ] Either way, get a real Charlottetown venue list published. Nothing about
      the core loop can be validated at the current scale.

## Verify social sign-in on device

The native configuration was regenerated and is asserted by
`apps/mobile/tests/node/native-config.test.ts`, but no build has been run
against a real Apple or Google account since.

- [ ] Confirm `com.playdropin.app` is the identifier registered in the Apple
      Developer portal and as the Google iOS OAuth client. If it is not, change
      `APP_IDENTIFIER` in `app.config.ts` and re-run
      `npx expo prebuild --clean`.
- [ ] Sign in with Apple on a device build: new account, returning user,
      cancellation, sign-out, session persistence.
- [ ] Same for Google on iOS and Android.
- [ ] Same for Google on web, which takes the `signInWithOAuth` redirect in
      `google-sign-in.web.ts` rather than the native SDK.
- [ ] Confirm email magic links still work on both.
