# Drop In design system

How the mobile app looks and behaves, and where each rule lives in code. Tokens
are in `apps/mobile/src/theme/tokens.ts`; components are in
`apps/mobile/src/components/ui/`. A screen composes these — it does not restyle
them. The admin website follows the same rules in plain CSS; see
[Admin website](#admin-website).

## The idea

Drop In is a scoreboard for the neighbourhood: where people are playing now, and
what is on later. The interface is built like a printed box score — ink on
white, ruled rows, large condensed numerals — so that the one thing it adds,
colour, can carry the one thing that matters.

## Principles

- **Green means live.** Green marks people playing right now and the actions
  that put a player among them (checking in, going). Nothing else is green: not
  the selected tab, not ordinary buttons, not the player's own chat bubbles. A
  screen with no live activity on it has no green on it. Amber (`soon`) marks
  on-the-way and needs-attention; red (`alert`) marks errors and destructive
  actions. Everything else is ink.
- **Sports are told apart by shape.** Each sport has a glyph, drawn in ink.
  There is no colour per sport, because colour is taken.
- **Two voices.** Barlow Condensed carries titles, numbers, small-capital
  labels and buttons. The platform's own font carries sentences.
- **Rows, not cards.** A list is rows divided by rules, sitting on the page. A
  card is for the rare thing that is one object rather than a line in a list.
  Only surfaces that float over the page or the map cast a shadow.
- **One primary action per screen.** Detail screens pin it at the bottom in an
  `ActionBar`. A row carries at most one control. Two solid buttons side by side
  means one of them should be outlined.
- **Say what it is.** A title names the screen. There is no tagline under it,
  no illustration in an empty list, and no encouragement where an instruction
  would do.
- **Tap, don't type.** Dates, times and durations are picked from what is
  possible. Text fields are for names and messages.
- **Light only.** There is no dark palette; `userInterfaceStyle` is `light`.
- **Motion confirms, it does not decorate.** Presses scale to 97%; dialogs and
  sheets enter with a strong ease-out under 300 ms and leave faster; toasts drop
  from the top. Reduce Motion keeps fades and removes movement. Nothing animates
  on actions people repeat constantly.
- **Accessible by default.** Touch targets are at least 44 pt, text respects the
  system size (capped so layouts hold), headings are marked as headers, errors
  are announced, and every long-press action is also a screen-reader action.

## Tokens

| Token       | Values                                                                                              | Use                                                             |
| ----------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `palettes`  | white `background` and `surface`, grey `surfaceMuted`, ink `text`, `live`, `soon`, `alert`          | Colour by meaning; text on a tint uses the matching `…Text`     |
| `space`     | 2, 4, 8, 12, 16, 24, 32, 48                                                                         | All padding, gaps and margins; the page gutter is 16            |
| `radius`    | xs 4, sm 6, md 10, lg 14, xl 18                                                                     | Tags xs; chips sm; controls md; maps and cards lg; sheets xl    |
| `fonts`     | `display` (Barlow Condensed Bold), `displayMedium` (SemiBold)                                       | Loaded in the root layout; never combined with `fontWeight`     |
| `typeScale` | display 40, title 32, heading 22, label 13 caps, button 19, body 16, caption 14, micro 12, score 44 | `display` for tab titles, `title` for a detail screen's subject |
| `motion`    | 120–260 ms, `easeOut`, `easeInOut`, press scale 0.97                                                | Every animation                                                 |
| `elevation` | `floating`                                                                                          | Dialogs, sheets, toasts and panels over the map                 |

## Components

| Component                             | Use it for                                                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `AppText`                             | All text. `variant` from the type scale, `tone` for meaning                                                                   |
| `Button`                              | Actions. Ink by default; `tone="live"` for check-in and going; `outline` for the alternative, `ghost` for the least important |
| `IconButton`                          | Icon-only actions; always pass `label`. `filled` for the one primary action in a header                                       |
| `Chip`                                | One choice among several: sport filters, durations, repeats. Selected is ink                                                  |
| `Tag`                                 | A state in small capitals: GOING, HOSTING, CANCELLED. Never tappable                                                          |
| `SegmentedControl`                    | Switching sections of one page (Upcoming/Past, Details/Chat/Photos), as underlined text tabs                                  |
| `TextField`                           | Every text input: visible label, hint, error, optional character count                                                        |
| `ListSection`, `ListRow`              | Rows divided by rules, with optional icon, subtitle, trailing control and chevron                                             |
| `Stat`                                | One scoreboard figure: a large number or time over a small-capitals label                                                     |
| `ActionBar`                           | The primary action of a detail screen, pinned above the home indicator                                                        |
| `Card`                                | A white panel for a single object, such as the profile summary                                                                |
| `Notice`                              | Inline errors, warnings, confirmations and information on the current screen                                                  |
| `ConfirmDialog`, `Dialog`             | Decisions with consequences, such as leaving a session or deleting an account                                                 |
| `Sheet`                               | Choices tied to something on screen, such as the report and block flow                                                        |
| `useToast()`                          | Brief confirmation that something happened ("Report sent")                                                                    |
| `ScreenHeader`                        | The title and actions at the top of a tab                                                                                     |
| `Avatar`                              | A player's initials                                                                                                           |
| `EmptyState`, `Skeleton`, `LoadError` | Empty, loading and could-not-load states, shaped like the content they stand in for                                           |
| `LivePulse`, `ConditionChip`          | The live marker, which renders only when something is live, and a venue condition                                             |
| `ResultsSheet`                        | The draggable results panel over the map                                                                                      |
| `BrandMark`, `SportBadge`             | The wordmark and a sport's glyph                                                                                              |

Feature components built from these and reused across screens: `VenueRow`
(`features/venues`), `SessionRow` (`features/community`) and `SessionTimeFields`
(`features/runs`, the day, start and length picker).

## Patterns

- **Lists:** rows on the page with a rule under each. The trailing edge holds the
  figure or the one control; a chevron shows that the row opens something.
- **Detail screens:** the subject as a `title`, one muted line of facts, a row of
  `Stat`s between two rules, then labelled sections. The primary action goes in
  an `ActionBar`; secondary ones are `ListRow`s in the content.
- **Errors:** pass the caught error through `userMessage(error, fallback)` and
  show it in a `Notice` (or a toast only when nothing on screen changed). Never
  render `error.message` directly.
- **Loading and failure:** choose between `Skeleton`, `LoadError` and content
  with `loadPhase(query)`, never `isPending` or `isError`. Loaded content stays
  on screen when a refresh fails; `LoadError` stays on screen while retries run
  and takes `retrying={query.isFetching}`.
- **Destructive actions:** confirm in a `ConfirmDialog` whose confirm button
  says exactly what happens ("Delete permanently"). Disable dismissal while the
  action runs.
- **Forms:** what, then when, then where. One `TextField` per typed value with a
  real label; put guidance in `hint`, validation in `error`, and limits from
  `@dropin/shared` in `maxLength`. Choices are `Chip`s.
- **Empty and signed-out states:** `EmptyState` with one sentence and one action
  that moves the player forward.
- **Screens under a navigation header** use `Screen insetTop={false}` and do not
  repeat the header's title.
- **The map** uses a muted basemap (`MAP_STYLE_URL`). Venue pins are solid ink,
  session pins are outlined, and a live count is the only saturated colour on it.

## Icon, splash screen and favicons

The app icon is the name stacked on ink. The splash screen is the wordmark on
the page's white, so the first screen appears without a change of colour. Both
favicons are the initial and its full stop on an ink tile.

`node scripts/brand-assets.mjs` draws all of them from the brand colours in
`tokens.ts` and the Barlow Condensed file the app loads. Change those and run
it; do not edit the images by hand. The colours behind the Android icon and the
splash image are set in `apps/mobile/app.config.ts`, and a native project picks
up any of this only after `npx expo prebuild`.

## Admin website

`apps/admin/src/index.css` applies the same language to the admin website: the
wordmark, ink on white, Barlow Condensed (from `@fontsource/barlow-condensed`)
for titles, figures, small-capital labels and buttons, ruled rows and tables in
place of cards, and the dashboard totals as a row of scoreboard figures. Its
colour variables mirror `tokens.ts` and are changed together with it.

Nothing on the admin website is live, so the only green there is the full stop
in the wordmark. Primary and publishing actions are ink, removing content is
red, and a record waiting on a person is amber. Review panels show the evidence
first and the decision under an ink rule.

## Working with Claude Design

`tokens.ts` is the single source of the visual language. When a design made in
Claude Design changes colours, type, spacing or corners, change the matching
token rather than individual screens; a new pattern becomes a component in
`components/ui` with the same conventions (semantic props, token-only styling,
accessibility labels). Running `/design-sync` in Claude Code can publish this
component library to a claude.ai/design design-system project so new mockups
start from the components the app already has.

## Browser checks

With the mobile web app on port 8081 and admin app on port 5173:

```bash
npx playwright install chromium
npm run test:browser
npm run test:browser:location
npm run test:browser:unreachable
npm run test:browser:signed-in
npm run test:browser:supabase -- --project-ref=YOUR_PROJECT_REF
npm run test:presence -- --project-ref=YOUR_PROJECT_REF --browser
node scripts/tests/account-deletion.mjs --project-ref=YOUR_PROJECT_REF
npm run test:browser:venues -- --project-ref=YOUR_PROJECT_REF
npm run test:browser:moderation -- --project-ref=YOUR_PROJECT_REF
```

The first four need no credentials: the public test stubs email delivery, the
location test checks which screens require location, the unreachable test
refuses every API request in the browser to check what players see when the
server cannot be reached, and the signed-in test stores a session and stubs the
API to check the request each signed-in action sends (check-in, creating and
editing a session, answering, chat, leaving, cancelling, adding a venue, the
profile, sign-out and account deletion). The hosted tests need the project's
secret key (`SUPABASE_SECRET_KEY` in `.env`, or `SUPABASE_ACCESS_TOKEN` to look
it up) and an explicit project matching the root configuration; they create
temporary accounts, exercise the UI with two or three of them, and clean up in
`finally`. The moderation test reports a post and a message in the app, removes
one and dismisses the other in the admin website, then blocks and unblocks the
author. The admin website test is described
in the [admin guide](admin-app.md). Screenshots are written to gitignored
`test-results/ui/`.

## Preview captures

- [Live map, with test data](ui-preview/live.png)
- [Sign in](ui-preview/welcome.png)
- [Admin dashboard, with test data](ui-preview/admin.png)

## Verification limits

Browser checks and web exports do not verify signed native builds, physical
permission settings, native sign-in or media capture. Track remaining work in
[TODO](../TODO.md).
