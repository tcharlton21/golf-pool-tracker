# Slice 8 — Full-Loop Hardening

## Goal

Wire everything slices 0–7 built into a shippable product: the onboarding flow
("track this project" via UI), explicit error surfaces, `npx @hub/cli start`
packaging, and the money test — the scripted, headless, mock-LLM end-to-end proof
that the sync loop actually works. This slice adds no new sync/graph/semantic
mechanics; it hardens and ships what already exists.

## Required reading

All of it: `CLAUDE.md`, `docs/VISION.md`, `docs/ARCHITECTURE.md`,
`docs/DATA_MODEL.md`, `docs/SYNC_PIPELINE.md`, `docs/STACK.md`, `docs/TESTING.md`
(esp. the money test section), `docs/ROADMAP.md`, `docs/RISKS.md`.

## Scope

- `packages/web/src/components/Onboarding/OnboardingFlow.tsx` — "track this
  project" UI: pick a local repo path, call `hub track`, show initial full-scan
  progress, land on the L0 graph view once ready.
- `packages/web/src/components/ErrorSurfaces/` — visible, explicit states for
  extraction failure ("skeleton stale since `<time>`"), LLM-unreachable, and
  repeated hooks-not-firing — wiring slice 4's hook-health and slice 7's status
  bar into full error-state UI; no new detection logic, only presentation of
  states those slices already compute.
- `packages/server/src/cli/start.ts` — `hub start`: boots the server on port 4820
  and opens the browser.
- `packages/server/src/cli/reindex.ts` — `hub reindex`: rebuilds the SQLite cache
  from tracked repos + `.arch/`, per `docs/RISKS.md`'s merge-conflict mitigation.
- Packaging: `packages/server`'s `package.json` published under the npm name
  `@hub/cli` with a `bin` entry (`hub`), so `npx @hub/cli start` boots the whole
  app; a build step bundling `packages/web`'s static output into what
  `packages/server` serves at `/`.
- `e2e/slice-8/money-test.spec.ts` — the canonical scripted E2E, exactly as
  specified in `docs/TESTING.md`'s "The money test" section.
- `fixtures/mock-llm/scenarios/money-test/` — the scripted canned-response
  sequence the money test's job queue drains.

## Out of scope

Any new sync-loop mechanics, any new graph or semantic feature. This slice wires
and hardens what slices 0–7 already built; anything that looks like "one more
feature" belongs on `docs/ROADMAP.md`, not here.

## Interfaces consumed

Every interface exposed by slices 0–7: the hook installer (slice 4), extraction
(slice 2), graph store (slice 3), canvas/inspector (slice 5), job queue + mock
transport (slice 6), status bar (slice 7), terminal panel (slice 1, mounted in the
app shell).

## Interfaces exposed

None — this is the terminal node of the dependency graph. Its outputs are the
shippable product and the money test, not APIs for further slices.

## Definition of Done

1. `pnpm build` (repo-wide) exits 0.
2. Onboarding Playwright test: launch the app against a fresh fixture repo with no
   `.claude/settings.json`; complete the track flow via UI; assert hooks are
   installed (matches `fixtures/golden/settings.merged.json`) and the initial full
   scan completes, landing the user on the L0 graph view.
3. **The money test** (`e2e/slice-8/money-test.spec.ts`), headless, mock LLM
   transport, no real `claude` process: fresh fixture → track → fake-agent session
   (mutation scripts plus realistic `Stop`-hook POSTs) → UI shows updated skeleton
   and stale badges within 10 seconds → job queue drains → badges clear →
   `.arch/` diff matches `fixtures/golden/` for that scenario — exactly as
   specified in `docs/TESTING.md`.
4. Error-surface test: simulate an extraction failure (a file the analyzer can't
   parse); assert the status bar shows "skeleton stale since `<time>`" rather
   than a silent no-op or crash. Simulate an unreachable LLM transport; assert the
   amber "LLM unreachable, queue held" banner renders.
5. Packaging smoke test: `npx --yes @hub/cli start` (against the locally
   built/linked package in CI, not the real npm registry) boots the server on
   port 4820; `curl -s http://localhost:4820/api/health` returns 200; the static
   web build is served at `/`.
6. `pnpm verify` (all nine `verify:slice-N` scripts, 0 through 8, in order) exits
   0 end-to-end on a clean checkout.
7. `pnpm verify:slice-8` runs items 2–5 and exits 0.

## Verification

`verify:slice-8` = `playwright test e2e/slice-8 && vitest run packages/server/test/slice-8`

Asserts: onboarding flow correctness, the full money-test scenario (UI update
latency, queue drain, badge clearing, `.arch/` golden match), both named error
surfaces, and the packaging smoke test.

## Dependencies & parallelization

Needs all of slices 0–7, serially — this is the last slice. Nothing depends on it,
so it is not itself a bottleneck for other slices, but the critical path
0 → 2 → 3 → 4 → 6 → 8 determines the earliest it can start, and slice 7 must also
be complete first.
