# Product rules

Behaviour the product commits to. Derived from the canonical reference document (keep a copy at
`docs/reference.md`). System design is in [architecture.md](architecture.md).

Numeric values here are mirrored in `packages/shared` for form validation, and **enforced** by
migrations and database functions. The database is the authority.

---

## The product in one sentence

An app that shows where pickup sports are active now, lets players broadcast a short-lived on-site
check-in, lists trustworthy recurring runs nearby, and helps each dated session stay connected.

It remains a **presence and discovery tool**. Social features attach to real dated sessions rather
than creating a general-purpose social graph.

The loop: open the app → see nearby venues and current activity for your sports → open a venue →
check in if you're physically there, or see an upcoming run → the check-in disappears on its own
when it expires.

---

## Visibility

- Browsing may happen without an account. Checking in, creating a run, or submitting a venue
  requires one.
- Only `active` venues appear in public discovery.
- `pending` venue candidates are visible only to their submitter and to admins.
- `merged` venue URLs resolve to the canonical venue — old links keep working.
- `removed` venues disappear publicly but stay in the database for history and auditability.

---

## Check-ins

A check-in is a **status broadcast, not a negotiation**. That framing decides most of the rules
below: it is short, low-friction, and expires without anyone having to do anything.

- One open check-in per user at a time. Enforced by a partial unique index on
  `user_id where ended_at is null`, not by client logic.
- Belongs to one active venue and one sport that venue supports.
- Duration: **90 minutes** default, **30 minutes** minimum, **4 hours** maximum.
- Extendable, but the total active window cannot exceed 4 hours without a fresh location check.
- Checkout is explicit and immediate.
- `party_size` includes the checked-in user, defaults to 1, capped at 20.
- **A venue's live count is the sum of `party_size`, not the number of rows.** Someone who
  brought four friends counts as five players.
- Optional note: plain text, 120 characters. Never rendered as HTML.
- Expired check-ins are not publicly readable.

### Expiry cannot depend on a cleanup job

A check-in is active when:

```
ended_at is null and expires_at > now()
```

The UI, the counts, and every database function use exactly that predicate. A scheduled job may
set `ended_at`, but **correctness must never depend on it having run on time**. Stale check-ins —
"the app says five people are here, nobody is" — destroy trust in the product within a week, and
that failure must not be one missed cron away.

Client timers also remove a check-in from the UI at `expires_at` even if no database event arrives.

---

## Arrival intents — "I'm on my way"

A weaker, unverified signal that sits beside check-ins without ever being mixed into them.

- Any signed-in player may declare they are heading to an active venue for a sport it supports.
- ETA is **15, 30 or 60 minutes**. The intent expires at that time.
- One open intent per player, enforced by a partial unique index the same way check-ins are.
- Checking in at that venue **fulfils** the intent; checking in anywhere else cancels it.
- **Never added to the here-now count.** A check-in is location-gated and an intent is one tap, so
  a venue shows "2 here now · 3 heading there" and never "5". Summing them would make the stronger
  signal worthless, which is the whole reason the weaker one is safe to offer.

## Venue conditions and pulse — read paths only, not yet reportable

Both are fully specified in the schema, read by the discovery RPCs and rendered by the app, and
**neither can currently be created.** They are listed here so the gap is recorded rather than
rediscovered.

**Conditions** are short-lived, player-reported facts about a venue: `lights_on`, `lights_off`,
`wet_surface`, `locked`, `crowded`, `equipment_issue`.

- `lights_off`, `wet_surface`, `locked` and `equipment_issue` are **blocking** — "do not travel".
  `lights_on` and `crowded` are merely useful. The UI must keep that distinction visible.
- Readable by anyone, signed in or not, while live. `reported_by` is withheld by column grant, so a
  condition is never attributable in public — it is retained only for abuse handling.
- Expiry uses the same `expires_at > now()` predicate check-ins use, so no cleanup job is
  load-bearing.
- _Missing:_ there is no insert policy, no insert grant and no reporting RPC. Adding one must also
  fix `venue_conditions_one_per_kind_per_reporter`, whose predicate `expires_at > '-infinity'`
  matches every row — so it currently means "one report per kind per reporter **ever**", not the
  "one _live_ report" its comment claims. A player could never re-report a wet surface.

