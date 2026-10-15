# Admin website

Run `npm run admin` from the repository root, then open http://localhost:5173.
The app reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the root `.env`.

Use `npm run dev:admin` with the [development profile](development.md) to select
the isolated test/development backend. The admin app requires an authenticator
code after email sign-in. The database MFA migration is verified on the test
project; coordinate production rollout with the updated admin app as described
in [security-hardening.md](security-hardening.md).
Only a publishable/anon key belongs in the browser.

## Website navigation

The website uses a simple top navigation bar with bookmarkable pages. Browser Back,
Forward and reload preserve the selected page:

- `#dashboard`: live totals and the five oldest locations awaiting review.
- `#approvals`: search and filter submissions, then approve, reject or link duplicates.
- `#reports`: review what players reported, then remove the content or dismiss the reports.
- `#locations`: edit, verify, hide and restore published locations.
- `#activity`: review the history of admin decisions and changes.
- `#coverage`: read the configured regions and sports.

The approval form shows only the fields needed for the selected decision. Rejection
requires a nonblank reason, approvals require readable coordinates, and linking
requires an existing location. Successful changes show confirmation on the page.
The sign-in page is a compact email form. The website works at desktop and phone widths,
and looks the way the [design system](design-system.md#admin-website) describes.

## Features

- Overview with live counts for the review queue, active venues, possible duplicates,
  and unverified venues.
- Searchable, region-filtered, paginated submission review, including past decisions.
- Submitted coordinates with an OpenStreetMap link, sports, and duplicate evidence.
- Approve with a reviewed name, reject with a reason, or explicitly link a submission
  to an existing active venue in the same region. Linking preserves the submitted
  name as an alias and adds its sports; it does not overwrite the existing venue.
- Venue name/address/sports/indoor-setting edits, verification, removal from discovery,
  and restoration. Existing merged venues are read-only.
- Region and sport reference lists, including unpublished/inactive entries.
- Paginated audit history with actor, time, affected record, and change details.

Approval publishes an unverified venue. Mark it verified separately after checking
it. Review decisions cannot be repeated; the database locks the submission and
commits publication, sports, and review history together. All privileged writes
use admin-checked database functions. Direct venue writes are denied even to admins.
The audit log is readable only by admins and cannot be changed through their API role.

The queue handles user-submitted canonical venues. Spontaneous sessions do not
need review. Import tooling is separate work.

## Player reports

Players report posts, chat messages, sessions and display names from the app,
and can block other players. Reports arrive on `#reports`, grouped by the
reported content with the oldest first; the dashboard shows the open count. A
report records what the reporter saw at the time, so content its author edited
or deleted can still be judged.

Each decision covers every open report on that content and is written to the
activity log:

| Reported     | Remove                                                         | Dismiss  |
| ------------ | -------------------------------------------------------------- | -------- |
| Post         | Deletes the post and its media rows, then its files            | Keeps it |
| Chat message | Deletes the message                                            | Keeps it |
| Session      | Hides the series from discovery and cancels its upcoming dates | Keeps it |
| Display name | Resets it to “Drop In player”                                  | Keeps it |

Removing a post deletes its database rows first, so it disappears from the app
immediately, and then deletes its photos or clips through the Storage API. If
that second step fails, the panel stays open with a retry; until it succeeds the
files remain reachable by direct link. Reporters are never named to the player.
Suspending an account entirely is done from Supabase Auth in the dashboard.
Submitters can revisit their private review history from Profile → Your venue
submissions, including decisions, reviewer notes and links to approved venues.

## Choose an admin account later

No permanent admin account is provisioned as part of app setup. When ready:

1. Sign in through the admin app with the chosen email address.
2. Grant access using a privileged hosted database connection:
   `npm run db:admin -- you@example.com`.
3. Reload the app to check access again.

Keep the privileged connection in `SUPABASE_DB_URL`, never a `VITE_*` variable.
The database dashboard can also grant an existing account through `admin_users`.
There is deliberately no browser action for granting admin roles.

Auth redirect allowlists must include `http://localhost:5173` and
`http://127.0.0.1:5173` for development. Add the exact HTTPS admin origin when
hosting the app. Existing mobile callback URLs must remain allowed.

## Build and validation

```bash
npm run check
npm run build --workspace apps/admin
node scripts/check-client-bundles.mjs
npm run db:test
npm run test:browser:venues -- --project-ref=YOUR_PROJECT_REF
```

Database tests require the separate hosted test project documented in the README.
The browser venue test requires the mobile and admin dev servers, an explicitly
selected app project, and a local management credential. It creates temporary
accounts and venues, checks submission, approval, rejection, duplicate linking,
venue edits, verification, removal/restoration and submission history, then removes
its fixtures.
`010_admin_review.sql` covers authorization, atomic approval, repeat review rejection,
rejection reasons, duplicate linking, edits, and audit writes. `016_content_moderation.sql`
covers reporting, blocking, report visibility, removal and dismissal, audit writes and
admin storage clean-up. The admin review functions are defined in
`supabase/migrations/20260908010000_baseline.sql`.

Deploy `apps/admin/dist` to a static HTTPS host with the public Vite configuration
available at build time. Choosing that host and granting the permanent admin account
can happen later.

## Isolated website browser checks

These checks use intercepted fixture responses and never write to the hosted database.
Start a separate dev server with a deliberately fake public configuration:

```bash
VITE_SUPABASE_URL=https://admin-test.supabase.co VITE_SUPABASE_ANON_KEY=test-public-key npm run dev --workspace apps/admin -- --port 5174
node scripts/tests/browser-admin-website.mjs
```

They cover sign-in rendering, the dashboard queue, approval and duplicate linking,
rejection validation and RPC payloads, report removal with its storage clean-up request,
success and empty states, navigation, browser Back, reload and mobile width. They
also check failures: a rule stated by the database is shown as written, database
internals are not, and a server that cannot be reached is reported in plain words
within a few seconds.
Screenshots are saved in `test-results/ui/admin-website-*.png`.
