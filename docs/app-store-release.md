# Drop In: exact App Store release steps

Reviewed October 15, 2026. Start with [release-readiness.md](release-readiness.md).
Execute these stages in order. Commands below are instructions, not records of
deployment or submission already performed. Replace uppercase example values
with verified values; never deploy placeholder URLs or credentials.

## 1. Finish the release code

Close the blocker and engineering-gate items in [TODO.md](../TODO.md): Apple
revocation on deletion, user-content filtering/reporting, uploads, security
rollout, Metro/Expo alignment, and dependency triage. Update the privacy text's
revision date when the final content is approved. Decide the initial release
version (the current `0.1.0` is not itself invalid) and supported device family.

From the repo root, verify the release candidate:

```sh
npm run check
npm run db:test
npm run build --workspace apps/admin
cd apps/mobile
npx expo install --check
npx expo-doctor
npx expo export --platform web --output-dir dist --max-workers 2
cd ../..
node scripts/check-client-bundles.mjs
npm audit
```

For unresolved dependency findings, record the affected path, exposure, remedy
or justified acceptance. Tests must cover the final changes. Review and commit
the release candidate, migrations, lockfile and generated types; exclude `.env`,
credentials, native build folders, caches and test output. Preserve the release
screenshots and editable source assets.

## 2. Confirm Apple and Expo ownership

1. Confirm active Apple Developer Program membership and access to the correct
   App Store Connect team. Complete any account agreements that block uploads.
2. In Apple Developer → Certificates, Identifiers & Profiles, verify the explicit
   App ID `com.playdropin.app` and its Sign in with Apple capability.
