# Using the test database

The **DropIn Tests** Supabase project holds the database schema and test fixtures
used by `npm run db:test`. It is separate from the app database and runs on the
DropIn organization's free plan.

## Project and connection details

| Setting                                     | Value                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| Dashboard                                   | [DropIn Tests](https://supabase.com/dashboard/project/wejyydujrhirezljvgub) |
| Test project reference                      | `wejyydujrhirezljvgub`                                                      |
| Region                                      | `us-east-1`                                                                 |
| Host                                        | `aws-0-us-east-1.pooler.supabase.com`                                       |
| Port                                        | `5432` (session pooler)                                                     |
| Database                                    | `postgres`                                                                  |
| Username                                    | `postgres.wejyydujrhirezljvgub`                                             |
| SSL                                         | Required                                                                    |
| App project reference — never use for tests | `zyxfymvtijudbenqxzyf`                                                      |

Use these fields in a PostgreSQL client, or open the test project's SQL Editor in
the dashboard. The session pooler supports IPv4; the direct database host may
require IPv6. See Supabase's [connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Get the password

The generated test database password is saved on the setup machine inside
`SUPABASE_TEST_DB_URL` in the repository's root `.env`. The password is the part
between the username's colon and the `@` in that URL. `.env` is ignored by Git;
cloning this repository does not copy the password.

From the repository root on macOS, copy just the password to the clipboard:

```bash
node --env-file=.env -e 'process.stdout.write(decodeURIComponent(new URL(process.env.SUPABASE_TEST_DB_URL).password))' | pbcopy
```

Paste it into your database client's password field or your password manager.
This command does not print it in the terminal. To display it instead, run the
same command without `| pbcopy` in a private terminal.

This is the test database's Postgres password. Supabase account login credentials,
API keys, and `SUPABASE_ACCESS_TOKEN` serve different purposes.

If the saved password is lost, reset it in the **test project's**
[Database Settings](https://supabase.com/dashboard/project/wejyydujrhirezljvgub/database/settings),
then update `SUPABASE_TEST_DB_URL` in `.env` and any configured CI secret. When
putting a password in a URL, percent-encode special characters in the password.
See Supabase's [password reset instructions](https://supabase.com/docs/guides/troubleshooting/how-do-i-reset-my-supabase-database-password-oTs5sB).

## Run the checks

Use the repository's Node version (`.nvmrc`) and install dependencies with `npm ci`
on a fresh checkout. The existing setup machine already has these `.env` values:

```dotenv
SUPABASE_PROJECT_REF=zyxfymvtijudbenqxzyf
SUPABASE_TEST_PROJECT_REF=wejyydujrhirezljvgub
SUPABASE_TEST_DB_URL=postgresql://postgres.wejyydujrhirezljvgub:YOUR_URL_ENCODED_PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

The URL above is a template; keep the real password only in your local `.env` or
secret store. Preserve the app's existing public URL and keys.

Run from the repository root:

```bash
npm run db:test
```

The suite currently runs 14 SQL files and reports `PASS: 177 database assertions.`
It checks database constraints, row-level security, profiles, session access,
attendance, presence, account deletion, and function privileges. Each SQL test
runs in a transaction and rolls back its changes. The shared seed fixtures remain.

The runner loads `.env`, rejects the app project as a test target, and checks that
the connection identifies the configured test project. It does not apply
migrations or load fixtures. Avoid simultaneous runs against this shared project.

## Apply database changes to the test project

The project already has the committed migrations and
`supabase/tests/fixtures/seed.sql`. After adding a migration, apply pending
migrations explicitly to the test URL before running the suite:

```bash
node --env-file=.env --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const ref = 'wejyydujrhirezljvgub';
const connection = process.env.SUPABASE_TEST_DB_URL;
const url = new URL(connection);
assert.equal(process.env.SUPABASE_TEST_PROJECT_REF, ref);
assert.equal(url.protocol, 'postgresql:');
assert.equal(url.hostname, 'aws-0-us-east-1.pooler.supabase.com');
assert.equal(decodeURIComponent(url.username), `postgres.${ref}`);
assert.equal(url.port, '5432');
const result = spawnSync('npx', ['supabase', 'db', 'push', '--db-url', connection], {
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
NODE
npm run db:test
```

Review the migration list before accepting the CLI prompt. The repository's CLI
link still targets the app project, so a bare `supabase db push` is not a test
deployment. The explicit `--db-url` above selects the test database without
changing that link.

If fixtures need loading into a newly prepared test project, apply migrations
first, then execute `supabase/tests/fixtures/seed.sql` in that project's SQL Editor.
The fixture inserts are designed to be rerunnable; this is not a database reset.
Never load these fake players and venues into the app database.

`npm run db:types` reads the configured **app** project's schema. It does not
automatically switch to the test project because test credentials exist.

## GitHub Actions

Local database tests work independently of GitHub. Hosted CI configuration remains
open in `TODO.md`. The manual `.github/workflows/database.yml` workflow expects a
GitHub environment named `database-tests` with:

| Type     | Name                        | Value                                                                        |
| -------- | --------------------------- | ---------------------------------------------------------------------------- |
| Secret   | `SUPABASE_TEST_PROJECT_REF` | `wejyydujrhirezljvgub`                                                       |
| Secret   | `SUPABASE_TEST_DB_URL`      | Full test connection URL from `.env`                                         |
| Secret   | `SUPABASE_ACCESS_TOKEN`     | Supabase management token with access to the app project for type generation |
| Variable | `SUPABASE_PROJECT_REF`      | `zyxfymvtijudbenqxzyf`                                                       |

After configuring these, run **Hosted database checks** from GitHub Actions. It
runs the tests and checks generated types against the app schema; it does not
apply migrations or fixtures. Database tests do not yet run automatically on PRs.

## Troubleshooting

| Symptom                         | What to check                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Missing test configuration      | Run from the repository root and check both `SUPABASE_TEST_*` values in `.env`.                                       |
| Target isolation error          | Keep the app reference separate; ensure the pooler username contains the test reference.                              |
| Connection timeout              | Check the test project's dashboard status, network access, and session pooler host/port.                              |
| Password authentication failure | Retrieve the password from the local URL or update the URL after a reset.                                             |
| Missing tables or functions     | Apply pending migrations to the test project.                                                                         |
| Missing fixture data            | Load the fixture SQL into the test project after migrations.                                                          |
| `not ok` assertions             | Read the named SQL file and failure details; investigate the rule or expectation without weakening security policies. |
