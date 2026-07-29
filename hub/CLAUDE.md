# CLAUDE.md — Fleet Coordination File for "the Hub"

The Hub is an architecture-first development environment: a local web app pairing an
embedded terminal (for running Claude Code) with a living, drillable knowledge graph
of a project's actual architecture (system → components → APIs/pipelines/test suites
→ modules). A deterministic extraction engine builds a ground-truth skeleton from the
codebase on every change; LLM workers layer semantics (clustering, summaries,
diagrams) on top, incrementally. The product's entire value rests on one promise —
the **sync loop**: Claude Code end-of-turn hooks trigger background re-derivation so
the graph never silently drifts from the code. If the graph can drift without saying
so, the product has failed. This file governs how the fleet (one coordinator + Sonnet
implementer agents) builds the Hub from the docs in this package. Nothing here may be
contradicted by any other doc or by any implementer's code; if a conflict is found,
stop and escalate to the coordinator rather than resolve it unilaterally.

## Read this first — pointer map

Every implementer reads this file plus the "always" column before starting any work.
Read the rest only when your assigned slice requires it (see each slice doc's own
"required reading" list, which is authoritative for that slice).

| Doc | Read when |
|---|---|
| `CLAUDE.md` (this file) | Always, before any work. |
| `docs/VISION.md` | Always, before any work — establishes why the invariants below are non-negotiable. |
| `docs/ARCHITECTURE.md` | Before implementing any server component (PTY manager, hook ingest, FS watcher, sync orchestrator, extraction engine, graph store, semantic job queue, WS gateway) or any frontend surface that talks to them. |
| `docs/DATA_MODEL.md` | Before touching anything under `.arch/`, `packages/shared` graph schemas, SQLite node/edge/staleness tables, or any code that reads/writes skeleton or semantic artifacts. |
| `docs/SYNC_PIPELINE.md` | Before implementing hook installation, debounce/coalesce logic, incremental extraction, diffing/persistence, or semantic scheduling (slices 4 and 6 especially). |
| `docs/STACK.md` | Before adding any dependency or choosing a library/pattern — it is the binding list of approved tech and the reasons substitutions are rejected. |
| `docs/TESTING.md` | Before writing any test, fixture, or `pnpm verify:slice-N` script. |
| `docs/ROADMAP.md` | Before implementing anything you suspect is post-MVP — check first, do not build it. |
| `docs/RISKS.md` | Before implementing clustering (slice 6), hook installation (slice 4), or extraction scope/budgets (slice 2) — these map directly to top risks. |
| `docs/slices/SLICE-00-contracts-scaffold.md` | Whoever is assigned slice 0, and everyone else once, before their own slice, to know what contracts already exist. |
| `docs/slices/SLICE-01-terminal.md` through `SLICE-08-full-loop.md` | Only the doc matching your assigned slice number, plus any slice doc listed in its "Deps" as a prerequisite. |

## Invariants (law)

These are non-negotiable. No slice doc, no local optimization, no "cleaner code"
argument overrides them. Any code that violates one of these is a bug regardless of
whether tests pass.

1. **Two-layer principle.** The skeleton layer (`.arch/skeleton.json`, written by the
   Extraction Engine) and the semantic layer (`.arch/semantics/*.json`, written by
   Semantic Job Queue workers) are produced by disjoint code paths. Extraction code
   **never** writes semantics. LLM workers **never** write skeleton files. The UI
   composes both layers at read time and **always** renders skeleton facts (nodes,
   edges, membership) even when semantics are stale, missing, or the LLM is
   unreachable. A component with no summary yet still renders with its real name-
   derived fallback label and its real member list — never blank, never blocked on
   an LLM call.
2. **Staleness is pure.** Staleness of a semantic artifact is computed by comparing
   `provenance.inputHashes` against current skeleton file hashes (plus membership-
   footprint changes) — a pure function of `(skeleton, overlay)`. It is computed at
   extraction time and requires zero LLM involvement. The skeleton itself is never
   "stale" by construction; if extraction fails, that failure is surfaced globally
   ("skeleton stale since <time>") — never silently swallowed.
3. **Deterministic serialization.** Every file under `.arch/` is written with sorted-
   key, stable-ordering JSON serialization (shared helper, used everywhere — no ad
   hoc `JSON.stringify`) so that re-running extraction on an unchanged tree produces
   byte-identical output and git diffs are minimal and meaningful.
4. **Deterministic skeleton IDs.** Skeleton node IDs are deterministic `kind:path`-
   derived slugs (e.g. `mod:src/server/pty.ts`, `ep:POST:/api/hooks/claude-code`,
   `dep:hono`). Never random, never sequential, never derived from LLM output.
5. **Stable component IDs.** Component IDs (`cmp:<slug>`) are assigned once at first
   clustering and never regenerated or renamed on subsequent runs. Clustering is
   always anchored against the previous `semantics/components.json`; it may only
   assign new/orphaned files, never silently re-cluster or rename existing
   components. This is the #1 product-killer risk (see `docs/RISKS.md`) — treat any
   code path that could reassign an existing component ID as a critical bug.
6. **Hooks must never break or slow Claude Code.** Every installed hook command is
   fire-and-forget: `|| true`, a 2-second timeout, and a response target of <5ms from
   `/api/hooks/claude-code`. A dead or slow Hub must never block, error, or visibly
   delay an agent's turn in a tracked repo. This is tested, not assumed.
7. **The terminal is a dumb pipe.** PTY sessions carry raw bytes between xterm.js and
   the shell/`claude` process and nothing else. The sync loop is driven exclusively
   by hooks and the FS/git watcher — sync code **never** parses, scrapes, or reads
   terminal output for any purpose.

