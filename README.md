# Drop In

Find and organize pickup sports sessions. Create a session at a dropped pin or
reviewed venue, join its private chat, and share photos or short clips. Organizers
can edit or cancel individual sessions, and participants can leave and rejoin.

The apps run on your computer and connect to **hosted Supabase** for authentication,
database access and media storage. **Docker is not required.**

## Quick start with this checkout

If your root `.env` is already configured, keep it. From the repository root:

```bash
nvm install
nvm use
npm ci
npm run dev:web --workspace apps/mobile -- --port 8081
```

Open **http://localhost:8081**. Leave that terminal running. Your `.env` already
contains the connection settings if you completed the project setup earlier.
Do not replace it with the empty example file.

To run the admin app, open a second terminal at the repository root:

```bash
npm run dev --workspace apps/admin -- --port 5173 --strictPort
```

Open **http://localhost:5173**. An account needs an admin grant to access admin tools.
See [the admin guide](docs/admin-app.md) for venue review, management, audit history,
and choosing an admin account later.
Press `Ctrl+C` in the corresponding terminal to stop either app.

## First-time setup on a new computer

### 1. Install the prerequisites

- Node.js **24.8.0**, pinned in `.nvmrc`. With nvm, use `nvm install` and `nvm use`.
- npm, included with Node.js.
- Access to the hosted Supabase project and its project URL/publishable key.

Run `npm ci` from the repository root to install all JavaScript workspaces.
You do not need the Supabase CLI login or a database password just to run the apps.

### 2. Configure the root `.env`

For a new checkout **without an existing `.env`**:

```bash
cp .env.example .env
```

Open the Supabase dashboard for your project. Copy its **Project URL** and
**publishable key** from the project connection/API settings. An existing legacy
`anon` key also works. Both apps must point to the same intended project:

```dotenv
# Mobile app and its web preview
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY

# Admin app — use the same URL and publishable key
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY

# Geoapify: location search
EXPO_PUBLIC_GEOAPIFY_API_KEY=YOUR_GEOAPIFY_KEY

# Mapbox public token: native and web maps
EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=YOUR_MAPBOX_PUBLIC_TOKEN
```

The variable names still say `ANON_KEY`, but accept a Supabase publishable key.
Keep these names exactly as shown. Expo and Vite both read the repository-root
`.env`; you do not need a second copy inside either app.

The app connects through Supabase's HTTPS APIs. **`SUPABASE_DB_URL` is not needed
for app startup.** That privileged Postgres connection is only for maintenance
scripts. Never put a database password or service-role key in
`EXPO_PUBLIC_*`, `VITE_*`, or application code. `.env` is ignored by Git.

Geoapify powers location search. Mapbox powers native and web maps, with natural
street styling and a blue live-location dot. Pinch to zoom on
touchscreens or use the mouse wheel on web. Set a public `pk.*` Mapbox token;
never place a secret `sk.*` token in client configuration. Without a token,
the map displays an unavailable message and the venue list remains usable.

After changing `.env`, restart the development server and reload the app.

### 3. Confirm the database is prepared

For the existing configured Drop In project, migrations have already been applied;
you can proceed to startup. An empty venue list does not mean the connection failed:
you can create a session using a dropped pin without importing any venues.

For a **new Supabase project**, a maintainer must apply the repository migrations:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
```

Check that the linked project and pending migrations are correct, then apply them:

```bash
npx supabase db push
npm run db:types
```

The migrations create tables, access policies, reference data and session media
storage. Auth delivery and redirect settings are configured separately in the
hosted dashboard. Automatic seeding is disabled. Do not load the synthetic data
from `supabase/tests/fixtures/seed.sql` into the app project.

### 4. Configure email sign-in callbacks

In the hosted Supabase dashboard, open **Authentication → URL Configuration**.
For local web development, set the Site URL to `http://localhost:8081` and allow:

```text
http://localhost:8081/callback
http://127.0.0.1:8081/callback
http://localhost:5173
http://127.0.0.1:5173
dropin://callback
```

The mobile web app returns to `/callback`; the admin app returns to its origin.
Use the matching callback if you run on a different host or port. For deployed
apps, use your production Site URL and explicitly allow their callback URLs too.