**Pulse** is a closed vocabulary a player attaches to their own check-in — `need_players`,
`game_on`, `full_next_game`, `wrapping_up` — deliberately not free text, so it aggregates. A venue
shows the most recent live check-in's pulse.

- _Missing:_ `create_check_in()` takes no pulse argument, so `check_ins.pulse` is always null and
  the chip never renders. Adding the parameter is the whole fix.

## Location gating and privacy

- Foreground location only. Requested when needed, never in the background.
- Location permission and an available device reading are required before opening
  the mobile app, including browsing and scheduled runs. There is no fallback city.
  This requirement was confirmed by the owner on September 12, 2026.
- Broadcasting "I'm here" requires a recent reading: within **250 m** of the venue, with reported
  accuracy of **100 m or better**.
- This is **an anti-abuse friction control, not proof of presence**. It raises the cost of a fake
  check-in; it does not verify identity or physical location, and it should not be described as
  though it does.
- **The submitted coordinate is used inside the check-in transaction and then discarded.** Only
  the distance to the venue, the reported accuracy, and the verdict are stored. The product needs
  to know a check-in was plausible; it does not need a history of where anyone has been.

---

## Recurring runs

Weekly series only in v1 — not arbitrary recurrence rules.

- A series has a local weekday, local start/end time, IANA timezone, start date, and `valid_until`.
- `valid_until` is at most **12 weeks** out from creation or renewal.
- Charlottetown defaults to `America/Halifax`.
- **Store local recurrence values, not one UTC instant.** A 7pm run must stay at 7pm across a
  daylight-saving change rather than quietly becoming 6pm.
- Organizers may edit or cancel a single occurrence; a small exceptions table records a cancelled
  or time-shifted one. **Renewing or deactivating a whole series is not built yet** — see the open
  decisions table.
- Public discovery queries return a bounded window — the next **14 days**.
- A player's **own** schedule may look ahead **84 days**, the longest a series can legally run,
  because those occurrences are ones they already host or joined. Both bounds live in
  `RUN_SERIES` in `packages/shared` and are applied by `runWindowDays()` in the mobile client.
  `upcoming_runs()` itself does not yet cap `p_days`.

Runs go stale the same way check-ins do. A weekly run from an organizer who lost interest misleads
people for months, so a series must be renewed rather than living forever.

## Session community

- A recurring run is a template. Membership, chat, posts, and media attach to one dated occurrence.
- A player explicitly joins an occurrence; the organizer is automatically a member.
- Session chat is readable and writable only by joined participants.
- Session posts and their media are publicly readable in the nearby regional feed.
- Only joined participants can publish a post for that session.
- Images and short videos are supported. Video clips are capped at **30 seconds** and uploads at
  **25 MB**. The database stores ownership and media metadata; objects live in the dedicated
  `session-media` bucket.
- There are no private direct messages, followers, likes, or comments in this phase.

---

## User-submitted venues

Before the form opens, show every active venue within **150 m** and ask: **"Is it one of these?"**

Most duplicates come from someone failing to find an entry that already exists — usually because
it has no name. In a live sample of inner London, 606 of 627 pitches were unnamed; in
Charlottetown, not one basketball court has a name. Prevention beats cleanup.

If the user continues:

- Name, pin location, at least one sport, and indoor/outdoor/unknown are required.
- The server calculates nearby duplicate candidates.
- The submission enters `pending` or `possible_duplicate`.
- The submitter sees its status with an **Under review** label; other users do not see it at all,
  and it cannot host a public check-in until approved.
- An admin approves as new, approves by merging into an existing venue, or rejects.

Out of scope for v1: reporting, appeals, reputation scoring, community moderation.

---

## Venue verification

Publication state and verification are **different things** and must not be conflated:

- **Status**: `active`, `merged`, `removed` — is this venue published?
- **Verification**: `unverified`, `admin_verified`, `community_verified` — how much do we trust it?

For v1, a human-reviewed OSM venue or an approved submission may be marked `admin_verified`.

`community_verified` is a **reserved state with no automatic path into it**. Thresholds based on
distinct location-gated check-ins have to be designed from real usage data. Picking numbers now —
"5 check-ins from 3 users in 14 days" — would be inventing them with nothing to calibrate against.

