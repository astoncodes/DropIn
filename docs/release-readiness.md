# Release readiness — October 15, 2026

**Decision: not ready for public App Store submission.** The local source and SQL
regressions pass, and the production web/Supabase rollout, admin TOTP enrollment,
support configuration and signed EAS build are complete. Render SPA rewrites,
Apple-specific account deletion, user-content safeguards, native testing, and
store setup remain open.

This record covers production deployment from commit
`41b15654ce808f545e9c2bf16c9ac63f237f3520`. Follow the
ordered checklist in [TODO.md](../TODO.md) and the [App Store runbook](app-store-release.md).

## Evidence collected

| Check                                                                                  | Result                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                                        | Passed formatting, lint, workspace types, 241 unit tests and tooling tests                                                                                                                            |
| `npm run db:test`                                                                      | Passed 254 assertions across 18 suites on the isolated test project                                                                                                                                   |
| Realtime chat and nearby-first feed                                                    | Client/unit/SQL checks pass; test has the Realtime publication, location-aware feed RPC and latest-message RPC, but a two-device hosted WebSocket journey remains required                            |
| `npm run build --workspace apps/admin`                                                 | Passed                                                                                                                                                                                                |
| `npx expo export --platform web --output-dir dist --max-workers 2` in `apps/mobile`    | Passed                                                                                                                                                                                                |
| `node scripts/check-client-bundles.mjs`                                                | Passed: 42 built files checked against six configured server-side values                                                                                                                              |
| `npx expo install --check` in `apps/mobile`                                            | Failed: eight package-version mismatches                                                                                                                                                              |
| `npx expo-doctor` in `apps/mobile`                                                     | 16/18 passed; Metro defaults and package alignment failed                                                                                                                                             |
| `npm audit --json`                                                                     | 31 affected dependency entries: 20 high, 11 moderate, zero critical                                                                                                                                   |
| Production Supabase project, SQL, migrations and Edge Function metadata                | Five reviewed migrations applied; private media, write limits, admin MFA, nearby feed and Realtime chat verified; JWT-verified `delete-account` v3 deployed                                           |
| Production web clients                                                                 | Player and admin builds are live on Render; roots return 200, but direct nested SPA routes still need the versioned rewrite rules applied in Render                                                   |
| Apple membership, signing, App Store Connect record, EAS cloud variables/build history | Apple team access and signing verified; App Store Connect app `6823479580` created; all ten EAS production variables configured                                                                      |
| Signed production iOS archive                                                          | EAS build `1cd71961-076f-4c19-8f73-58bff955fcf2`, version `0.1.0` build `3`, verified as `com.playdropin.app` / `Drop In` and uploaded to App Store Connect; Apple processing pending                 |

Audit entries include transitive dependency chains and are not 31 independently
proven app exploits. Inspect advisory paths and actual exposure before deciding
what must be upgraded. Do not force an incompatible native dependency change
just to reduce the count.

## Release gates