Email links arrive in your real inbox. Configure custom SMTP before inviting
people outside the Supabase project team. There is no local test-email inbox.
See [Supabase email delivery](https://supabase.com/docs/guides/auth/auth-smtp).

### 5. Start the app and verify the connection

```bash
npm run dev:web --workspace apps/mobile -- --port 8081
```

At http://localhost:8081:

1. Open Profile and sign in using your email link.
2. Complete onboarding if prompted.
3. Choose Create session or + Session and place a pin.
4. Save a future session, open its chat and send a message.
5. Refresh and check that the session/message remains. Optionally share a photo.

This checks authentication and persisted database writes. A successful photo
upload also checks media storage. No additional backend process needs starting.

## Testing on a phone

Mapbox requires a native build; Expo Go cannot load `@rnmapbox/maps`. Neither can
Sign in with Apple or native Google sign-in.

From the repository root:

```bash
npm run ios       # or: npm run android
```

Xcode or Android Studio is required. See the
[Mapbox Expo installation guide](https://github.com/rnmapbox/maps/blob/main/plugin/install.md).

**Regenerate the native project after changing `app.config.ts`:**

```bash
npx expo prebuild --clean -p ios
```

Config plugins write entitlements, URL schemes and the bundle identifier at
prebuild time, not at bundle time. `apps/mobile/ios/` is gitignored, so editing
`app.config.ts` or `.env` and reloading Metro leaves an existing native project
untouched — and nothing in `git status` will tell you. That is how Sign in with
Apple and Google sign-in were both silently broken. `npm test` includes a check
that fails when the generated project has drifted.

Keep the Supabase URL as the hosted HTTPS URL. A native build uses the configured
`dropin` auth callback scheme. Physical-device verification remains part of the
[release checklist](docs/release-checklist.md).

On the Live screen, **Create session/run** opens the existing session form.
Location updates run in the foreground after permission is granted. The recenter
button appears when the map center is more than 50 metres from the latest location;
tapping it centers the map and hides the button. The distance threshold ignores
small GPS fluctuations. Verify panning, recentering, permission denial, and draggable
meeting pins on a device with a configured Mapbox token.

## Optional admin and maintenance tools

To grant admin access, the user must first have an account. Set server-only
`SUPABASE_DB_URL` to the correct hosted connection string from Supabase **Connect**,
then run:

```bash
npm run db:admin -- admin@example.com
```

This grants real privileges in the selected database. It is not required for
normal players or for starting the mobile app.

For schema type generation, `SUPABASE_PROJECT_REF` selects a hosted project or is
inferred from `EXPO_PUBLIC_SUPABASE_URL`. The script uses `SUPABASE_ACCESS_TOKEN`
or the saved CLI token. Keep tokens server-side; they are not app configuration.

## Checks and CI

Run these from the repository root. The full check uses Node and npm:

```bash
npm run check          # formatting, lint, types, unit tests and tooling self-checks
npm run test:maps      # focused subset of the unit suite: geocoding and map distances
npm run check:bundles  # builds and server-credential scanning
npm run db:types       # read hosted schema and regenerate TypeScript types
```

The automatic **App checks** workflow runs checks/builds with offline placeholder
configuration. It requires neither containers nor hosted database credentials.
Map tests run in the mobile Vitest suite; there is no separate legacy tile-provider
test runner. CI names formatting, lint, types, tests and builds separately so the
failed step identifies the problem. `npm run check` includes the database runner's
isolation self-test and the client-secret scanner's self-test; these do not connect
to Supabase. Browser and hosted integration scripts are explicit local checks and
are not run automatically against a live backend.

Database tests are separate maintenance checks, not a prerequisite to running the
app. Prepare an isolated hosted test project with migrations and synthetic fixtures,
set `SUPABASE_TEST_PROJECT_REF` and `SUPABASE_TEST_DB_URL`, then run `npm run db:test`.
The runner rejects the configured app project and never resets or seeds a database.
The optional **Hosted database checks** workflow is triggered manually and requires
a configured `database-tests` GitHub environment. It validates the test-project
credentials and app-project reference before installing dependencies or running tests.

The social integration test creates and removes temporary users, sessions and media.
Use an explicitly selected hosted project matching your `.env`:

```bash
npm run test:supabase -- --project-ref=YOUR_PROJECT_REF
```

## Troubleshooting

| Symptom                                    | What to check                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Missing Supabase URL/key                   | Fill in the root`.env` using the exact variable names above; restart the server.                              |
| Sign-in email never arrives                | Check spam, Supabase Auth logs and SMTP configuration; default delivery is limited to project-team addresses. |
| Login returns to the wrong page            | Check the exact host, port and callback in Supabase's redirect allowlist.                                     |
| Empty map or no sessions                   | An empty database is valid. Create a pin session; inspect any displayed network errors separately.            |
| Search reports authentication/quota errors | Check the Geoapify key, its restrictions and project usage.                                                   |
| Mapbox map is blank                        | Check the public Mapbox token, network access and native build; Expo Go is unsupported.                       |
| Port is already in use                     | Use the existing server or stop it before restarting; alternate ports also need matching auth callbacks.      |
| Missing tables/functions on a new project  | Apply committed migrations to the intended hosted project, then regenerate types.                             |

## Repository layout

- `apps/mobile`: Expo app and web preview.
- `apps/admin`: Vite admin application.
- `packages/database-types`: generated Supabase types.
- `packages/shared`: shared constants mirroring database rules.
- `supabase/migrations`: schema source of truth.
- `supabase/tests`: pgTAP checks and isolated-project fixtures.
- `docs`: architecture, product rules, decisions and remaining release work.

See [release checklist](docs/release-checklist.md), [architecture](docs/architecture.md),
and [contributor instructions](CLAUDE.md) for further details.
