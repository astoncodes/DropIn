# Drop In UI redesign

The redesign follows the supplied Drop In references: warm off-white surfaces,
evergreen actions, rounded cards, and consistent sport colours and icons.
Existing real venue/session data and the user's map-marker and
personal-schedule changes are preserved.

**The app ships light-only.** A dark palette and System/Light/Dark controls were
built and then removed in `89891bf`: `ThemeName` is now `'light'`, `usePalette()`
always returns the light palette, and both map components are pinned to
`streets-v12`. `useIsDark()` and `useThemeName()` survive as constants so call
sites did not all have to change — treat them as dead indirection, not as a
theming seam.

## Implemented

- Shared brand mark, sport badges, typography, spacing, button sizing, loading
  indicators, and selected-state accessibility for web and native.
- Light-only appearance. The System/Light/Dark controls this line once described
  were removed with the dark palette in `89891bf`.
- Live map with coloured sport markers, compact header, accessible expand/collapse
  control, scrolling venue results, and a desktop side panel.
- Venue details with an actual map, activity, directions, session creation and
  interactive upcoming-session cards.
- Live check-in and arrival flows backed by location/ownership-checked database
  functions: supported sports, durations, party size, notes, replacement, extension,
  checkout and arrival cancellation. Profile and venue pages expose active controls.
- Expired venue activity and own-status cards disappear on a foreground timer,
  including while offline. Polling and foreground refresh reconcile other players.
- Fresh location reads with bounded waits for check-ins and session photos;
  Expo's web default of an infinitely cached position is explicitly overridden.
- EAS development, simulator, preview and production profiles. Account association,
  signing and remote environment configuration remain owner setup tasks.
- Welcome screen and email sign-in with validation, connection errors, duplicate
  submission protection, and a clear browse-without-an-account action.
- Profile identity and editing, and sign-out error handling.
- Confirmed account deletion with retryable storage cleanup, hosted-session and
  participant-media removal, and persistent local sign-out after deletion.
- Location permission and an available device reading now gate all mobile app
  routes, per the owner's September 12 requirement. Denial, revocation and unavailable
  GPS show an enable-location screen. All hard-coded location fallbacks are removed.
- Venue submission starts at the device location and requires explicit pin selection. Nearby
  lookup failures expose a retry action, and desktop forms use the shared width.
- Persistent venue submission history from Profile and the submission confirmation,
  including review status, notes, pagination and links to published venues.
- Discover now exposes upcoming sessions as well as community Moments. Players can
  search, filter sports, join, or mark Maybe.
- Scheduled retains only hosted, Going, and Maybe sessions, with Upcoming and Past
  views. Cancelled sessions remain available in history.
- Scrollable chat list, connection recovery, separate session Details / Chat /
  Photos views, inline action errors, and message scrolling.
- Session-specific photo queries instead of showing unrelated community photos.
- Consistent admin sign-in and console styling, responsive layouts, correct
  dashboard venue filters, and Escape dismissal of detail dialogs.
- App icons and splash assets generated from the committed vector brand mark.

## Verified on September 11, 2026

- `npm run check`: formatting, lint, workspace types, and all 64 unit tests pass.
- `npm run check:bundles`: admin production build, iOS/Android/web JavaScript exports, and
  client-bundle credential scanning pass. This export is separate from a native
  compiled-device test.
- `npm run test:maps`: Geoapify response validation, caching, cancellation,
  authentication/quota errors, and missing-key handling pass. Removed obsolete
  tile-provider assertions left behind by the previous Mapbox migration.
- The updated iOS simulator binary compiled, installed, launched and rendered the
  native map and themed interface. Zero build errors; two development-tool warnings
  (duplicate C++ library linkage and the Expo launcher build-script dependency list).
  Full physical-device authentication/media verification remains outstanding.
- Existing hosted session social smoke test passes: signup token verification,
  profile updates, venue/pin session creation, discovery, chat privacy, photo
  proximity rules, uploads/public access, editing/cancellation, leave/rejoin,
  recurrence isolation, and cleanup.
- Chromium browser flow passes against the hosted backend: new-account onboarding,
  profile editing, pin-session creation, organizer message, a second account's
  private-chat gate and join, two-account messaging, personal Scheduled, leave,
  cancellation/history, and sign-out. Temporary accounts and their sessions were
  removed afterward. No email was sent to an inbox.
