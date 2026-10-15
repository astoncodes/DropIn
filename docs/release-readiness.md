# Release readiness — October 15, 2026

**Decision: not ready for public App Store submission.** The local source and SQL
regressions pass. Production rollout, Apple-specific account deletion, user-content
safeguards, native testing, and store setup still have release gates open.

This is a review of the current worktree, including its uncommitted security
changes. It is not an assertion that those changes are deployed. Follow the
ordered checklist in [TODO.md](../TODO.md) and the [App Store runbook](app-store-release.md).

## Evidence collected

| Check                                                                                  | Result                                                                                                                                                                     |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                                        | Passed formatting, lint, workspace types, 241 unit tests and tooling tests                                                                                                 |
| `npm run db:test`                                                                      | Passed 254 assertions across 18 suites on the isolated test project                                                                                                        |
| Realtime chat and nearby-first feed                                                    | Client/unit/SQL checks pass; test has the Realtime publication, location-aware feed RPC and latest-message RPC, but a two-device hosted WebSocket journey remains required |
| `npm run build --workspace apps/admin`                                                 | Passed                                                                                                                                                                     |
| `npx expo export --platform web --output-dir dist --max-workers 2` in `apps/mobile`    | Passed                                                                                                                                                                     |
| `node scripts/check-client-bundles.mjs`                                                | Passed: 42 built files checked against six configured server-side values                                                                                                   |
| `npx expo install --check` in `apps/mobile`                                            | Failed: eight package-version mismatches                                                                                                                                   |
| `npx expo-doctor` in `apps/mobile`                                                     | 16/18 passed; Metro defaults and package alignment failed                                                                                                                  |
| `npm audit --json`                                                                     | 31 affected dependency entries: 20 high, 11 moderate, zero critical                                                                                                        |
| Production Supabase project, SQL, migrations and Edge Function metadata                | Read-only connector audit completed; production is healthy but five reviewed migrations and the hardened Edge Function are not deployed                                    |
| Apple membership, signing, App Store Connect record, EAS cloud variables/build history | Not verified in this review                                                                                                                                                |
| Signed production iPhone/iPad archive and TestFlight journeys                          | Not verified; web export does not prove native release behavior                                                                                                            |

Audit entries include transitive dependency chains and are not 31 independently
proven app exploits. Inspect advisory paths and actual exposure before deciding
what must be upgraded. Do not force an incompatible native dependency change
just to reduce the count.

## Release gates

| Priority         | Finding and evidence                                                                                                                                                                                                                       | Required outcome                                                                                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blocker          | `apple-sign-in.ts` does not retain an authorization code for revocation; `delete-account` removes Supabase data but never calls Apple's revocation API                                                                                     | Complete and test Apple-token revocation during account deletion. [Apple guidance](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)                                                                        |
| Blocker          | Reports/blocks exist, but no implemented objectionable-content filtering path is evident; check-in notes are not report targets                                                                                                            | Finish filtering/moderation coverage for posts, media, chat and other public user text, and verify report/block/takedown and support operations. [UGC guideline](https://developer.apple.com/app-store/review/guidelines/#user-generated-content) |
| Blocker          | Production ends at `20261013010000_canada_venue_coverage`; five October 15 migrations are absent. `session-media` is public, `is_admin(uuid)` remains anonymously executable, and deployed `delete-account` v1 still returns wildcard CORS | Reconcile test migration history, complete the lockout-safe admin/client rollout, deploy the reviewed database and Edge Function changes with real origins, and prove anonymous media denial via HTTP                                             |
| Blocker          | Local support email, operator and site URL are blank; no public deployment was supplied                                                                                                                                                    | Publish working privacy/support/terms/deletion pages and a monitored support contact; verify cloud production variables separately                                                                                                                |
| Blocker          | Native Apple/Google/email sign-in and Keychain persistence are not verified in a signed release build                                                                                                                                      | Complete real-device TestFlight tests, including fresh install, relaunch, denied permissions, sign-out and deletion                                                                                                                               |
| Blocker          | `supportsTablet: true`; existing release screenshots cover only iPhone                                                                                                                                                                     | Test/capture iPad, or deliberately choose an iPhone-only first binary before submission. [Screenshot requirements](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)                       |
| Engineering gate | Expo Doctor finds overwritten Metro watch defaults and eight patch mismatches                                                                                                                                                              | Resolve both checks, rebuild native dependencies, and rerun tests/builds                                                                                                                                                                          |
| Engineering gate | Upload size/MIME/ownership restrictions exist, but server-side file-content validation and per-user quotas remain open                                                                                                                     | Complete upload safeguards, rate-limit concurrency tests and operational abuse detection                                                                                                                                                          |
| Engineering gate | Security alerts, backup/restore procedure and production availability verification remain open                                                                                                                                             | Configure monitoring with a real destination and verify recovery/availability before inviting public users                                                                                                                                        |
| Submission gate  | Membership, app record, final privacy/age declarations, reviewer access and signed archive are unverified                                                                                                                                  | Complete the App Store runbook and retain evidence for each gate                                                                                                                                                                                  |

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
admin MFA code, and iPhone screenshot assets. Their presence does not prove
their deployed operation or full App Review compliance.

## Production Supabase read audit — October 15, 2026

Authorized read access through the `dropin` connection now succeeds for app
project `zyxfymvtijudbenqxzyf`. The project reports `ACTIVE_HEALTHY` on Postgres
17.6.1. The migration ledger contains the eleven repository migrations through
`20261013010000_canada_venue_coverage`; it does not contain the five reviewed
October 15 migrations for restricted admin lookup, write rate limits, admin MFA,
authenticated media reads and Realtime chat/latest-message previews.

Production still has a public `session-media` bucket. Its 25 MiB limit and image/
video MIME allowlist are present, but its SELECT policies cover only an object's
owner and admins; public bucket delivery therefore remains the effective public
read path. `public.write_rate_limits` and its rate-limit functions are absent.
`public.is_admin(uuid)` is still a `SECURITY DEFINER` function executable by both
`anon` and `authenticated`.

The only deployed Edge Function is JWT-verified `delete-account`, version 1. Its
source matches the pre-hardening behavior: wildcard CORS, no exact web-origin
allowlist, and no streamed 1024-byte request limit. Do not deploy the private
bucket or MFA migration independently of their compatible clients/admin UI.

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
store account, not only repository code. No binary was uploaded, no production
migration was applied, and no Apple/EAS account settings were changed in this
review. The previous test-project deployment record remains documented in
[security-hardening.md](security-hardening.md).
