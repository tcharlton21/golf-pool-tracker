# Slice 7 — Staleness & Status UI + Mermaid Export

## Goal

Make the Hub's honesty principle visible: the sync status bar, per-node provenance
popovers, a working re-summarize action, a stale-filter canvas view, and Mermaid
export. This slice turns the inert badge chips and inspector action buttons from
slice 5 into live, correct behavior.

## Required reading

`CLAUDE.md`, `docs/VISION.md`, `docs/ARCHITECTURE.md` (Sync Status Bar section),
`docs/DATA_MODEL.md` (staleness), `docs/RISKS.md` (risk 4 — semantic lag reads as
failure), `docs/TESTING.md`.

## Scope

- `packages/web/src/components/SyncStatusBar/SyncStatusBar.tsx` — renders
  `Skeleton: current @ <commit> · Semantics: N components stale, M jobs queued`,
  a live spinner during extraction, and the "hooks not firing for this repo —
  reinstall?" warning sourced from slice 4's hook-health state.
- `packages/web/src/components/SyncStatusBar/StaleFilterToggle.tsx` — clicking the
  stale count filters the canvas to stale nodes only.
- `packages/web/src/components/NodeInspector/ProvenancePopover.tsx` — "summary
  generated at commit `abc123`, N files changed since," with the exact changed-file
  list one click away.
- `packages/web/src/components/NodeInspector/ReSummarizeButton.tsx` — enqueues a
  `summarize-component` job for the focused node's component; disabled while a job
  for that target is already queued or running.
- `packages/server/src/http/routes/jobs.ts` —
  `GET /api/projects/:projectId/jobs` (job-queue status; used by both the
  re-summarize button's disabled state and the status bar's job count). Manual
  enqueue uses the existing
  `POST /api/projects/:projectId/nodes/:nodeId/resummarize` endpoint defined in
  `docs/ARCHITECTURE.md` §7 (returns `jobId`).
- `packages/server/src/semantic/mermaid-export.ts` — exports
  `diagrams/<componentId>.mmd` / `diagrams/system.mmd` to a user-chosen path (a
  thin wrapper over the `.mmd` files slice 6 already writes).

## Out of scope

Generating semantic content itself (slice 6, already done). The canvas drill-down
mechanics (slice 5, already done) — this slice only adds staleness-aware chrome on
top of both, it does not modify their core rendering logic.

## Interfaces consumed

`staleness()` output and `graph.semantics-updated` events (slices 3, 6); job-queue
enqueue/status (slice 6); the `GraphCanvas`/`NodeInspector` components and
`graph-store` (slice 5); hook-health state (slice 4).

## Interfaces exposed

`SyncStatusBar` (with stale-filter view), `ProvenancePopover`,
`ReSummarizeButton`, and `GET /api/projects/:projectId/jobs` — mounted
as-is into slice 8's full app shell.

## Definition of Done

1. `pnpm --filter web build && pnpm --filter server build` exit 0.
2. Playwright: seed a stale state (an artifact with mismatched `inputHashes`);
   assert the node's badge renders the exact text
   "N files changed since `<commit>`" with the correct N and commit, and the
   provenance popover lists the correct changed files.
3. Playwright: click Re-summarize on a node; assert (via
   `GET /api/projects/:projectId/jobs`) a `summarize-component` job for that
   node's component is enqueued, and the button becomes disabled while that job is
   queued or running.
4. Playwright: click the status bar's stale count; assert the canvas filters to
   show only currently-stale nodes.
5. Export test: run the Mermaid export for a component with a known golden
   diagram; assert the exported file matches
   `fixtures/golden/diagrams/<componentId>.mmd` byte-for-byte and passes `mmdc`
   (Mermaid CLI) parsing without error.
6. `pnpm verify:slice-7` runs items 1–5 and exits 0.

## Verification

`verify:slice-7` = `playwright test e2e/slice-7 && vitest run packages/server/test/slice-7`

Asserts: exact stale-badge text and provenance popover content, working
re-summarize enqueue + disabled state, stale-filter toggle behavior, and a
golden-matching, `mmdc`-parseable Mermaid export.

## Dependencies & parallelization

Needs slices 5 and 6. Per the fleet plan, this slice runs serially after both
close. Not itself on the critical path (0→2→3→4→6→8), but it gates slice 8, the
last slice.
