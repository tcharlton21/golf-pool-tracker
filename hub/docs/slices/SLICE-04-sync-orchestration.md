# Slice 4 — Sync Orchestration

## Goal

Wire the actual sync loop: hook installer/uninstaller, the hook ingest endpoint,
chokidar + git watchers, and the debounce/coalesce state machine that turns
`Stop`/`PostToolUse`/watcher events into calls to the extraction engine and graph
store. This is the slice that makes "edit files → graph updates" real.

## Required reading

`CLAUDE.md` (esp. invariant 6 — hooks must never break or slow Claude Code),
`docs/VISION.md`, `docs/ARCHITECTURE.md` (Sync Orchestrator, Hook Ingest, FS
Watcher sections), `docs/SYNC_PIPELINE.md` (all of it — this is its slice),
`docs/RISKS.md` (risks 2 and 5), `docs/TESTING.md`.

## Scope

- `packages/server/src/sync/hook-installer.ts` — `hub track`/`hub untrack` logic:
  reads/creates `<repo>/.claude/settings.json`, deep-merges `Stop`, `SubagentStop`,
  `PostToolUse` (matcher `Edit|Write|MultiEdit|NotebookEdit`), and `SessionEnd`
  hook entries, each tagged with a marker field; idempotent on repeated `track`.
- `packages/server/src/http/routes/hooks.ts` — `POST /api/hooks/claude-code`:
  resolves `cwd` → tracked project, responds 200 in under 5ms, forwards the event
  fire-and-forget to the orchestrator.
- `packages/server/src/sync/dirty-set.ts` — per-project dirty-path accumulation
  from `PostToolUse` hints and chokidar events.
- `packages/server/src/sync/state-machine.ts` —
  `idle → dirty(accumulating) → extracting → semantic-pending → idle`, single-writer
  per project via an async mutex.
- `packages/server/src/sync/debounce.ts` — 1500ms debounce timer for
  `PostToolUse`/chokidar events; `Stop` bypasses debounce entirely.
- `packages/server/src/sync/watcher.ts` — chokidar over the tracked repo (ignoring
  `.git`, `node_modules`, `.arch`, gitignored paths) plus `.git/HEAD` and
  `.git/refs/**`; branch switch → bulk dirty via
  `git diff --name-only HEAD@{1} HEAD`.
- `packages/server/src/sync/orchestrator.ts` — wires dirty-set resolution
  (`git status --porcelain -z` ∪ hints) → `extraction/run.ts` →
  `GraphStore.applySkeletonDelta` → a semantic-enqueue extension point (a stub call
  in this slice; slice 6 supplies the real implementation behind it).
- `packages/server/src/sync/hook-health.ts` — tracks hook-vs-watcher-detected
  change mismatches; feeds the "hooks not firing" warning slice 7 renders.
- `packages/server/src/cli/track.ts`, `untrack.ts` — `hub track <repo>` /
  `hub untrack <repo>` CLI commands over the installer.

## Out of scope

The real semantic job queue and workers (slice 6 — this slice's enqueue point is a
stub, called but not implemented). Any UI (slices 5, 7). Packaging (slice 8).

## Interfaces consumed

`runFull`/`runIncremental` and scope handling from the extraction engine
(slice 2); `GraphStore.applySkeletonDelta` (slice 3); `packages/shared`'s hook
payload schemas (slice 0).

## Interfaces exposed

- `POST /api/hooks/claude-code`.
- `hub track` / `hub untrack` CLI commands and their underlying installer
  functions — consumed by slice 8's onboarding UI.
- The orchestrator's semantic-enqueue extension point — consumed by slice 6 to plug
  in the real job queue.
- Hook-health state — consumed by slice 7's status bar warning.

## Definition of Done

1. `pnpm --filter server build` exits 0.
2. Golden test: installing hooks into a `settings.json` that already has unrelated
   hooks produces a result byte-identical to `fixtures/golden/settings.merged.json`;
   running `hub track` twice produces no further diff (idempotent); `hub untrack`
   removes exactly the marker-tagged entries and nothing else.
3. Integration test: POST a realistic `Stop`-hook payload to
   `/api/hooks/claude-code`; assert SQLite and `.arch/skeleton.json` reflect the
   change and a `graph.skeleton-updated` WS delta is published within 3 seconds.
4. Integration test: kill the server mid-session, mutate fixture files, restart the
   server pointed at the same tracked repo; assert it catches up to the correct
   skeleton on boot without any hook ever firing.
5. Integration test: with hooks entirely absent from `settings.json`, mutate
   fixture files; assert the watcher alone drives a correct sync within its
   debounce window.
6. Integration test: simulate a branch switch (checkout a second commit in a temp
   repo); assert bulk dirty resolution via `git diff --name-only HEAD@{1} HEAD` and
   a full staleness recheck occur.
7. Timing test: `/api/hooks/claude-code` responds in under 5ms regardless of
   orchestrator processing time (mock a slow orchestrator, time only the HTTP
   response).
8. `pnpm verify:slice-4` runs items 1–7 and exits 0.

## Verification

`verify:slice-4` = `vitest run packages/server/test/slice-4`

Asserts: settings.json merge/idempotency/untrack golden match, hook-POST-to-WS-delta
latency ≤3s, kill/restart catch-up, hooks-disabled watcher fallback, branch-switch
bulk-dirty handling, and sub-5ms hook response time.

## Dependencies & parallelization

Needs slices 2 and 3. Runs in parallel with slice 6's mock-transport work (slice 6
only needs this slice's stub enqueue extension point, not the finished orchestrator,
to build against). On the critical path: 0 → 2 → 3 → **4** → 6 → 8.