## Monorepo layout

pnpm workspaces:

```
packages/shared/       # zod schemas: graph nodes/edges, .arch/ file shapes, WS/HTTP contracts
packages/server/        # Hono + ws server: PTY manager, hooks, watcher, orchestrator,
                         # extraction engine, graph store, job queue, WS gateway
packages/web/           # React + Vite frontend: graph canvas, inspector, terminal panel, status bar
packages/analyzers/     # pluggable Analyzer implementations (TS/JS in MVP)
fixtures/demo-app/      # small Hono+React app with a known import graph, routes, tests
fixtures/golden/        # golden snapshots (skeleton.json, views, settings.json, .mmd, etc.)
```

**Contract rule:** `packages/shared` is written first, in slice 0, and is the **only**
cross-slice coupling point. Every other package depends on `packages/shared` for
types and zod schemas; packages never depend on each other's internals directly.
Changing anything in `packages/shared` after slice 0 requires updating the affected
fixtures in `fixtures/golden/` in the same change, and is a **coordinator-approved
event** — no implementer agent edits a shared contract unilaterally, even to fix a
bug uncovered mid-slice. Flag it and wait for approval.

## Coding conventions

- TypeScript strict mode everywhere. No `any` used to route around a type error —
  fix the type.
- zod validation at every boundary: incoming HTTP request bodies, WS messages, all
  `.arch/` file reads/writes, and all LLM worker output before it is trusted. If a
  boundary can receive malformed data, it is validated there, not downstream.
- No ORM. Hand-written DAO functions over `better-sqlite3`, WAL mode enabled. Do not
  introduce Prisma/Drizzle/Knex/TypeORM or similar.
- No hand-rolled module resolution. Use `dependency-cruiser` as a library for the
  import graph (tsconfig paths, aliases, dynamic imports, monorepo resolution). This
  is a documented tar pit — do not attempt to reimplement it.
- Hono (`@hono/node-server`) for all HTTP. Plain `ws` for WebSocket, mounted on the
  same HTTP server, paths `/ws/events` and `/ws/pty/:id`.
- All `.arch/` writes go through the shared sorted-key deterministic JSON
  serialization helper in `packages/shared` — no exceptions, no local reimplementations.
- Errors surface honestly in the UI. Never swallow an extraction failure, a stalled
  job, or a disconnected WS into a silent no-op — render an explicit error/stale
  state (see Invariant 2 and the Sync Status Bar in `docs/ARCHITECTURE.md`).

## Testing conventions

- Golden-snapshot testing against `fixtures/golden/` is the primary correctness
  mechanism for extraction, graph store, and semantic output.
- A mock LLM transport is **mandatory** in every CI path that exercises the Semantic
  Job Queue. No test may spend real tokens or depend on network access to Anthropic's
  API; the only exception is the single manual-gate live `claude -p` smoke test noted
  in slice 6's DoD, which is not part of `pnpm test` or `pnpm verify:slice-6`.
- Every slice ships a `pnpm verify:slice-N` script that is the sole, machine-checkable
  definition of "this slice is done." No implementer or coordinator confirms
  completion by reading code.
- Playwright for UI/E2E tests (`packages/web`, cross-cutting E2E in slice 8). Vitest
  for server-side unit/integration/golden-snapshot tests (`packages/server`,
  `packages/analyzers`, `packages/shared`).

## Slice execution protocol for implementer agents

1. Read `CLAUDE.md` (this file) in full.
2. Read your assigned slice doc (`docs/slices/SLICE-0N-*.md`) in full, including its
   Deps list.
3. Read every doc your slice doc lists under "required reading" — do not skip any of
   them, and do not read slice docs for slices you are not assigned or that are not a
   listed dependency.
4. Build only what is in scope for your slice. Anything not listed in your slice
   doc's Scope section is out of scope, including code that would make later slices
   easier — do not build ahead.
5. Make your slice's `pnpm verify:slice-N` pass, then make the repo-wide
   `pnpm build && pnpm test` pass.
6. Report completion by citing the actual `pnpm verify:slice-N` output (and
   `pnpm build && pnpm test` output). A completion report with no verify output is
   not a completion report.
7. Any change outside your slice's declared scope, and any change to
   `packages/shared`, requires explicit coordinator approval before you make it —
   stop and ask rather than proceeding.

### Parallelization / dependency map

```
Slice 0 (contracts & scaffold)
  │
  ├──> Slice 1 (terminal)                         [independent after 0]
  ├──> Slice 2 (extraction engine)                 [independent after 0]
  └──> Slice 5-frontend-shell (canvas scaffold)     [independent after 0, can build
                                                      against golden JSON before 4]

Slice 2 ──> Slice 3 (graph store + query API) ──┬──> Slice 5-remainder
                                                  │
                                                  ├──> Slice 4 (sync orchestration) ──┐
                                                  │                                    ├──> Slice 6 (semantic layer,
                                                  └────────────────────────────────────┘      mock-transport)

Slice 5 (canvas + inspector, full) ─┐
Slice 6 (semantic layer) ───────────┼──> Slice 7 (staleness & status UI, Mermaid export)

Slice 7 ──> Slice 8 (full-loop hardening) [serial, depends on all]
```

Fleet plan: after slice 0 completes, run slices 1, 2, and the slice-5 frontend shell
in parallel (three agents). Then run slice 3 in parallel with the slice-5 remainder.
Then run slice 4 in parallel with slice 6 (mock transport). Slices 7 and 8 run
serially, in that order, after their dependencies close.

**Critical path:** 0 → 2 → 3 → 4 → 6 → 8. Do not staff this path thinner than the
rest — a delay here delays the whole fleet regardless of how many agents are free on
slices 1 or 5.