3. In App Store Connect → My Apps → New App, create the iOS app record: app name,
   primary language, the matching bundle ID, and your internal unique SKU. Save
   its numeric Apple ID for submission configuration. [Apple's app-record steps](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/).
4. From `apps/mobile`, log into the authorized Expo account and inspect the
   existing project; do not create a second project just to release:

```sh
npx eas-cli@latest login
npx eas-cli@latest whoami
npx eas-cli@latest project:info
```

The intended Expo owner/project are already in `app.config.ts`. Confirm remote
access and that Apple signing credentials belong to the intended team.

## 3. Publish the website and contact information

A purchased custom domain is optional. A stable HTTPS address assigned by a
hosting provider works; a fake placeholder does not. Deploy the Expo web export
with SPA fallback routing, then open `/privacy`, `/terms`, `/support`, and
`/delete-account` directly in a signed-out browser. Legal/help pages must remain
reachable without signing in, and the map must work while private media stays
hidden. Confirm the support address receives mail.

Set the real operator name, support address and site URL. Configure appropriate
web security headers on the selected host and exact allowed browser origins for
the Edge Functions. The updated account-deletion function uses the server secret
`ALLOWED_WEB_ORIGINS`, a comma-separated list of exact HTTPS origins. Configure
it before enabling browser deletion. Native deletion still needs a verified JWT.

## 4. Prepare the production backend

Use the app project `zyxfymvtijudbenqxzyf` for production; keep the shared
test/development project `wejyydujrhirezljvgub` out of the store binary.

1. Verify current production migrations, grants, RLS, bucket settings, Auth
   settings and deployed functions with authorized access. The current connector
   could not verify them during this review.
2. Reconcile the test project's directly applied security changes with its
   migration history before using a normal migration push. Do not rerun
   non-idempotent CREATE statements blindly or mark unapplied SQL as applied.
3. Test backup/restore and the migration plan. Deploy the MFA-capable admin site
   before enforcing database MFA; verify an admin can enroll and recover access.
4. Apply reviewed production migrations and deploy `delete-account` with its
   required secrets. Coordinate the private bucket with the updated clients:
   clients using the previous public URLs cannot read a private bucket.
5. Regenerate database types using `npm run db:types` against the intended
   released schema, review the diff, and rerun the database tests on test.
6. Check anonymous/cross-account requests over the actual APIs. Old public media
   URLs must stop working; issued signed links expire in one minute. Verify
   signed-in photos, sign-out, expired links, blocked users and file cleanup.

Use the explicit target checks in [database-testing.md](database-testing.md) for
test migrations. Before a production push, inspect `supabase migration list` and
`supabase db push --dry-run` using the installed CLI's documented flags and
verified project target. Never seed or reset production.

Configure custom SMTP and test delivery to an address outside the Supabase team.
Verify `dropin://callback`, the real web callback and admin origin in Auth URL
settings. Verify native Apple/Google IDs, Google's callback to Supabase, consent
screen status and nonce configuration against the actual client implementation.

## 5. Configure the cloud production build

In the existing Expo project's EAS dashboard, open Environment Variables →
production. Supply the public values required by `RELEASE_REQUIRED_CONFIG`:

| Variable                            | Value to verify                     |
| ----------------------------------- | ----------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`          | Production app project URL          |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY`     | Matching publishable/anon key       |
| `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`   | Restricted public Mapbox token      |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`  | Enabled Google Web OAuth client     |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`  | Google iOS client for the bundle ID |
| `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` | Reversed iOS client ID              |
| `EXPO_PUBLIC_SUPPORT_EMAIL`         | Working monitored support inbox     |

Also set `EXPO_PUBLIC_OPERATOR_NAME` and `EXPO_PUBLIC_SITE_URL` for accurate
legal pages. Set `EXPO_PUBLIC_GEOAPIFY_API_KEY` if place search is offered.
All these are public client configuration; server credentials stay on the
backend. Local `.env` and `.env.dev` are not evidence of cloud configuration.
Verify native dependencies' build-time token requirements separately.

Current Apple uploads require Xcode 26 or newer and the iOS 26 SDK or newer.
Check the actual EAS build image/log; the iOS 17 deployment target is the minimum
supported OS, a separate setting. [Apple SDK requirement](https://developer.apple.com/news/upcoming-requirements/?id=04282026a).

## 6. Build and upload to TestFlight

From `apps/mobile`, after the gates above are clear:

```sh
npx eas-cli@latest build --platform ios --profile production
```

Verify the Apple team, distribution signing, bundle ID, version, build number,
SDK version and production backend in the resulting build. Record the EAS build
UUID and inspect its archive privacy manifests, required-reason API declarations
and relevant SDK signatures. [Apple SDK privacy requirements](https://developer.apple.com/support/third-party-SDK-requirements/).

Then upload that specific build:

```sh
npx eas-cli@latest submit --platform ios --id YOUR_VERIFIED_EAS_BUILD_UUID
```

Select/configure the correct App Store Connect app when prompted. For automated
submission, add the real numeric `ascAppId` to an EAS submit profile and configure
an authorized App Store Connect API key. Keep private keys out of Git.
This upload makes the build available for TestFlight processing; it does not
request public App Review. [Expo submission steps](https://docs.expo.dev/submit/ios/).

## 7. Test the uploaded binary

In App Store Connect → TestFlight, finish export-compliance prompts, add internal
testers and install on real hardware. External groups may require Beta App Review.
Record the tested build number and results for:

- Fresh install, Apple/Google/email sign-in, cancellation, Keychain persistence
  after app restart, sign-out and switching accounts.
- Signed-out map access; protected deep links; no cached private feed after
  sign-out; signed-in photos/video and link renewal while foreground/background.
- Location allowed, denied and approximate; check-in distance/expiry; create and
  join a nearby session, chat between two accounts, leave/cancel sessions.
- Camera/library permission denial, invalid/oversized uploads, report, block,
  moderation takedown and support contact.
- Account deletion for every provider, Apple token revocation, media removal,
  network failure midway and resuming deletion safely.
- No development menu/debug warnings, usable offline/error states, accessibility,
  small/large iPhone layouts and iPad if supported.

Rebuild and retest if release code or native configuration changes. Do not submit
a different untested build because it is labeled "latest."

## 8. Complete the store listing

In App Store Connect, create the version matching the binary. Add the name,
subtitle, description, keywords, category, copyright, support URL, privacy-policy
URL, review contact and pricing/availability. Include regional declarations that
App Store Connect requires for your selected territories.

Upload screenshots showing the final app and current sign-in behavior. The repo
has four iPhone marketing screenshots; verify their UI/text against the final
binary. Because `supportsTablet` is currently true, supply iPad screenshots and
test iPad too, or decide to ship an iPhone-only binary before building. See
[Apple's screenshot slots](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).

Complete App Privacy using actual app and third-party SDK behavior: account data,
messages, user content, location handling, identifiers and diagnostics as
applicable. Do not infer "not collected" solely from the absence of a database
column. [Apple privacy definitions](https://developer.apple.com/app-store/app-privacy-details/).
Complete the current age-rating questionnaire for chat, user content and
location-related social use; the app's contractual minimum age of 16 is not an
App Store age-rating answer. [Age-rating instructions](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/).

Give reviewers repeatable access to account features through a tested,
reviewer-accessible login or demo arrangement. Do not rely on email sent to your
own inbox, an expiring bearer token, or an inaccessible geographic test. Explain
the map-only signed-out state, session creation near the reviewer's location,
location-gated check-ins, reporting, blocking and deletion. Supply a recording
for location-sensitive flows and arrange any further access Apple requires.

## 9. Request App Review and release

Select the exact TestFlight-tested build on the version page. Complete all
required fields/declarations, choose manual release initially, add the version
to the review submission and submit it for App Review in App Store Connect.
Keep backend services and reviewer access available throughout review.
[Apple submission procedure](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app).

After approval, perform a final backend/support check, release the version,
install it from the public App Store, and verify sign-in/map/media once more.
Watch errors, upload abuse, failed logins and reports; staff the promised
24-hour report-review process. Keep backup/recovery and a tested mitigation
plan available for a bad release.
