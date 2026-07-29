# Slice 5 — Graph Canvas + Inspector

## Goal

Build the primary view: a React Flow + ELK drill-down canvas showing one level at a
time with breadcrumb navigation, custom badge-bearing node components, a node
inspector panel, and live WS-driven updates. This is the surface the developer
actually looks at instead of reading code.

## Required reading

`CLAUDE.md`, `docs/VISION.md`, `docs/ARCHITECTURE.md` (Graph Canvas, Node
Inspector, and frontend sections), `docs/DATA_MODEL.md`, `docs/STACK.md` (frontend
rows), `docs/TESTING.md`.

## Scope

- `packages/web/src/state/graph-store.ts` — Zustand store: current focus node,
  breadcrumb stack, node/edge maps, staleness map.
- `packages/web/src/state/ws-client.ts` — `/ws/events` subscriber, applies
  `graph.skeleton-updated`/`graph.semantics-updated` deltas as reducer actions.
- `packages/web/src/api/client.ts` — typed fetch wrapper for
  `GET /api/projects/:projectId/view`.
- `packages/web/src/components/GraphCanvas/GraphCanvas.tsx` — React Flow canvas
  showing one drill level (children of the focused node) at a time.
- `packages/web/src/components/GraphCanvas/layout.ts` — elkjs `elk.layered` layout,
  recomputed per view transition.
- `packages/web/src/components/GraphCanvas/Breadcrumbs.tsx`.
- `packages/web/src/components/GraphCanvas/nodes/` — custom node components per
  kind: name, kind icon, staleness chip, child count.
- `packages/web/src/components/NodeInspector/NodeInspector.tsx` — LLM summary,
  member files rendered as "verified facts," inbound/outbound edges, a provenance
  line, and action buttons (Re-summarize now, Export Mermaid) — rendered as inert
  shells in this slice, wired to live behavior in slice 7.

## Out of scope

Generating real semantic content (slice 6). The exact staleness badge text and
live re-summarize/export behavior (slice 7 — this slice renders the chip and the
inspector's action buttons, but their end-to-end wiring is slice 7's job). The
terminal panel (slice 1, mounted elsewhere but not built here). Onboarding
(slice 8).

## Interfaces consumed

`packages/shared`'s view-response schema (slice 0); `GraphStore.getView` via
`GET /api/projects/:projectId/view` (slice 3) — or, before slices 3/4 are live,
`fixtures/golden/views/*.json` served by a local test harness so this slice can be
built and tested against a known-shape response immediately after slice 0;
`graph.skeleton-updated`/`graph.semantics-updated` WS envelopes (slice 3).

## Interfaces exposed

`GraphCanvas`, `NodeInspector`, and the `graph-store` Zustand store — consumed by
slice 7 (stale-filter view built on top of this canvas) and slice 8 (mounted as-is
into the full app shell).

## Definition of Done

1. `pnpm --filter web build` exits 0.
2. Playwright, server seeded with the golden graph: drill L0 → L1 → L2 via node
   clicks and breadcrumb navigation; assert labels and child counts at each level
   match `fixtures/golden/views/*.json`.
3. Playwright: push a synthetic `graph.skeleton-updated` WS delta at the running
   server; assert the affected node's staleness chip updates in the DOM without a
   page reload.
4. Playwright: click a node; assert the Node Inspector's member-file list and
   inbound/outbound edge lists match the golden view response for that node
   exactly.
5. Reducer test: apply a sequence of WS delta fixtures to the Zustand
   `graph-store` reducer; assert the resulting node/edge map equals what a direct
   `getView` fetch for the same final state returns — proves the incremental
   reducer and the full fetch agree.
6. `pnpm verify:slice-5` runs items 1–5 and exits 0.

## Verification

`verify:slice-5` = `vitest run packages/web/test/slice-5 && playwright test e2e/slice-5`

Asserts: drill-down label/count correctness at every level, live badge update from
a pushed WS delta, inspector content matching golden, and reducer/full-fetch
agreement.

## Dependencies & parallelization

The frontend shell (routing, empty panel mounts, basic layout) needs only slice 0
and can start immediately in parallel with slices 1 and 2. The remainder (live
drill-down against real data, WS wiring) needs slice 3 and runs in parallel with
slice 4. Not on the critical path itself (0→2→3→4→6→8), but slice 7 depends
directly on this slice's output.