- Public browser flows pass: venue-to-session navigation, authentication gate,
  Discover search/filter/Moments, invalid email handling, stubbed email-link
  delivery, desktop map layout, and narrow admin layout.
  No browser runtime exceptions were observed.

- Hosted live-presence API checks pass: location accuracy/distance/timestamp,
  duration and party bounds, ownership, replacement, arrival fulfillment, extension,
  checkout, expiry and expired-row privacy. Browser checks cover the complete flow,
  a moved-device rejection and offline expiry. Temporary fixtures were removed.
- `npm run db:test` cannot run: `SUPABASE_TEST_PROJECT_REF` and
  `SUPABASE_TEST_DB_URL` for a separate project are not configured. Added 29 pgTAP
  assertions for live presence, but do not claim that suite passed.
- Expo SDK 57 patch versions and React Native 0.86.3 are aligned. Root Metro
  development dependencies pin 0.84.5, matching Expo, to eliminate the legacy
  `image-size` dependency. `npm audit` now reports 15 moderate findings and no high
  findings. Remaining chains include legacy `uuid` in Xcode tooling and
  `decode-uri-component` through navigation's `query-string`; no breaking forced
  major-version overrides were applied.

## Repeat the browser checks

Additional verification on September 12, 2026: account-deletion handler checks,
hosted API/browser deletion tests, and the existing hosted social smoke test pass.
The deletion checks include an interrupted request and retry, upload write guards,
other participants' media in hosted sessions, and uploads without media metadata.
The added account-deletion pgTAP assertions remain unrun because the separate test
project is not configured.

Venue review browser checks also pass: explicit pin selection, device coordinates
in Toronto and Charlottetown, location denial, submission, private pending status,
non-admin review rejection, admin approval, public venue navigation, final-decision
enforcement and audit recording. All temporary accounts, submissions and published
venues were removed. The repository check and all-platform bundle build/credential
scan pass with these changes.

Extended checks cover duplicate linking without overwriting the canonical name,
rejection with a required reason, address editing, verification, removal from
discovery and restoration. The submitter can revisit all outcomes from Profile;
another account sees only its own submission history.

The required-location browser suite verifies denied access across app routes,
no fallback map queries, actual Toronto coordinates after permission is granted,
revocation, recovery and unavailable GPS. Public browsing with permission,
two-account onboarding/session/chat flows, venue reviews and account deletion
also pass with the root location gate. Repository checks and all-platform
bundle exports/credential scanning pass. Native permission-settings behavior
still needs the physical-device release checks.

The hosted security advisor review identified unnecessary anonymous function
grants. Migrations remove anonymous access to account, membership, join and
duplicate-ranking helpers, and client execution of the Auth trigger function.
Hosted role checks confirm the grants; signup and social smoke tests pass.
Nine new pgTAP privilege assertions are committed but remain unrun without the
isolated test project. Remaining advisor findings include intentionally exposed
database RPCs, a server-only deletion queue with no client policies, and disabled
leaked-password protection. This is not a complete security clearance.

With the mobile web app on port 8081 and admin app on port 5173:

```bash
npx playwright install chromium
npm run test:browser
npm run test:browser:supabase -- --project-ref=YOUR_PROJECT_REF
npm run test:presence -- --project-ref=YOUR_PROJECT_REF --browser
node scripts/tests/account-deletion.mjs --project-ref=YOUR_PROJECT_REF
npm run test:browser:venues -- --project-ref=YOUR_PROJECT_REF
npm run test:browser:location
```

The hosted browser test requires the existing server-side Supabase management
credential and an explicit project matching the root app configuration. It creates
only temporary accounts/sessions, exercises the UI with two accounts, and cleans up
in `finally`. It does not send sign-in emails. The public browser test stubs email
delivery. Screenshots are written to gitignored `test-results/ui/`.

## Preview captures

- [Live map](ui-preview/live.png)
- [Welcome](ui-preview/welcome.png)
- [Admin sign-in](ui-preview/admin.png)

## Release status

The redesign is not a claim that the app is ready to publish. The remaining
[release checklist](release-checklist.md) still applies, including native/device
verification, reporting/blocking/moderation, public legal and
support information, production service configuration, and store signing/setup.
The user has been asked for the support email, production domain, and legal owner.
Do not fabricate these details or mark the overall goal complete without verifying
the remaining requirements.
