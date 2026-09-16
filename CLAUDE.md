# Working in this repository

Instructions for contributors and AI coding agents. Read this file before modifying code.

This file defines **how work is performed** in this repository.

Product behavior belongs in `docs/product-rules.md`.
System structure and build order belong in `docs/architecture.md`.
Detailed implementation reference belongs in `docs/reference.md`.
Database migrations and database tests define enforceable backend business rules.

Do not duplicate large sections of those documents here.

---

## Source of truth

**Migrations and database tests are the source of truth for database-enforced business rules.**

If a rule exists in `supabase/migrations/` and is also implemented in a client, the database is authoritative. A disagreement means the client is wrong.

Use the repository sources in this order:

1. `supabase/migrations/` and `supabase/tests/` for database rules, security, RLS, constraints, and transactional behavior.
2. `docs/product-rules.md` for product decisions.
3. `docs/architecture.md` for system boundaries, build order, and architectural decisions.
4. `docs/reference.md` for the detailed implementation reference.
5. Generated database types for the schema exposed to TypeScript.
6. `packages/shared` for small constants and types that intentionally mirror authoritative rules.

`packages/shared` may mirror database constraints so clients can provide immediate validation. It does not own those constraints.

Do not create a second source of truth for the same rule.

---

## Work from the repository that exists now

Before modifying code:

1. Run `git status` and inspect the current branch.
2. Preserve unrelated user changes.
3. Read the relevant repository documentation.
4. Inspect the actual implementation, tests, migrations, generated types, and package scripts before making assumptions.
5. Run the existing verification checks necessary to establish a baseline.

The repository is authoritative about its current implementation.

Do not rely on summaries, old plans, assumptions, or descriptions when the current code can answer the question.

If documentation disagrees with executable migrations or tests, investigate the mismatch instead of silently choosing one.

---

## Build one phase at a time

Follow the build order in `docs/architecture.md`.

Do not implement speculative future phases while working on the current phase.

Do not create realistic fake implementations that future work could mistake for completed functionality.

A clearly labeled placeholder is acceptable where the architecture explicitly requires one.

A fake venue list, fake successful mutation, mocked production workflow, or hard-coded screen data presented as real application behavior is not acceptable.

Complete the smallest coherent vertical slice and keep the repository green before moving forward.

---

## Code quality

Write code for the person who has to understand it six months from now.

Prefer:

- small cohesive modules;
- descriptive names;
- explicit data flow;
- narrow interfaces;
- composition over giant components or functions;
- early returns over deeply nested branches;
- existing project abstractions over parallel implementations;
- generated types over manually recreated database types;
- deleting unnecessary code over hiding it behind abstractions;
- one authoritative implementation of a concept.

### Keep routes thin

Files in `apps/mobile/app/` assemble feature components and routing behavior.

They must not contain:

- SQL-shaped data access;
- database business rules;
- complex transformation logic;
- duplicated validation rules;
- large reusable UI implementations.

Domain queries, mutations, services, hooks, and transformations belong in their appropriate feature modules.

### Avoid duplication deliberately

Before adding a helper, component, hook, constant, type, query, RPC wrapper, or utility:

1. Search the repository for an existing implementation.
2. Reuse or extend the existing owner when it represents the same concept.
3. Do not create two abstractions for the same domain responsibility.

Do not apply DRY mechanically.

Code that merely looks similar does not automatically represent the same concept. Prefer a small amount of local duplication over a bad shared abstraction that couples unrelated features.

Extract shared code when the shared concept is real and stable.

### Keep functions and modules focused

A function should have one clear responsibility.

If a function performs validation, persistence, transformation, analytics, UI state management, and error formatting at once, split the responsibilities.

Avoid files that become dumping grounds for unrelated helpers.

Place code beside the feature that owns it unless it is genuinely shared.

### Avoid unnecessary dependencies

Before adding a package, confirm that:

- the repository does not already have an appropriate solution;
- the platform or standard library does not already solve the problem;
- the dependency is compatible with the current Expo/React Native environment where applicable;
- the maintenance cost is justified.

Commit intentional lockfile changes.

Do not introduce a dependency to save a few lines of straightforward code.

---

## Comments and documentation

### Comments describe the current code

Source-code comments, docstrings, and JSDoc must describe the **current behavior, current constraint, current invariant, or current reason the code exists**.

Comments are not a changelog.

Do not leave comments such as:

- `previously we...`
- `this used to...`
- `old implementation...`
- `changed from...`
- `after the refactor...`
- `this replaces...`
- `temporary fix for the old...`

Historical implementation details belong in Git history, commit messages, pull requests, or an architecture decision record when the history is important to future decisions.

A comment may describe a compatibility constraint when that constraint still exists.

Good:

```ts
// SecureStore is unavailable on web, so web sessions use the web storage adapter.
```

