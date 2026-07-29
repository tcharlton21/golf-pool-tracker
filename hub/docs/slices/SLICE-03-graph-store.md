# Slice 3 — Graph Store + Query API

## Goal

Own the graph's persistence and read path: SQLite cache + `.arch/` reader/writer,
skeleton diffing, the `getView` query API (children + lifted edges + staleness),
and the `/ws/events` gateway that publishes deltas. This slice is the boundary
between "extraction produced facts" and "the rest of the Hub can see them."

## Required reading

`CLAUDE.md`, `docs/VISION.md`, `docs/ARCHITECTURE.md` (Graph Store, WebSocket
Gateway sections), `docs/DATA_MODEL.md` (staleness section especially),
`docs/STACK.md`, `docs/TESTING.md`.

## Scope

- `packages/server/src/store/graph-store.ts` — owns `.arch/` and the SQLite cache;
  `applySkeletonDelta(projectId, skeleton)` (diff + persist + publish);
  `getView(projectId, focusNodeId)` (children + lifted edges + per-node staleness).
- `packages/server/src/store/diff.ts` — node-ID set diff, hash comparison, edge-set
  diff between two skeletons.
- `packages/server/src/store/staleness.ts` — pure function:
  `staleness(artifact, currentSkeleton) → 'current' | 'stale' | 'never-summarized'`
  plus the exact changed-file list for `'stale'`.
- `packages/server/src/store/edge-lifting.ts` — view-time aggregation of descendant
  edges into weighted rolled-up edges, cached in SQLite, never stored redundantly in
  `skeleton.json`.
- `packages/server/src/store/arch-writer.ts` — writes `.arch/manifest.json` and
  `.arch/skeleton.json` via the shared `serialize()` helper.
- `packages/server/src/ws/gateway.ts` — `/ws/events` topic pub/sub:
  `graph.skeleton-updated`, `graph.semantics-updated`, `sync.status`,
  `job.progress`; every payload is a delta, never a full graph.
- `packages/server/src/http/routes/graph.ts` —
  `GET /api/projects/:projectId/view?focus=<nodeId>`.

## Out of scope

Deciding when `applySkeletonDelta` gets called — that's hooks/watcher wiring
(slice 4). Generating semantic content (slice 6). Any UI (slices 5, 7).

## Interfaces consumed

`packages/shared`'s `Skeleton`/`SkeletonDelta`/`SemanticArtifact`/WS-envelope
schemas (slice 0); the extraction engine's `SkeletonDelta` shape and scope/
truncation output (slice 2).

## Interfaces exposed

- `GraphStore.applySkeletonDelta()` — consumed by slice 4 (called after every
  extraction run) and slice 6 (staleness recompute after semantic writes).
- `GraphStore.getView()` / `GET /api/projects/:projectId/view` — consumed by
  slice 5 (frontend canvas fetch).
- `/ws/events` gateway — publishers: slices 4, 6; subscribers: slices 5, 7.
- `staleness()` — consumed directly by slice 6 (recompute after writes) and
  slice 7 (renders exact badge text from its output).

## Definition of Done

1. `pnpm --filter server build` exits 0.
2. Contract test: apply the golden skeleton for `fixtures/demo-app` via
   `applySkeletonDelta`, call `getView` at L0, L1, and L2, and assert each response
   matches the corresponding `fixtures/golden/views/<nodeId>.json` exactly,
   including lifted-edge `weight` values at L1.
3. Staleness test: seed a semantic artifact with `provenance.inputHashes` pointing
   at stale hashes → `staleness()` returns `'stale'` with the exact changed-file
   list; seed matching hashes → `'current'`; seed no artifact → `'never-summarized'`.
4. WS delta test: apply a skeleton delta and assert a `graph.skeleton-updated`
   message is published on `/ws/events`, validates against the shared WS schema,
   and contains only the changed nodes/edges — not the full graph.
5. Diff test: apply skeleton A, then skeleton B (B = A with one file deleted);
   assert the computed diff lists the deleted node under `removed` and the
   resulting dangling inbound edge is flagged, matching the extraction engine's
   `meta.dangling` semantics from slice 2.
6. `pnpm verify:slice-3` runs items 1–5 and exits 0.

## Verification

`verify:slice-3` = `vitest run packages/server/test/slice-3`

Asserts: golden view-response matches at every drill level including lifted-edge
weights, correct staleness classification in all three states, delta-only WS
payload shape, and correct diff/dangling-edge computation.

## Dependencies & parallelization

Needs slices 0 and 2. Runs in parallel with the slice-5 remainder (slice 5's canvas
can be built and tested against `fixtures/golden/views/*.json` directly before this
slice's live endpoint exists, then swapped over). On the critical path:
0 → 2 → **3** → 4 → 6 → 8.
