# Development backend

The **DropIn Tests** project (`wejyydujrhirezljvgub`) can also serve as the shared
development environment. It has its own database, Auth accounts and Storage,
separate from the app project (`zyxfymvtijudbenqxzyf`). Use synthetic data and
development accounts there. A shared dev/test project saves a project slot, but
it is not an isolated database per developer: migrations and settings affect
everyone using it.

## Start either client against development

Keep the existing `.env` as the app/release configuration. Copy
`.env.dev.example` to `.env.dev` and fill in the **development project's
publishable key** from Supabase's API settings. No database password or service
key belongs in this profile. Both files are ignored; the examples are tracked.

```sh
cp .env.dev.example .env.dev
npm run dev:check
npm run dev:web -- --port 8081
# In a second terminal:
npm run dev:admin
# Or start Metro for a native development build:
npm run dev:mobile
```

`dev:check` prints the selected project reference without displaying the key.
The launcher rejects the app project's reference, checks the configured test
reference, and injects matching mobile/web and admin configuration into its child
process. It preserves public map settings from `.env` and strips Supabase
management/database credentials from the child environment. It does not rewrite
either environment file, relink the CLI, apply migrations, or change production.
Restart the server when switching environments; do not run two Metro servers on
the same port. Native sign-in provider IDs and callback schemes still need to
be configured for the development Supabase Auth project.

Ordinary `npm run mobile`, `npm run admin`, and release/build commands retain
their existing environment behavior. The profile is explicit rather than named
`.env.development`, which Vite would load automatically.

## Sharing the backend with SQL tests

`npm run db:test` keeps using `SUPABASE_TEST_PROJECT_REF` and
`SUPABASE_TEST_DB_URL` from the root `.env`. Run it directly, outside the dev
launcher, so its production-isolation checks still know the app reference.
Each pgTAP file rolls back its fixture changes. Existing seed fixtures remain;
their names/IDs are reserved for tests. Do not rename, delete, or edit those
fixtures while developing, and avoid writing to the same rows during a test run.

Some tests assume specific fixture counts. Arbitrary development records can
expose those assumptions; scope the assertions to their fixtures rather than
deleting dev data or weakening access policies. Tests can take locks while they
run. Coordinate schema changes and test runs with other developers.

Apply pending migrations to the development/test database explicitly using the
target checks in [database-testing.md](database-testing.md). Never reset the
shared project or load fixtures into the app project. Security changes currently
applied directly for verification must be reconciled with migration history
before an ordinary migration push; see [security-hardening.md](security-hardening.md).

Hosted browser tests may create accounts and files outside SQL transactions.
Use their explicit `--project-ref` options, point the client to development, and
review their cleanup behavior before running them. Production email/OAuth/Edge
Function settings do not transfer automatically to this project.

For independent destructive experiments or parallel CI runs, use a separate
project or local Supabase instance instead of resetting this shared backend.
