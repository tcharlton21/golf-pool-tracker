# Slice 0 — Contracts & Scaffold

## Goal

Stand up the pnpm workspace, the shared zod contracts every later slice depends on,
the SQLite migration skeleton, an empty Hono server and Vite frontend boot, and
commit the fixture repo. This slice is the single cross-slice coupling point: after
it lands, `packages/shared` is the only place slices are allowed to couple through.

## Required reading

`CLAUDE.md`, `docs/VISION.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`,
`docs/STACK.md`, `docs/TESTING.md`.

## Scope

- pnpm workspace root: `package.json`, `pnpm-workspace.yaml`, base `tsconfig.json`,
  root `build`/`test`/`verify` script wiring.
- `packages/shared/src/schemas/`: `skeleton.ts`, `semantics.ts`, `ws.ts`, `http.ts`,
  `hooks.ts` — zod schemas for `.arch/` files, WS envelopes, HTTP bodies, and Claude
  Code hook payloads.
- `packages/shared/src/contracts/`: `analyzer.ts` (`Analyzer` interface,
  `SkeletonDelta` type), `llm-transport.ts` (`LlmTransport`, `JobRequest`,
  `JobResult`).
- `packages/shared/src/serialize.ts` — deterministic sorted-key JSON serializer used
  by every `.arch/` writer, no exceptions.
- `packages/shared/src/ids.ts` — deterministic ID slug helpers (`mod:`, `ep:METHOD:path`,
  `dep:`, `test:`, `cmp:`).
- `packages/server/src/index.ts` — Hono app on `@hono/node-server`, port 4820,
  `GET /api/health` only.
- `packages/server/src/store/db.ts` + `packages/server/src/store/migrations/0001_init.sql`
  — better-sqlite3 boot (WAL mode) and the seven base tables: `projects`, `nodes`,
  `edges`, `files`, `semantic_artifacts`, `jobs`, `events`. No DAO logic beyond
  opening the DB and applying migrations.
- `packages/web/src/main.tsx`, `src/App.tsx` — blank shell rendering three empty,
  `data-testid`-tagged panel regions: `graph-canvas`, `terminal-panel`,
  `sync-status-bar`.
- `packages/analyzers/package.json` — package scaffold only, re-exports the
  `Analyzer` type from `packages/shared`; no analyzer implementation yet.
- `fixtures/demo-app/` — the full fixture app described in `docs/TESTING.md`
  (Hono + React, known routes, known imports, its own Vitest suite).
- `fixtures/golden/skeleton.json` — hand-verified expected extraction of
  `fixtures/demo-app`, authored once by hand for this slice (slice 2 will later
  reproduce it programmatically).
- `scripts/update-golden.ts` — stub entry point for the deliberate golden-update
  flow described in `docs/TESTING.md` (no slice depends on it working fully yet).

## Out of scope

PTY/terminal (slice 1). Real extraction logic (slice 2). Graph store logic beyond
raw migrations (slice 3). Sync orchestration (slice 4). Any real canvas rendering
beyond the blank shell (slice 5). Semantic job queue (slice 6). Staleness UI
(slice 7). Packaging (slice 8).

## Interfaces consumed

None — this is the first slice.

## Interfaces exposed

- `packages/shared` schemas and types: `Skeleton`, `SkeletonDelta`, `Manifest`,
  `ComponentsFile`, `SemanticArtifact`, WS envelope types, HTTP request/response
  types, hook payload types, `Analyzer`, `LlmTransport`/`JobRequest`/`JobResult`,
  `serialize()`, and the `mod:`/`ep:`/`dep:`/`test:`/`cmp:` ID helpers.
- SQLite migration `0001_init.sql` (table shapes: `projects`, `nodes`, `edges`,
  `files`, `semantic_artifacts`, `jobs`, `events`).
- `GET /api/health`.
- `fixtures/demo-app` and `fixtures/golden/skeleton.json` as the shared test
  substrate every later slice's tests build on.

## Definition of Done

1. `pnpm install && pnpm build` exits 0 across `packages/shared`, `packages/server`,
   `packages/web`, `packages/analyzers`.
2. `pnpm test` is green, including a round-trip test: parse
   `fixtures/golden/skeleton.json` with the shared `Skeleton` zod schema, re-serialize
   it with `serialize()`, and byte-compare the result to the source file.
3. With the server running, `curl -s http://localhost:4820/api/health` returns HTTP
   200 with a body that validates against the shared `HealthResponse` schema.
4. Applying migration `0001_init.sql` to a fresh temp SQLite file creates exactly
   the seven tables `projects`, `nodes`, `edges`, `files`, `semantic_artifacts`,
   `jobs`, `events` — asserted by querying `sqlite_master`.
5. Playwright loads the Vite dev build of the blank web shell and finds all three
   `data-testid` panel regions (`graph-canvas`, `terminal-panel`,
   `sync-status-bar`) present and empty.
6. `fixtures/demo-app` builds and passes its own Vitest suite standalone
   (`pnpm --filter demo-app build && pnpm --filter demo-app test`), proving it is a
   working app and not inert fixture data.
7. `pnpm verify:slice-0` runs items 1–6 and exits 0.

## Verification

`verify:slice-0` = `pnpm -r build && vitest run packages/shared/test/slice-0 packages/server/test/slice-0 && pnpm --filter demo-app build && pnpm --filter demo-app test && playwright test e2e/slice-0`

Asserts: shared-schema round-trip against golden, `/api/health` shape, migration
table set, and the blank-shell Playwright smoke test.

## Dependencies & parallelization

None — first slice. Unlocks slices 1, 2, and the slice-5 frontend shell to run in
parallel immediately after this lands. First link in the critical path
0 → 2 → 3 → 4 → 6 → 8.
