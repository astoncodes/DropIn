# TODO

Open work only. Anything listed here is genuinely unbuilt or unverified — if it
is done, delete the entry rather than leaving a ticked box behind.

## App Store release: current decision and order

**Not ready for public App Store submission as of October 16, 2026.** The
production web clients, reviewed Supabase changes and signed EAS iOS build are
complete; the remaining blockers below are store, moderation and operational work.
Read the [review evidence](docs/release-readiness.md) and follow the
[exact App Store steps](docs/app-store-release.md). The EAS owner/project ID and
production build profile already exist. Apple membership, signing, cloud
variables and App Store Connect record `6823479580` are verified.

### Deployment architecture and launch sequence

Use one production environment and keep every client pointed at it:

- **Backend:** keep Postgres, Auth, Row Level Security, Realtime, Storage and the
  `delete-account` Edge Function in the existing production Supabase project
  `zyxfymvtijudbenqxzyf`. There is no separate Node/API server in this repository
  to deploy. Never place the database password or service-role key in either UI.
- **Player web UI and public legal pages:** deploy the Expo web export from
  `apps/mobile/dist` as a Render Static Site with SPA fallback routing. This deployment
  supplies `/privacy`, `/terms`, `/support`, `/delete-account` and `/callback` as
  well as the browser version of the player app.
- **Admin UI:** deploy the Vite output from `apps/admin/dist` as a second Render
  Static Site. Restrict who receives an admin database grant, require TOTP MFA, and do
  not rely on an unguessable URL as access control.
- **Native UI:** build with EAS and distribute the signed binary through
  TestFlight/App Store. It talks directly to the same Supabase HTTPS APIs using
  the public project URL and publishable key; RLS and RPC authorization are the
  security boundary.

A custom domain is not technically required: Render's stable HTTPS
`*.onrender.com` URLs can be used for the first release. A domain is recommended for durable App Store,
privacy, support and OAuth links. If purchasing one, use a simple layout such as
`playdropin.app` for the player/legal site and `admin.playdropin.app` for the
admin site. Add both domains to their Render services, create the DNS records
Render displays, remove stale `AAAA` records, wait for verification and confirm
managed TLS. Choose one canonical `www`/apex address. Do not point the
public website at the Supabase database host.

A real email setup is required before inviting public users:

- [ ] Confirm that the configured `dannyaston916@gmail.com` support mailbox is
      actively monitored and assign an escalation path for account deletion,
      safety reports and App Review mail.
- [ ] Configure a transactional email provider as Supabase custom SMTP for magic
      links and other Auth messages. Keep its SMTP credentials only in Supabase;
      the support inbox and transactional sender may use the same domain but have
      different purposes.
- [ ] If using a domain, publish the provider's SPF and DKIM records and a DMARC
      policy, verify the sender domain, then test delivery, links and replies with
      Gmail, Outlook and an address outside the Supabase organization.

Deploy in this order so the clients and access rules remain compatible:

- [ ] In each live Render Static Site, add the already versioned `/*` to
      `/index.html` rewrite and security headers from `render.yaml`. The services
      created through Render's limited API are live, but direct nested routes
      currently return 404 until these Dashboard settings are applied.
- [ ] Set `EXPO_PUBLIC_SITE_URL`, `EXPO_PUBLIC_SUPPORT_EMAIL` and
      `EXPO_PUBLIC_OPERATOR_NAME` consistently in the web host and EAS production
      environment. Set all other required public map, Google and Supabase values
      listed in `.env.example`; never copy server secrets into public variables.
- [ ] Configure and verify Apple and Google provider callbacks against the
      production Supabase project. The production Site URL and exact player,
      admin and native callback allowlist are already set.
- [ ] Test AAL1 denial, sign-out/sign-in and the documented admin MFA recovery
      process against production. TOTP enrollment and live AAL2 dashboard access
      are verified.
- [ ] Test the complete connection path: email/social sign-in returns to the
      correct client; both player clients read/write through RLS; Realtime chat
      works; uploads use private Storage and short signed links; the admin UI can
      moderate only at AAL2; deletion invokes the Edge Function and removes Auth,
      database and Storage data; legal/support URLs work while signed out.
- [ ] Enable production error/security monitoring, test an alert, verify backup
      and restore procedures, and keep the backend, sites and support mailbox
      available throughout TestFlight and App Review.

### 1. Close code and safety blockers

- [ ] Implement and test Sign in with Apple token revocation during account
      deletion, including retry/failure behavior.
- [ ] Complete objectionable-content filtering and report/moderation coverage
      for the content players can publish. Verify reporting, blocking, takedown
      and support response operations against Apple's UGC requirements.
- [ ] Add server-side upload content verification and per-user upload quotas;
      test rate limits under concurrent requests and direct API calls.
- [ ] Fix Expo Doctor's Metro `watchFolders` defaults warning and align the
      eight Expo packages flagged by `expo install --check`. Rebuild native code.
- [ ] Triage the current npm audit results (20 high, 11 moderate dependency
      entries); fix relevant exposure or document justified acceptance without
      forcing incompatible native upgrades.

### 2. Verify and deploy the production backend

- [ ] Prove signed-out media denial through real Storage HTTP requests and
      native/web clients, including old public URLs, link expiry and sign-out.
      The production bucket is private, but it currently contains no object with
      which to run the end-to-end HTTP check.
- [ ] Verify Realtime chat on two authenticated test devices: member inserts
      should update the other device immediately, reconnect/background recovery
      should succeed through the 30-second fallback, and a non-member must
      receive neither rows nor change events. The publication, RLS and bounded
      latest-message RPC already pass isolated SQL tests.