Bad:

```ts
// We used SecureStore before but changed this when web stopped working.
```

### Explain why, not what

Do not narrate obvious code.

Bad:

```ts
// Increment count
count += 1;
```

Useful comments explain things the code cannot express clearly on its own:

```ts
// Refetch the authoritative aggregate instead of incrementing locally because
// Realtime events can be missed during reconnects.
```

### No commented-out code

Delete unused code.

Git already preserves history.

Do not leave blocks of commented-out implementations for possible future use.

### TODOs must be actionable

Do not leave speculative TODOs throughout the codebase.

A TODO must represent real remaining work, explain what is missing, and contain enough context for another contributor to act on it.

Future product ideas belong in the appropriate planning document rather than source-code TODOs.

### Documentation describes the repository as it exists

README files and developer documentation should describe commands, architecture, and behavior that currently exist.

When implementation changes make documentation incorrect, update the documentation in the same change.

Do not leave stale commands or obsolete architecture descriptions.

---

## TypeScript standards

Use the strongest practical type information available.

Do not use broad escape hatches to make errors disappear.

Avoid:

- `any`;
- broad type assertions;
- `@ts-ignore`;
- `@ts-nocheck`;
- disabling ESLint rules for entire files;
- weakening compiler settings;
- duplicating generated database types manually.

If a narrow suppression is genuinely required, scope it to the smallest possible location and explain the current technical reason.

Fix the type problem rather than hiding it whenever possible.

Validate data at trust boundaries.

Do not assume external API responses, database JSON, environment variables, route parameters, or persisted client state are valid merely because TypeScript declares a type.

---

## Error handling

Failures must be explicit.

Every mutation should have appropriate handling for:

- pending state;
- successful completion;
- validation failure;
- authorization failure where applicable;
- network or infrastructure failure.

Do not convert a failed operation into apparent success.

Do not swallow errors silently.

Do not expose raw database errors, stack traces, secrets, internal SQL, or sensitive implementation information to users.

Preserve enough diagnostic context for developers while presenting safe, useful messages to users.

---

## Database and security rules

1. **No service-role credential in a client.** Not in `VITE_*`, `EXPO_PUBLIC_*`, Expo `extra`, source files, logs, generated bundles, or test snapshots.

2. **No client-side writes to privileged state.** Review status, merges, verification state, and admin roles change only through authorized database functions.

3. **No automatic venue merging.** Duplicate detection proposes candidates. A human decides.

4. **No cron-dependent public correctness.** A check-in is active when:

   ```sql
   ended_at is null and expires_at > now()
   ```

   Cleanup may update expired rows, but public correctness cannot depend on cleanup having run.

5. **Never overwrite human-reviewed venue fields during re-import.**

6. **Every exposed table requires both RLS and explicit grants.**

7. **Every RLS, authorization, or transactional business-rule change requires corresponding database tests.**

8. **Important multi-row writes must be transactional.**

9. **Exact device coordinates used for check-in validation must not be retained unless the product rules explicitly change.**

10. **Never weaken RLS to make client code easier. Fix the client or RPC instead.**

---

## Database conventions

### IDs

Use `bigint identity` for small lookup tables.

Use `uuid` for public-facing entities and entities referenced by user activity such as venues and check-ins.

### Functions

Business-rule functions:

- set `search_path = ''`;
- schema-qualify referenced database objects;
- schema-qualify extension types such as `extensions.geography`;
- explicitly qualify authentication helpers;
- validate the caller;
- grant execution only to intended roles.

Use `SECURITY DEFINER` only when required for the security model.

When it is required, include a comment explaining the **current security reason** for it.

### Generated database types

Never hand-edit generated database types.

After every migration:

```bash
npm run db:types
```

Review the generated diff and commit it with the migration.

Unexpected generated changes must be investigated rather than accepted automatically.

---

## Testing standards

Tests are part of the implementation, not cleanup work after implementation.

### Every meaningful change must be tested

New behavior should include tests at the lowest useful level.

Test observable behavior and contracts rather than private implementation details.

Include relevant:

- expected behavior;
- boundary conditions;
- validation failures;
- authorization failures;
- error handling;
- concurrency behavior;
- expiration/time behavior;
- privacy behavior.

Not every change needs every category. Test the risks introduced by the change.

### Bug fixes require regression tests

When fixing a reproducible bug, add or update a test that fails because of the bug and passes after the fix whenever the behavior can reasonably be automated.

Do not fix a bug while leaving the same regression unprotected.

### Database changes require database tests

Any change involving:

- RLS;
- grants;
- authorization;
- RPC validation;
- transactional rules;
- merge behavior;
- visibility;
- expiry;
- ownership;
- concurrency;

must add or update the corresponding database test.

