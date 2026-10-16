# Security hardening progress

Scope: authentication, authorization, validation, backend rate limits, database
permissions, secure storage, secrets, release diagnostics, CORS, web headers,
safe rendering, admin MFA, uploads, monitoring, anonymous and cross-user tests.

## In progress (not deployed)

- Restrict `is_admin(uuid)` to the caller, with anonymous/cross-user regression tests.
- Backend write limits: messages 20/minute and 500/day; run series 3/minute and
  20/day; venue submissions 3/minute and 10/day; posts and check-ins 5/minute and
  50/day. Fixed UTC windows; concurrent writes serialize through atomic counters.
  Counters survive content deletion and are private. Failed transactions roll
  back their quota consumption. These are initial limits requiring operational review.
- Raw sign-in errors are logged only in development; production behavior has a unit test.
- Account deletion now denies browser origins unless listed in the server-only
  `ALLOWED_WEB_ORIGINS` setting (comma-separated exact HTTPS origins). Native
  requests without Origin still require a verified JWT. JSON bodies are limited
  to 1024 actual streamed bytes, regardless of Content-Length. Responses use
  `Vary: Origin`, `Cache-Control: no-store`, and `X-Content-Type-Options: nosniff`.
  Local tests cover allowed/denied/null/lookalike origins, preflight, native
  requests, invalid content types, chunked/oversized bodies, and deletion safety.
  Configure the real web origins before deployment; no wildcard fallback exists.
- Existing PR CI already runs unit/tooling checks and client bundle scans. The
  scanner now fails if either application's executable bundle output is missing,
  rather than reporting a vacuous success, and never prints matched credential
  prefixes into CI logs. Self-tests cover missing and present output cases.

## Database verification

The user resumed the isolated `DropIn Tests` project on 2026-10-15. All four
hardening SQL changes (admin lookup, rate limits, MFA and authenticated media)
have been applied there directly for verification. The Realtime chat/latest-
message/feed migration has also been applied directly to test. All 254 assertions across
18 SQL suites passed. The migration history has not yet been reconciled with
these direct test-database changes. No production migrations have been applied.
Concurrency and real Storage HTTP tests remain outstanding.

A read-only production audit through the `dropin` connection succeeded on
2026-10-15. The app project is healthy, but its migration history stops at
`20261013010000_canada_venue_coverage`. None of the four hardening migrations or
the Realtime chat/latest-message migration is recorded there. The `session-media`
bucket remains public, `is_admin(uuid)` is
still callable by `anon`, and the write-rate-limit table/functions are absent.
The deployed JWT-verified `delete-account` function is version 1 and still uses
wildcard CORS without the hardened origin and body-size checks. No production
write or deployment was performed during this audit.

The user's latest decision supersedes public media: signed-out visitors see only
the map, with authentication and legal/support pages still available. Signed-in
players (not only session members) can view posts/media. Mobile and web share
route guards and authenticated feed queries. Storage is private in the test
database, anonymous metadata reads are denied, and app/admin clients obtain
60-second signed links. Issued links remain usable until expiry; copies cannot
be revoked. Remote fixture URLs are no longer displayed because external hosts
cannot enforce this access policy. Existing public cached copies may require
cache expiry/purge at rollout. Deploy the updated clients together with the
private bucket migration; old clients still expecting public URLs will break.

## Admin MFA rollout (pending backend/UI integration verification)

The admin app now gates workspace rendering behind verified TOTP MFA. It offers
explicit enrollment, QR/manual setup, factor selection, code challenge and sign-out.
Enrollment secrets remain in component memory and are not logged or persisted by
the app. Authorization caches clear when the authentication session changes.
`enforce_admin_mfa` changes the existing database admin helper to require the
server-issued `aal2` claim, in addition to caller ownership and admin membership.
Database regression fixtures now use AAL2 for successful admin operations and
explicitly deny admin access without MFA. React rendering tests are not a substitute
for live enrollment/challenge and direct-API tests.

Deploy the MFA-capable UI before enforcing the database migration. First verify
TOTP is enabled on the test project, enroll a test admin, verify AAL1 denial and
AAL2 access, and test signing out/back in. Arrange owner-assisted recovery for a
lost authenticator: verify identity out of band and reset the affected factor via
trusted Supabase administration, never by disabling the MFA policy globally.
No real admin factors were enrolled, removed, or modified during implementation.

## Remaining work

- Verify and deploy database changes after regression and concurrency tests.
- Upload request limits, storage quotas, server-side file-content verification.
- Verify signed-in-only media on actual mobile/web and via Storage HTTP requests,
  including sign-out, copied/expired URLs, and upload safeguards.
- Verify admin MFA enrollment/challenge and backend enforcement, then perform
  the lockout-safe rollout described above.
- Production CORS allowlist and deployed web security headers.
- Suspicious-activity monitoring with a configured alert destination.
- Automatic isolated database tests on PRs; verify the existing release secret
  checks against freshly built release artifacts (not just cached outputs).
- Verify production auth settings, database permissions, release binary,
  anonymous API requests and cross-account access end to end.

This document is a work tracker, not a security certification or completion claim.
