# Drop In UI

The app uses warm off-white surfaces, evergreen actions, rounded cards, and
consistent sport colours and icons. Appearance is light-only; theme tokens live
in `apps/mobile/src/theme/tokens.ts`, and maps use Mapbox streets styling.

## Implemented

- Shared brand mark, sport badges, typography, spacing, button sizing, loading
  indicators, and selected-state accessibility for web and native.
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
- Location permission and an available device reading gate all mobile app
  routes. Denial, revocation and unavailable
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

## Browser checks

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

## Verification limits

Browser checks and JavaScript exports do not verify signed native builds, physical
permission settings, authentication or media capture. Track remaining work in
[TODO](../TODO.md). Run the checks above to establish current results.
