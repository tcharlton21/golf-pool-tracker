# Slice 2 — Extraction Engine

## Goal

Build the deterministic static extraction path: a TS/JS `Analyzer` implementation
(dependency-cruiser for the import graph, web-tree-sitter for per-file facts), full
and incremental extraction modes, and the skeleton writer. Same tree in, same
skeleton out — always.

## Required reading

`CLAUDE.md`, `docs/VISION.md`, `docs/ARCHITECTURE.md` (Extraction Engine section),
`docs/DATA_MODEL.md`, `docs/STACK.md` (TS/JS analysis row), `docs/TESTING.md`,
`docs/RISKS.md` (risk 3 — giant repos).

## Scope

- `packages/analyzers/src/typescript/dep-cruiser-adapter.ts` — wraps
  dependency-cruiser as a library for the import graph → `depends-on` edges.
- `packages/analyzers/src/typescript/tree-sitter-facts.ts` — web-tree-sitter (WASM)
  per-file facts: exports, route registrations (Hono/Express/Fastify/Next
  patterns), test markers (vitest/jest/playwright).
- `packages/analyzers/src/typescript/route-discovery.ts` — turns route-registration
  facts into `api-endpoint` nodes (component-level `exposes` edges are assigned
  later, during slice 6 clustering — this slice only records the raw endpoint
  nodes).
- `packages/analyzers/src/typescript/test-discovery.ts` — `test-file` nodes and
  `tests` edges via the import graph plus naming heuristics.
- `packages/analyzers/src/typescript/index.ts` — `TsAnalyzer` implementing the
  shared `Analyzer` interface (`detect`/`extract`).
- `packages/server/src/extraction/registry.ts` — analyzer registry; picks an
  analyzer per repo via `detect()`.
- `packages/server/src/extraction/run.ts` — `runFull(root, manifest)` and
  `runIncremental(root, changedFiles, manifest)`, orchestrating registered
  analyzers into a `SkeletonDelta`.
- `packages/server/src/extraction/skeleton-writer.ts` — merges a `SkeletonDelta`
  into the full `skeleton.json` shape, writing via the shared `serialize()` helper.
- `packages/server/src/extraction/scope.ts` — `manifest.json` include/exclude
  globs, `.gitignore` honored by default, hard file-count budget with truncation
  reporting.

## Out of scope

Deciding *when* extraction runs (hooks/watcher — slice 4). SQLite persistence and
diffing (slice 3). Any semantic/LLM content (slice 6). Any UI (slices 5, 7).

## Interfaces consumed

`packages/shared`'s `Analyzer` interface, `SkeletonDelta`/`Skeleton`/`Manifest`
schemas, ID helpers, and `serialize()` (all slice 0).

## Interfaces exposed

`runFull()` and `runIncremental()` (`packages/server/src/extraction/run.ts`) and
the scope/truncation logic (`scope.ts`) — consumed by slice 3 (feeds
`GraphStore.applySkeletonDelta`) and slice 4 (sync orchestrator calls these
directly on dirty sets; onboarding scan uses the scope/truncation output).

## Definition of Done

1. `pnpm --filter analyzers build && pnpm --filter server build` exit 0.
2. Golden test: `runFull(fixtures/demo-app)` is byte-identical (via `serialize()`)
   to `fixtures/golden/skeleton.json`.
3. Mutation-equivalence test: for each of the five `fixtures/mutations` scenarios
   (add-file, delete-file, change-import, rename-file, config-change),
   `runIncremental` on just the changed files, starting from the pre-mutation
   skeleton, produces a skeleton structurally equal (same node/edge sets, ignoring
   `extractedAt`) to a fresh `runFull` on the post-mutation tree.
4. The delete-file scenario specifically asserts the deleted node is dropped from
   `nodes` and any now-dangling inbound edge is retained with `meta.dangling: true`
   rather than silently dropped.
5. The config-change scenario (tsconfig.json edit) asserts extraction took the
   full-extraction fallback path, not an incremental parse (asserted via a
   spy/flag on which code path executed).
6. Performance test: `runFull` completes in under 2 seconds against a generated
   synthetic 500-file repo fixture.
7. Scope test: a `manifest.json` with an exclude glob omits matching files from the
   resulting skeleton and reports the correct excluded-file count for the
   truncation banner.
8. `pnpm verify:slice-2` runs items 1–7 and exits 0.

## Verification

`verify:slice-2` = `vitest run packages/analyzers/test/slice-2 packages/server/test/slice-2`

Asserts: golden byte-match, incremental≡full equivalence across all five mutation
scenarios, dangling-edge handling, full-extraction fallback trigger, the 500-file
performance budget, and scope/truncation behavior.

## Dependencies & parallelization

Needs slice 0. Runs in parallel with slice 1 and the slice-5 frontend shell. On the
critical path: 0 → **2** → 3 → 4 → 6 → 8 — this slice's completion gates the graph
store and everything after it.