- [ ] Configure a monitored security/error alert destination and test an alert.
      Verify production availability, backup retention and a restore procedure.
- [ ] Keep the production project from pausing. Free-plan Supabase projects
      pause after a week without activity; both projects were found paused on
      9 October. Move to a paid plan, or schedule a request that keeps it
      active, before TestFlight and App Review.
- [ ] Triage production Supabase advisors: six anonymous and 32 authenticated
      `SECURITY DEFINER` RPC warnings, leaked-password protection disabled, 27
      unindexed foreign keys, 17 unused indexes and five overlapping permissive
      policy sets. Preserve intentionally callable RPCs and the intentionally
      policy-less internal account-deletion queue; do not apply blanket fixes.
- [ ] Verify SMTP delivery to an external inbox, Apple/Google provider settings,
      nonce configuration and native/web callback allowlists.

### 3. Prepare Apple accounts, hosting and cloud configuration

- [ ] Verify the Sign in with Apple capability on App ID `com.playdropin.app`.
      Apple team access, signing and submission credentials are verified; App
      Store Connect app `6823479580` exists and all EAS variables are configured.
- [ ] Publish working HTTPS privacy, terms, support and deletion pages. A stable
      hosting-provider URL is sufficient; a custom domain is optional. Configure
      real site/operator/support values and host security headers.
- [ ] Confirm minimum age 16, governing law, data disclosures and the promised
      report-review turnaround; update the privacy document's revision date.

### 4. Test the release binary

- [ ] Choose iPhone-only versus iPhone+iPad before the first store binary.
      `supportsTablet` is currently true; iPad testing/screenshots are missing.
- [ ] Run the complete release checks, regenerate/review schema types against
      the released backend, and commit a reviewed release candidate with lockfile.
- [ ] Verify privacy manifests/SDK declarations for signed EAS production build
      `0b20668d-5ad8-4731-ae2b-2ad1720711d8` after Apple finishes processing it.
      Version `0.1.0` build `4` was uploaded successfully after adding and
      inspecting the required `NSMotionUsageDescription` in the signed IPA.
- [ ] Test the exact uploaded build on real devices: each sign-in provider,
      persistence, location/camera permissions, sessions/chat, uploads, map-only
      signed-out state, private-media links, report/block and account deletion.

### 5. Submit and operate

- [ ] Finalize screenshots for each supported device family and current UI,
      description/subtitle/keywords, category, support/privacy URLs and copyright.
- [ ] Complete current App Privacy, age-rating, encryption and territory-specific
      declarations based on actual app and third-party SDK behavior.
- [ ] Provide repeatable reviewer access and location-sensitive review steps;
      select the tested build and submit the version for App Review. Uploading
      with EAS Submit alone does not request public App Review.
- [ ] After approval, manually release, test the public install and monitor
      errors/reports. Assign an owner for the promised 24-hour moderation response.

## Other platform release

- [ ] For a separate Google Play release, verify console access, Android OAuth
      fingerprints, Data safety, signing and current testing-track requirements.
      These are not prerequisites for an iOS-only App Store launch.

## Moderation gaps

- [ ] **Check-in notes are not reportable.** They are visible to signed-in
      players while a check-in is active, but `report_target` has no kind for
      them.
- [ ] Include names, titles, captions and notes in the release moderation
      coverage; reports and blocks alone do not filter material before posting.

## Client gaps

- [ ] **Venue search sends a request on every keystroke** when choosing an
      existing venue for a session (the `session-venues` query in
      `new-run-screen.tsx`). Search on submit, as place search does, or debounce.
- [ ] **No error reporting.** Neither app sends failures anywhere; the admin
      website writes them to the browser console only. Choose a service before
      launch.
- [ ] **The map/list toggle covers the first row in list view.** On the live
      screen at phone width, the floating map button sits over the first
      venue's figure. Move the toggle or start the list below it.
- [ ] **Avatars.** `profiles.avatar_path` is granted and returned by
      `venue_activity()`, but nothing uploads or displays a photo, so players
      appear as initials.

## Run database tests in CI

The `database-tests` GitHub environment exists and holds the two project
references. The repository belongs to a personal account, so only its owner can
add the rest. Tracked in issue #16.

- [ ] Add the secrets `SUPABASE_TEST_DB_URL` (the test connection URL in the
      root `.env`) and `SUPABASE_ACCESS_TOKEN` (a personal access token starting
      with `sbp_`, needed only because the workflow regenerates types from the
      app project), then run `.github/workflows/database.yml` by hand.
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

## Launch geography

- [ ] Verify actual production venue coverage and explain it accurately in the
      store listing/review notes. Seed history alone does not establish live
      coverage. Confirm useful nearby data for the intended first launch area.

## Google sign-in on the web

Apple, Google and email sign-in were verified on iOS and Android in issue #14.
The web build's "Continue with Google" is refused by Google with
`redirect_uri_mismatch`, checked again on 16 October. Tracked in issue #18.

- [ ] In Supabase, under Authentication → Providers → Google, list the Web
      client ID first and the iOS one second, with the Web client's secret. The
      first ID is the one sent to Google, and it is the iOS one today.
- [ ] In Google Cloud, add the project's `/auth/v1/callback` address to the Web
      client's authorised redirect URIs; Google refuses the Web client without it.
- [ ] Then check a new account, a returning one, cancelling, signing out and
      staying signed in after a reload.
