# Drop In design system

How the mobile app looks and behaves, and where each rule lives in code. Tokens
are in `apps/mobile/src/theme/tokens.ts`; components are in
`apps/mobile/src/components/ui/`. A screen composes these — it does not restyle
them.

## Principles

- **Colour carries meaning.** Colours are named for what they signal: `live`
  (green — playable, happening, your action), `soon` (amber — upcoming, needs
  attention), `info` (blue), `alert` (coral — errors and destructive actions).
  Everything else is ink on warm off-white. Green is kept for actions and live
  activity, which is why selected tabs are raised white segments, not green.
- **Light only.** There is no dark palette; `userInterfaceStyle` is `light`.
- **Surfaces are for grouping.** Cards and grouped lists hold content that
  belongs together. Glass is used only for chrome floating over the map, and
  becomes opaque under Reduce Transparency.
- **Motion confirms, it does not decorate.** Presses scale to 97%; dialogs and
  sheets enter with a strong ease-out under 300 ms and leave faster; toasts drop
  from the top. Reduce Motion keeps fades and removes movement. Nothing animates
  on actions people repeat constantly.
- **Accessible by default.** Touch targets are at least 44 pt, text respects the
  system size (capped so layouts hold), headings are marked as headers, errors
  are announced, and every long-press action is also a screen-reader action.

## Tokens

| Token         | Values                                                                    | Use                                                    |
| ------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| `space`       | 2, 4, 8, 12, 16, 24, 32, 48                                               | All padding, gaps and margins                          |
| `radius`      | sm 8, md 12, lg 16, xl 20, pill                                           | Controls md; cards and lists lg; sheets and dialogs xl |
| `typeScale`   | display 34, title 28, heading 18, body 15, caption 13, micro 11, score 28 | `display` for page titles, `heading` for sections      |
| `motion`      | 120–260 ms, `easeOut`, `easeInOut`, press scale 0.97                      | Every animation                                        |
| `elevation`   | `card`, `floating`                                                        | Cards; dialogs, sheets and map chrome                  |
| `sportColors` | one colour per sport                                                      | Sport badges, chips and map markers                    |

## Components

| Component                                 | Use it for                                                                                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppText`                                 | All text. `variant` from the type scale, `tone` for meaning                                                                                  |
| `Button`                                  | Actions. `solid` for the primary action, `soft`/`outline` for secondary, `ghost` for Cancel beside a primary; `tone="alert"` for destructive |
| `IconButton`                              | Icon-only actions; always pass `label`                                                                                                       |
| `Chip`                                    | Filters and small status tags                                                                                                                |
| `SegmentedControl`                        | Switching views of the same content (Upcoming/Past, Details/Chat/Photos)                                                                     |
| `TextField`                               | Every text input: visible label, hint, error, optional character count                                                                       |
| `Card`                                    | A white surface grouping related content; pass `onPress` to make the whole card a target                                                     |
| `ListSection`, `ListRow`                  | Settings-style lists with icons, subtitles and chevrons                                                                                      |
| `Notice`                                  | Inline errors, warnings, confirmations and information on the current screen                                                                 |
| `ConfirmDialog`, `Dialog`                 | Decisions with consequences, such as leaving a session or deleting an account                                                                |
| `Sheet`                                   | Choices tied to something on screen, such as the report and block flow                                                                       |
| `useToast()`                              | Brief confirmation that something happened ("Report sent")                                                                                   |
| `ScreenHeader`                            | The large title and actions at the top of a tab                                                                                              |
| `Avatar`                                  | A player's initials                                                                                                                          |
| `EmptyState`, `Skeleton`, `LoadError`     | Empty, loading and could-not-load states, shaped like the content they stand in for                                                          |
| `ActivityBadge`, `LivePulse`, `ScoreStat` | Live activity signals; the pulse renders only when something is live                                                                         |
| `AdaptiveGlassSurface`, `ResultsSheet`    | Map chrome and the draggable results panel                                                                                                   |
| `BrandMark`, `SportBadge`                 | Brand lockup and sport identity                                                                                                              |

## Patterns

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
- **Forms:** one `TextField` per value with a real label; put guidance in
  `hint`, validation in `error`, and limits from `@dropin/shared` in
  `maxLength`.
- **Empty and signed-out states:** `EmptyState` with one action that moves the
  player forward.
- **Screens under a navigation header** use `Screen insetTop={false}` and do not
  repeat the header's title.

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
npm run test:browser:supabase -- --project-ref=YOUR_PROJECT_REF
npm run test:presence -- --project-ref=YOUR_PROJECT_REF --browser
node scripts/tests/account-deletion.mjs --project-ref=YOUR_PROJECT_REF
npm run test:browser:venues -- --project-ref=YOUR_PROJECT_REF
```

The first three need no credentials: the public test stubs email delivery, the
location test checks which screens require location, and the unreachable test
refuses every API request in the browser to check what players see when the
server cannot be reached. The hosted tests need a
Supabase management token (`SUPABASE_ACCESS_TOKEN`) and an explicit project
matching the root configuration; they create temporary accounts, exercise the UI
with two accounts, and clean up in `finally`. The admin website test is described
in the [admin guide](admin-app.md). Screenshots are written to gitignored
`test-results/ui/`.

## Preview captures

- [Live map](ui-preview/live.png)
- [Sign in](ui-preview/welcome.png)
- [Admin dashboard, with test data](ui-preview/admin.png)

## Verification limits

Browser checks and web exports do not verify signed native builds, physical
permission settings, native sign-in or media capture. Track remaining work in
[TODO](../TODO.md).