---

## MVP scope

**In:** email auth and session persistence · profile with display name and sports · region-aware
venue map and list · sport filters · venue detail with current activity · location-gated check-in,
checkout, extension, auto-expiry · optional note and party size · weekly runs with renewal · OSM
import for Charlottetown · admin import review · user submissions with minimal approval ·
duplicate prevention and safe merges · dated-session membership and private session chat · public
regional session feed with photos and 30-second clips · realtime refresh · migrations, seed,
generated types, database tests.

**Out:** friends/followers/squads · direct messages or venue-wide chat · likes and comments · skill
ratings and matchmaking · tournament brackets · push notifications ·
background location · public location history · automated verification thresholds · automatic
merging · automatic OSM-to-published reconciliation · multi-language · payments.

---

## Success

The MVP has validated the concept when a Charlottetown user can:

1. open the app and find a real nearby venue for a chosen sport
2. trust that duplicate or stale pins are uncommon and correctable
3. see whether players are there now
4. check in with low friction while physically nearby
5. watch that presence disappear reliably on checkout or expiry
6. find a recurring run without joining a social network

Early metrics: weekly actives · view-venue → check-in conversion · distinct venues with ≥1 check-in
per week · manual checkout vs expiry ratio · runs viewed and renewed · submissions prevented as
duplicates · venue corrections per active venue.

Do not optimize growth features until this loop is measurably used.

---

## Open decisions — owners only

Agents and contributors must **stop and ask** rather than silently choosing.

| Decision                      | Status                                                                                           | Needed by          |
| ----------------------------- | ------------------------------------------------------------------------------------------------ | ------------------ |
| ~~App name~~                  | **Decided: Drop In.** slug `drop-in`, scheme `dropin://`                                         | ~~store builds~~   |
| ~~Bundle identifier~~         | **Decided: `com.playdropin.app`**, both platforms — see below                                    | ~~store builds~~   |
| ~~Auth method~~               | **Decided: passwordless email magic links, plus Apple and Google**                               | ~~Phase 2~~        |
| ~~Browse without an account~~ | **Decided: read-only browsing allowed**; check-in, runs and submissions require an account       | ~~Phase 2~~        |
| ~~Initial public sports~~     | **Decided: basketball, soccer, volleyball, pickleball, tennis**                                  | ~~Charlottetown~~  |
| ~~Check-in identity display~~ | **Decided: display name + party size while active**                                              | ~~Phase 3~~        |
| ~~Location threshold~~        | **Decided: 250 m, accuracy ≤100 m**                                                              | ~~Phase 3~~        |
| ~~Party-size cap~~            | **Decided: 20**                                                                                  | ~~Phase 3~~        |
| ~~Run lifetime~~              | **Decided: 12 weeks**                                                                            | ~~Phase 4~~        |
| ~~Production map provider~~   | **Decided: Mapbox on all platforms**, `VenueMap` seam kept                                       | ~~public beta~~    |
| Series renewal                | organiser extends `valid_until` by up to 12 more weeks — no RPC exists, a lapsed series is stuck | before public beta |
| Venue-to-venue merge          | admin-only `merge_venues()` — not built, so the `merged` status is unreachable                   | before public beta |
| Activating `ice-hockey`       | leave inactive — rink access is not pickup play                                                  | owner call         |
| Venue correction flow         | admin contact form before community editing                                                      | public beta        |

Struck-through rows are settled and are recorded here so nobody reopens them. The remaining rows
are genuinely open: **stop and ask** rather than choosing one.

`ice-hockey` is seeded **inactive** — well represented in PEI data, but rink access works
differently from pickup play, so activating it is an owner call.

**Bundle identifier.** `com.playdropin.app` is what `apps/mobile/app.config.ts` declares for both
platforms and what the generated native project builds. Sign in with Apple binds to the App ID and
Google's iOS OAuth client binds to the bundle ID, so this string must match what is registered in
the Apple Developer portal and in Google Cloud. If the registered identifier is really
`com.dropin.app`, change `APP_IDENTIFIER` in `app.config.ts` and re-run
`npx expo prebuild --clean` — editing the config alone never reaches an existing `ios/` directory.
