# Slice 6 — Semantic Layer

## Goal

Build the LLM side of the two-layer model: a SQLite-backed job queue, the
cluster/summarize/diagram/describe-tests workers, an overlay writer with
provenance, stable-ID anchoring, and staleness clearing. Built and CI-verified
entirely against a mock LLM transport — no test in this slice's DoD spends a real
token.

## Required reading

`CLAUDE.md` (esp. invariants 1 and 5), `docs/VISION.md`, `docs/ARCHITECTURE.md`
(Semantic Job Queue section), `docs/DATA_MODEL.md` (semantics files, staleness),
`docs/SYNC_PIPELINE.md` (Semantic scheduling section), `docs/RISKS.md` (risk 1 —
clustering instability), `docs/TESTING.md` (Mock LLM transport section — required,
not optional).

## Scope

- `packages/server/src/semantic/queue.ts` — SQLite-backed job table (survives
  restart), concurrency 1–2, priority order (currently-UI-focused component first,
  then change size), dedup by `(type, targetId)` superseding a queued-not-started
  duplicate, retry ×3 with exponential backoff then park as `failed` with a retry
  badge.
- `packages/server/src/semantic/scheduler.ts` — maps changed files → owning
  components (via `components.json`) → enqueues `summarize-component` per affected
  component; enqueues `cluster` only on structural-churn triggers; enqueues
  `diagram` after a successful `summarize-component`.
- `packages/server/src/semantic/workers/cluster.ts` — anchored clustering: reads
  the previous `components.json`, only assigns new/orphaned files, rejects any run
  proposing >30% membership churn, surfaces above-confidence-bar moves as
  suggestions rather than committing them.
- `packages/server/src/semantic/workers/summarize-component.ts` — writes
  `semantics/<componentId>.json` with full `provenance` (`generatedAt`, `commit`,
  `model`, `inputHashes`, `promptVersion`).
- `packages/server/src/semantic/workers/diagram.ts` — writes
  `diagrams/<componentId>.mmd`.
- `packages/server/src/semantic/workers/describe-tests.ts` — test-coverage-notes
  job (data collected now; the full test-suite explorer UI is post-MVP per
  `docs/ROADMAP.md`).
- `packages/server/src/semantic/transport/agent-sdk-transport.ts` — real
  transport, `@anthropic-ai/claude-agent-sdk`, Read/Grep/Glob-only sandboxed
  toolset, JSON-schema-validated output, capped `maxTurns`.
- `packages/server/src/semantic/transport/subprocess-transport.ts` — real fallback
  transport, `claude -p --output-format json`.
- `packages/server/src/semantic/transport/mock-transport.ts` — canned-JSON
  transport reading `fixtures/mock-llm/responses/` plus an in-test override map;
  this slice's mandatory CI deliverable.
- `fixtures/mock-llm/responses/*.json` — canned responses for `fixtures/demo-app`'s
  components.

## Out of scope

Finalizing the orchestrator's live wiring beyond the extension point slice 4
already exposed (slice 6 fills that point in; it does not change slice 4's
debounce/state-machine logic). Any staleness-badge UI (slice 7). Validating the
exported `.mmd` with `mmdc` (slice 7 — this slice only writes the file).

## Interfaces consumed

`packages/shared`'s `LlmTransport`/`JobRequest`/`JobResult` and
`SemanticArtifact`/`ComponentsFile` schemas (slice 0); `GraphStore.staleness()`
and `applySkeletonDelta` plus the orchestrator's semantic-enqueue extension point
(slices 3, 4).

## Interfaces exposed

`JobQueue.enqueue()` / `JobQueue.drain()`, the three `LlmTransport`
implementations, and the overlay writer — consumed by slice 7 (status bar job
counts, re-summarize action) and slice 8 (the money test drains this exact queue
under the mock transport).

## Definition of Done

1. `pnpm --filter server build` exits 0.
2. Golden test, mock transport: apply a fixture mutation; assert the scheduler
   enqueues exactly the expected jobs (correct types/targets), a second identical
   enqueue collapses via dedup before the first runs, and the resulting
   `semantics/*.json` and `diagrams/*.mmd` match `fixtures/golden/semantics` and
   `fixtures/golden/diagrams` byte-for-byte.
3. Staleness-clearing test: after step 2's jobs complete, `staleness()` returns
   `'current'` for every updated artifact, and each clearing is observable as a
   `graph.semantics-updated` WS event per completed job.
4. Anchoring test: re-cluster with a canned response that reassigns an
   already-committed component's files; assert the existing component ID and its
   unrelated members are unchanged — only the new/orphaned files move.
5. Churn-rejection test: a canned cluster response proposing >30% churn is
   rejected; `components.json` is unchanged after the run.
6. Kill-LLM test: point the queue at a transport that always errors/times out;
   assert the skeleton keeps updating on subsequent syncs, affected jobs reach
   `failed` with a retry badge after 3 attempts, and no unhandled rejection or
   crash occurs.
7. Manual gate, **excluded from `pnpm verify:slice-6` and `pnpm test`**: one live
   smoke test using the real `subprocess-transport.ts` (`claude -p`) against
   `fixtures/demo-app`, run by hand, confirming the real transport satisfies the
   same `LlmTransport` contract the mock does.
8. `pnpm verify:slice-6` runs items 1–6 only (never item 7) and exits 0.

## Verification

`verify:slice-6` = `vitest run packages/server/test/slice-6`

This script must not require `ANTHROPIC_API_KEY` or network access — the mock
transport is the default in this test configuration. Asserts: correct job
scheduling and dedup, golden-matching overlay output, staleness clearing,
anchored-clustering ID stability, churn rejection, and clean behavior when the LLM
is unreachable.

## Dependencies & parallelization

Needs slices 2, 3, and 4's stub enqueue extension point (the mock-transport-based
queue and workers can be built in parallel with slice 4's remaining work once that
extension point exists; final wiring is trivial once both land). Runs in parallel
with slice 4 per the fleet plan ({4} ∥ {6-mock-transport}). On the critical path:
0 → 2 → 3 → 4 → **6** → 8.