Test relevant anonymous, authenticated-owner, authenticated-other-user, and admin behavior where applicable.

### Keep tests deterministic

Tests must not depend unnecessarily on:

- execution order;
- real wall-clock delays;
- external public APIs;
- mutable external services;
- random uncontrolled data.

Use controlled fixtures and seeded data.

Do not make tests pass by increasing arbitrary sleeps.

---

## Keep the repository green while working

Run the narrowest relevant tests during implementation so failures are discovered close to the change that caused them.

After each coherent slice, run the repository check gate.

Do not allow unrelated failures to accumulate until the end.

Never silence a failing test, lint rule, compiler error, or security check merely to obtain a green command.

If a failing check exposes a real defect, fix the defect.

If a check is genuinely incorrect, change the check deliberately and explain why.

---

## Verification before commit

Before creating a commit:

1. Review `git status`.

2. Review the diff.

3. Confirm only intended files changed.

4. Remove debug output, temporary instrumentation, dead code, commented-out code, and accidental files.

5. Run:

   ```bash
   npm run check
   ```

6. If the database changed, also run:

   ```bash
   npm run db:test
   npm run db:types
   ```

7. Confirm generated files and lockfile changes are intentional.

A commit should represent a coherent, understood state.

Prefer green milestone commits over large mixed-purpose commits.

---

## Verification before every push

**Never push unverified code.**

A push is allowed only when the verification required by the affected repository areas has completed successfully.

At minimum, the repository-wide check gate must pass.

For the complete application verification gate, run the repository-supported equivalents of:

- formatting;
- lint;
- TypeScript checks for every workspace;
- frontend unit/component tests;
- Python importer tests;
- database/pgTAP tests;
- admin production build;
- Expo web export/bundle;
- client bundle credential scan;
- Expo dependency/SDK alignment checks.

For changes affecting runtime user journeys, also exercise the relevant application flow before pushing.

For changes affecting UI layout or presentation, visually inspect the affected screens at representative supported sizes before pushing.

For changes involving authentication, RLS, check-ins, Realtime, venue review, merges, expiry, or other critical flows, test the actual behavior rather than relying only on compilation.

### A failed check blocks the push

Do not:

- use `--no-verify` to bypass a failing hook;
- skip a required test because the change appears small;
- disable a test to make the suite green;
- push with a known build failure;
- push while required generated database types are stale;
- push with unresolved bundle credential-scan failures.

If a required check cannot be run because of missing credentials, unavailable infrastructure, platform limitations, or another real blocker:

**do not push.**

Leave the work locally committed if appropriate and report:

- which check could not run;
- why it could not run;
- what was successfully verified;
- what remains unverified.

“Should work” is not verification.

Report actual command results.

---

## Source control behavior

Preserve unrelated user work.

Do not use destructive Git commands against work you did not create.

Do not rewrite history unless the repository owner explicitly requests it.

Do not force-push unless explicitly authorized.

Do not commit secrets, credentials, local `.env` files, temporary artifacts, or unrelated generated files.

Before pushing:

```bash
git status
```

The working tree must contain only understood and intentional changes.

Inspect what will be pushed.

Make coherent commits at green milestones.

---

## Performance and unnecessary work

Do not optimize blindly, but avoid obviously wasteful behavior.

Watch for:

- unnecessary React rerenders;
- repeated network requests;
- duplicate Supabase queries;
- fetching data that is already available;
- large computations during render;
- repeated transformations that can be performed once at the appropriate boundary;
- N+1 database access patterns;
- unbounded queries;
- subscriptions that remain active after their screen loses focus.

Measure or establish evidence before introducing complicated performance architecture.

Do not trade readability for hypothetical micro-optimizations.

---

## Accessibility is part of correctness

New UI must consider:

- accessible labels and roles;
- keyboard/focus behavior where applicable;
- touch-target size;
- dynamic text;
- color contrast;
- Reduce Motion;
- Reduce Transparency;
- map/list alternatives where maps are not usable.

Do not treat accessibility as final polish.

---

## Product boundaries

Do not invent product behavior to unblock implementation.

When a required product decision is unresolved, use the current decision list in `docs/product-rules.md`.

Do not maintain a second copy of the open-decision list in this file.

If a necessary decision is genuinely unresolved, stop at that decision boundary and ask the owner rather than silently choosing.

Continue any independent work that does not depend on the unresolved decision.

---

## Before saying the work is complete

Do not claim completion because code compiles.

Confirm the applicable:

- automated checks pass;
- database tests pass;
- generated types are current;
- builds complete;
- bundle credential scanning passes;
- runtime flow works;
- relevant UI has been visually inspected;
- working tree contains only intended changes.

When reporting completion, include the commands actually run and their results.

If something was not verified, say exactly what remains unverified.

Never convert an assumption into a claimed result.