| Priority         | Finding and evidence                                                                                                                                   | Required outcome                                                                                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blocker          | `apple-sign-in.ts` does not retain an authorization code for revocation; `delete-account` removes Supabase data but never calls Apple's revocation API | Complete and test Apple-token revocation during account deletion. [Apple guidance](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)                                                                        |
| Blocker          | Reports/blocks exist, but no implemented objectionable-content filtering path is evident; check-in notes are not report targets                        | Finish filtering/moderation coverage for posts, media, chat and other public user text, and verify report/block/takedown and support operations. [UGC guideline](https://developer.apple.com/app-store/review/guidelines/#user-generated-content) |
| Blocker          | `session-media` is private and the hardened backend is live, but the empty bucket prevents a real old-public-URL denial test                           | Upload a controlled test object and prove signed-out denial and signed-link expiry                                                                                                                                                                |
| Blocker          | Both web roots are public, but Render SPA rewrites/security headers still need Dashboard application                                                   | Apply `render.yaml` routes/headers and verify legal/callback deep links                                                                                                                                                                           |
| Blocker          | Native Apple/Google/email sign-in and Keychain persistence are not verified in a signed release build                                                  | Complete real-device TestFlight tests, including fresh install, relaunch, denied permissions, sign-out and deletion                                                                                                                               |
| Blocker          | `supportsTablet: true`; existing release screenshots cover only iPhone                                                                                 | Test/capture iPad, or deliberately choose an iPhone-only first binary before submission. [Screenshot requirements](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)                       |
| Engineering gate | Expo Doctor finds overwritten Metro watch defaults and eight patch mismatches                                                                          | Resolve both checks, rebuild native dependencies, and rerun tests/builds                                                                                                                                                                          |
| Engineering gate | Upload size/MIME/ownership restrictions exist, but server-side file-content validation and per-user quotas remain open                                 | Complete upload safeguards, rate-limit concurrency tests and operational abuse detection                                                                                                                                                          |
| Engineering gate | Security alerts, backup/restore procedure and production availability verification remain open                                                         | Configure monitoring with a real destination and verify recovery/availability before inviting public users                                                                                                                                        |
| Submission gate  | Membership, app record, final privacy/age declarations, reviewer access and signed archive are unverified                                              | Complete the App Store runbook and retain evidence for each gate                                                                                                                                                                                  |

The Expo patch checks currently expect: expo `~57.0.29`, expo-constants
`~57.0.22`, expo-crypto `~57.0.4`, expo-dev-client `~57.0.20`, expo-linking
`~57.0.13`, expo-location `~57.0.21`, expo-router `~57.0.27`, and
expo-splash-screen `~57.0.10`. Recheck compatibility when implementing the
upgrade rather than treating this dated list as permanent.

## What is already configured

The app config declares `Drop In`, slug `drop-in`, owner `tomiwaadewumi`, EAS
project `c540d540-4f74-4f65-b0e5-0423e06bb6c7`, bundle ID
`com.playdropin.app`, and version `0.1.0`. `eas.json` has a production build
profile with remote build numbers and automatic increments. A missing local
support email would fail the production config gate; cloud EAS values may differ
and must be checked there. Reinitializing EAS is not the next task.

The repo includes native permission descriptions, Apple/Google/email auth,
account deletion UI, reports/blocks, RLS/ownership tests, private-media migration,
admin MFA code, and iPhone screenshot assets. Production TOTP enrollment and AAL2
dashboard access are verified. The support address is configured in Render and
all ten EAS production variables. These facts do not prove full App Review compliance.

## Production deployment audit — October 15, 2026

Authorized production access through the `dropin` connection succeeds for app
project `zyxfymvtijudbenqxzyf`. All five October 15 migrations are now in the
hosted ledger. Verification shows `session-media.public = false`, the private
write-rate table exists, `session_messages` belongs to `supabase_realtime`, and
the nearby-feed RPC is `SECURITY INVOKER`, executable by `authenticated` and not
`anon`. `is_admin(uuid)` remains callable by `anon` intentionally because public
RLS policies use it; it returns false without an authenticated caller and now
requires an AAL2 token for an admin result.

The JWT-verified `delete-account` Edge Function is active at version 3. Its exact
player/admin origin allowlist is stored as a Supabase secret. Auth now uses
`https://dropin-player.onrender.com` as Site URL and allows the exact player
callback, admin origin, native `dropin://callback`, and retained local-development
callbacks.

Render serves the player root at `https://dropin-player.onrender.com` and admin
root at `https://dropin-admin.onrender.com` from the same reviewed commit. Both
return HTTP 200. Direct player legal/callback routes return 404 until the
`render.yaml` `/*` rewrite is applied through the Dashboard; the current Render
connector cannot mutate route/header rules and no interactive browser surface
was available during this run.

The production security advisor reports the exposed `is_admin(uuid)` issue,
five other anonymous `SECURITY DEFINER` RPC warnings, 32 authenticated RPC
warnings that need intent-by-intent review, and disabled leaked-password
protection. The policy-less `account_storage_deletions` table is an informational
finding because its design intentionally exposes no direct row access. The
performance advisor also reports 27 unindexed foreign keys, 17 unused indexes,
and five sets of multiple permissive policies; these require workload-aware
triage rather than blind index or policy removal.

## Scope and limits

App Store readiness includes the actual signed binary, hosted services and
store account, not only repository code. A signed EAS IPA was produced but has
not been uploaded to TestFlight or submitted for App Review. The production
Supabase and Render changes above are live. The previous test-project record remains in
[security-hardening.md](security-hardening.md).
