# Releasing Drop In to the App Store and Google Play

The steps between this repository and a store listing, in order. The code these
steps rely on is in the repository; what remains is account setup,
configuration and review. Known code gaps are tracked in [TODO](../TODO.md).

## 1. Apply the database migrations

`supabase/migrations/20260926120000_content_moderation.sql` adds player reports,
player blocks and admin take-down, and stops players attaching media hosted
outside Drop In storage. The app's report and block screens call it, so it
must be applied before a build that includes them reaches players.

Explain each pending migration before applying it. Apply it to the **test**
project with the checked procedure in
[Using the test database](database-testing.md#apply-database-changes-to-the-test-project),
then run `npm run db:test`.

Then apply to the **app** project and confirm the generated types match what
is committed (they were generated from the same schema; a diff means the
hosted generator changed and needs review):

```bash
npx supabase db push --dry-run
npx supabase db push
npx supabase migration list --linked
npm run db:types && git diff --exit-code packages/database-types
```

## 2. Accounts

| Account                 | Cost                         | Needed for                                         |
| ----------------------- | ---------------------------- | -------------------------------------------------- |
| Apple Developer Program | US$99 per year               | Signing, TestFlight, App Store, Sign in with Apple |
| Google Play Console     | US$25 once                   | Play Store listing and testing tracks              |
| Expo (EAS)              | Free tier is enough to start | Cloud builds and store submission                  |

A new **personal** Google Play account must run a closed test with at least 12
testers who stay opted in for 14 days before it can apply for production
access. Start that test as early as possible. Organisation accounts, which need
a D-U-N-S number, are exempt.

An **Individual** Apple account cannot add other people to its developer team.
The account holder then creates the signing credentials — by running the first
`eas build` with their Apple ID, or by creating an App Store Connect API key for
EAS.

## 3. Link the EAS project

From `apps/mobile`, signed in to the Expo account that should own the app:

```bash
npx eas-cli@latest init
```

`app.config.ts` is dynamic, so EAS cannot write the project ID itself. Copy the
ID it prints into the config:

```ts
owner: 'your-expo-account',
extra: { eas: { projectId: 'the-printed-id' }, /* existing values */ },
```

`eas.json` stores build numbers remotely (`appVersionSource: "remote"`) and
increments them on production builds.

## 4. Production configuration

The root `.env` is gitignored, so EAS never receives it. Every public value the
app needs must be an EAS environment variable in the `production` environment.
A production build refuses to start while any of these are empty
(`RELEASE_REQUIRED_CONFIG` in `app.config.ts`):

| Variable                            | Where it comes from                                |
| ----------------------------------- | -------------------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`          | Supabase → Project settings → API                  |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY`     | Supabase publishable key                           |
| `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`   | Mapbox public `pk.` token, URL-restricted          |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`  | Google Cloud → Credentials (web client)            |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`  | Google Cloud → Credentials (iOS client)            |
| `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` | The iOS client's reversed client ID                |
| `EXPO_PUBLIC_SUPPORT_EMAIL`         | A mailbox you read — shown in the app and policies |

Optional: `EXPO_PUBLIC_GEOAPIFY_API_KEY` (place search; the pin still works
without it), `EXPO_PUBLIC_OPERATOR_NAME` (who operates Drop In, named in the
policies) and `EXPO_PUBLIC_SITE_URL` (where the web build is hosted).

All of these are public values that ship inside the app. Create each one with
plain-text visibility, for example:

```bash
npx eas-cli@latest env:create --environment production --visibility plaintext \
  --name EXPO_PUBLIC_SUPPORT_EMAIL --value support@example.com
```

Never add the service-role key, a database URL or `SUPABASE_ACCESS_TOKEN` to EAS
or to any `EXPO_PUBLIC_` variable.

## 5. Sign-in providers and email

In the Supabase dashboard for the app project:

- **Authentication → Emails → SMTP.** Configure custom SMTP (Resend, Postmark,
  Amazon SES or similar). Supabase's built-in sender only delivers to the
  project team's own addresses, so without this, email sign-in links never
  reach players or app reviewers.
- **Authentication → URL configuration.** Set the Site URL to the hosted web
  build and allow `dropin://callback`, `<site>/callback` and the admin origin.
- **Authentication → Providers → Apple.** Enable it and add `com.playdropin.app`
  to the client IDs used for native sign-in. A Services ID and key are needed
  only for web sign-in with Apple.
- **Authentication → Providers → Google.** Use the web client ID. "Skip nonce
  checks" is currently on because the free Google Sign-In library cannot send a
  nonce on iOS; see the project notes before release.

In Google Cloud:

- Create an **Android** OAuth client for package `com.playdropin.app` with the
  SHA-1 fingerprints of the EAS upload key (`npx eas-cli credentials`) and of
  the Play App Signing key (Play Console → App integrity).
- Publish the OAuth consent screen. While it is in testing, only listed test
  users can sign in.

In the Apple Developer portal, enable **Sign in with Apple** on the
`com.playdropin.app` App ID.

## 6. Host the public pages

The stores need public web addresses for the privacy policy, support and
account deletion. The mobile web build serves them from the same code as the
app:

| Page                                  | Path              |
| ------------------------------------- | ----------------- |
| Privacy policy                        | `/privacy`        |
| Terms of use and community guidelines | `/terms`          |
| Help and support                      | `/support`        |
| Account deletion (Google Play)        | `/delete-account` |

```bash
npm run build --workspace apps/mobile   # writes apps/mobile/dist
```

Deploy `apps/mobile/dist` to any static host that serves `index.html` for
unknown paths (a single-page-app fallback), such as Cloudflare Pages, Netlify
or Vercel. Add the host's origin to the Supabase redirect allowlist, then set
`EXPO_PUBLIC_SITE_URL` to it so the policies print the deletion address.

Before publishing, read both policies in `apps/mobile/src/features/legal/` and
confirm the choices recorded in `legal-config.ts`: the minimum age (16), the
governing law (Prince Edward Island), and the report review target (24 hours).

## 7. Build, test and submit

```bash
cd apps/mobile
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest submit --platform ios --latest
npx eas-cli@latest submit --platform android --latest
```

Test a production build on real devices before submitting: Sign in with Apple
and Google, email links, location denial and approval, check-in, creating a
session, chat, reporting and blocking, and account deletion. On Android, use the
Play closed test track.

## 8. Store listings

### App privacy (Apple) and Data safety (Google)

Answer from what the app actually does (the privacy policy describes the same
facts):

| Data                                       | Collected                  | Linked to the player                     | Purpose           |
| ------------------------------------------ | -------------------------- | ---------------------------------------- | ----------------- |
| Email address                              | Yes                        | Yes                                      | Account           |
| Name (display name)                        | Yes                        | Yes                                      | App functionality |
| Precise location                           | Yes, while in use          | Check-in and photo checks are not stored | App functionality |
| Photos and videos                          | Yes, when shared           | Yes                                      | App functionality |
| Messages (session chat)                    | Yes                        | Yes                                      | App functionality |
| Other user content (session titles, notes) | Yes                        | Yes                                      | App functionality |
| User ID                                    | Yes                        | Yes                                      | App functionality |
| Diagnostics                                | Only Supabase request logs | —                                        | Security          |

No data is used for tracking or advertising, and none is sold. Data is
encrypted in transit, and players can request deletion in the app and on the
web. Declare Mapbox's SDK (map telemetry) and Google Sign-In as third parties
where the forms ask.

### Age rating

The app has user-generated content, chat between players who meet in person,
and location sharing. Answer the questionnaires accordingly; the terms set a
minimum age of 16.

### Notes for App Review

Reviewers cannot open email sign-in links sent to your inbox and will not be
near Charlottetown. Include something like:

> Sign in with Apple (or Google) to create an account. Drop In finds pickup
> games near the player; current venues are in Charlottetown, PEI, Canada, so
> the live map may be empty elsewhere — Discover and session pages work
> anywhere, and you can create a session at any location. Check-ins require
> being at a venue. Report or block: tap ⋯ on a post or session, or press and
> hold a chat message. Account deletion: Profile → Delete account.

Attach a short screen recording of check-in and a session chat recorded in
Charlottetown.

## 9. After launch

- Watch the admin website's Reports page daily; the terms promise a review
  within 24 hours.
- Grant the first admin with `npm run db:admin -- you@example.com` (needs
  `SUPABASE_DB_URL`) or an insert into `admin_users` from the SQL editor.
- Supabase's free plan pauses projects after a week without activity and has
  no backups; the Pro plan avoids both.
