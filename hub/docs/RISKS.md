# RISKS.md — Top Risks and Mitigations

Five risks that could kill the Hub as a product, in priority order, plus the open
questions the MVP build must resolve empirically rather than by design alone. Every
mitigation below is binding — see `CLAUDE.md`'s invariants for the subset that are
law, not just guidance. Each risk names the slice whose `pnpm verify:slice-N` is the
mechanical proof its mitigation actually holds; a slice that ships without its named
verification passing has not actually mitigated the risk, regardless of what the code
looks like.

## 1. LLM clustering instability across runs

**Risk statement:** The LLM-driven component clustering step reshuffles or renames
components on a run where nothing structurally significant changed — a component the
developer has learned to recognize by name and shape suddenly looks like a different
thing.

**Why it could kill the product:** This is the **#1 product-killer**. The entire
value proposition is "trust this view instead of reading the code." If the view
itself is unstable — if `cmp:sync-orchestrator` might just become `cmp:sync-engine`
with a different member list next Tuesday for no code reason — the developer cannot
build the mental map the product exists to give them. Unlike semantic lag (risk 4),
which is visibly a "not done yet" state, instability presents as confidently wrong,
which is worse: nothing in the UI flags "this used to be a different shape" unless
the developer happens to remember.

**Mitigations:**
- Stable component IDs (`cmp:<slug>`), assigned once at first clustering, never
  regenerated or renamed on any later run. This is invariant 5 in `CLAUDE.md`; any
  code path that could reassign an existing component ID is treated as a critical
  bug regardless of test status.
- The clustering prompt is always **anchored** with the previous
  `semantics/components.json` and instructed to only assign new or orphaned files —
  it is never shown the codebase as if clustering from scratch.
- Membership moves for already-assigned files, above a confidence bar, are surfaced
  as suggestion cards for the developer to accept or reject — never auto-applied.
- Any single clustering run proposing more than 30% membership churn is
  auto-rejected outright and the run is discarded; the queue falls back to the prior
  `components.json` and files that would have moved stay `unassigned` or in their
  prior component until a smaller, more confident run resolves them.
- Clustering itself runs rarely — only on structural churn triggers (new
  unassigned files, orphans from deleted components, membership churn over
  threshold) — while the idempotent-safe `summarize-component` job runs freely on
  every relevant change. Most syncs never touch clustering at all.

**Validated by:** Slice 6 (semantic layer). `verify:slice-6` includes anchored
re-clustering tests against the mock LLM transport asserting: previously assigned
component IDs never change across a re-cluster run, a >30%-churn canned response is
rejected and does not mutate `components.json`, and moves above the confidence bar
appear as suggestions rather than committed membership changes.

## 2. Hook reliability / settings.json coexistence

**Risk statement:** Hook installation either silently fails to fire (so the sync
loop never runs) or clobbers hooks the developer already had configured in
`.claude/settings.json` for unrelated purposes.

**Why it could kill the product:** Silent non-firing means the graph drifts without
anyone noticing — the exact failure mode the product exists to prevent, now
happening one level up in the plumbing that's supposed to prevent it. Clobbering the
developer's own hooks is worse: it makes the Hub actively hostile to install,
breaking tooling the developer had working before they ever touched the Hub, in a
file they may not think to check.

**Mitigations:**
- The installer deep-merges into `.claude/settings.json` — it appends to existing
  hook arrays and never replaces them, and every entry it adds is tagged with a
  marker field so `hub untrack` can remove precisely and only the Hub's own entries,
  idempotently, on repeated `track`/`untrack` cycles.
- Golden-file tests cover the merge: installing into a settings.json that already
  has unrelated hooks must produce a result matching
  `fixtures/golden/settings.merged.json` byte-for-byte, with the pre-existing hooks
  untouched.
- The FS/git watcher is a full fallback path, not a degraded one — hooks are an
  optimization (near-instant `Stop`-triggered sync) on top of a sync mechanism that
  works without them at all. A repo with hooks fully disabled still stays in sync,
  just on watcher latency instead of hook latency.
- An active health check: if the watcher observes file changes with no
  corresponding hook events during an active `claude` PTY session, and this repeats,
  the status bar surfaces "hooks not firing for this repo — reinstall?" — an honest,
  visible warning rather than silent degradation.
- Every installed hook command is `|| true` plus a 2-second timeout
  (`curl -s -m 2 ... || true`), so a dead or slow Hub can never block, error, or
  visibly delay an agent's turn (invariant 6 in `CLAUDE.md`) — the worst case of the
  Hub being broken is "sync doesn't happen," never "Claude Code doesn't respond."

**Validated by:** Slice 4 (sync orchestration). `verify:slice-4` includes the
settings.json merge golden test, a simulated hook POST asserted to update SQLite and
publish a WS delta within 3 seconds, a hooks-disabled run asserted to sync via the
watcher fallback alone, and a kill-server/edit/restart sequence asserted to catch up
correctly.

## 3. Giant repos / extraction blow-up

**Risk statement:** On large monorepos, repos with substantial generated code, or
repos with deep vendored dependency trees, full or even incremental extraction
becomes slow enough or scans enough irrelevant material that the product feels
broken or unusable before it ever shows a graph.

**Why it could kill the product:** "Skeleton truth in about a second" is a named UX
principle, not an aspiration — if extraction takes tens of seconds or minutes on a
developer's actual repo, the core promise (structural facts update near-instantly,
before any LLM runs) is false for the exact users most likely to need the product
(people with real, nontrivial codebases). A bad first-run experience on a large repo
also poisons trust before the sync loop ever gets a chance to prove itself.

**Mitigations:**
- Extraction scope is explicit and configurable in `manifest.json` (include/exclude
  globs), with `.gitignore` honored by default — the extractor never has to be told
  twice to skip `node_modules` or a `dist/` folder.
- A hard scan budget with an honest truncation banner when exceeded — e.g. "graph
  scoped to `src/`, 1,200 files excluded" — rather than either silently truncating
  or hanging trying to do everything. This is the staleness-honesty principle
  applied to scope, not just to time.
- Incremental-first design means steady-state cost after the initial scan is
  proportional to change size, not repo size — the giant-repo problem is
  concentrated almost entirely at onboarding, not at every sync.
- A per-run time budget with an async full-re-extraction fallback: if a full
  extraction would blow the budget, the Hub runs it in the background and keeps
  serving the last-known skeleton (clearly marked as such) rather than blocking the
  UI on it.

**Validated by:** Slice 2 (extraction engine). `verify:slice-2` includes the <2s
full-run assertion against a synthetic 500-file repo, which is the mechanical proxy
for "extraction stays fast at realistic scale" — the scope-budget/truncation-banner
behavior and the async full-extraction fallback for genuinely giant repos are
exercised by the same slice's scope-config tests using `manifest.json` include/exclude
fixtures.

## 4. Semantic lag reads as product failure

**Risk statement:** LLM-derived summaries, clusters, and diagrams take 30–90 seconds
and sometimes fail or sit queued behind other work — if that lag is not clearly
distinguished from breakage, it reads as the product being broken or stuck.

**Why it could kill the product:** A developer staring at a blank panel or an
ambiguous spinner for a minute-plus, once per sync, will not distinguish "working as
designed" from "hung" without being told explicitly which one it is. Repeated enough
times, that erodes trust in the product even though nothing is actually wrong.

**Mitigations:**
- Staleness is rendered as a first-class, named state, not an error state: skeleton
  truth (structure, membership, edges) is correct and visible in ~1 second,
  independent of any LLM call; only the semantic layer (summaries, clusters,
  diagrams) carries the amber "stale, N files changed since commit X" badge while
  its job is queued or running.
- The job scheduler prioritizes the component the developer is currently focused on
  in the UI over background work, so the thing they're looking at resolves first.
- Heuristic interim labels — filename/path-derived, computed with zero LLM
  involvement — mean a node is never blank while waiting on its first summary; it
  has a real, honestly-sourced fallback name from the moment it exists in the
  skeleton.
- Queue progress (jobs queued, jobs in flight) is visible in the Sync Status Bar at
  all times, so "is something happening" never has to be inferred from a static
  screen.
- LLM-down / no-key / offline is a first-class, non-error product state, not a
  failure path: the skeleton keeps updating on every turn regardless, the queue
  holds, and badges stay amber — nothing crashes, nothing silently stops working.

**Validated by:** Slice 7 (staleness & status UI). `verify:slice-7` asserts a seeded
stale state renders the exact "N files changed since `<commit>`" badge text, and
that a queued-but-not-yet-run job still shows correctly in the status bar rather than
as an error. Slice 6's kill-LLM test additionally asserts the skeleton keeps
updating and jobs park cleanly (no crash) when the transport is unreachable.

## 5. `.arch/` merge conflicts / dirty-tree ambiguity

**Risk statement:** Because `.arch/` is committed alongside code, normal git
workflows (merges, rebases, branch switches, dirty working trees) can put it into a
state that doesn't cleanly correspond to any single commit, or produce merge
conflicts inside JSON files nobody is meant to hand-edit.

**Why it could kill the product:** If `.arch/` can end up lying about what commit it
reflects, or requires manual conflict resolution in a machine-generated file, it
becomes a maintenance burden layered on top of git rather than a transparent
byproduct of using the Hub — directly undermining "the developer never has to
remember to update anything."

**Mitigations:**
- Deterministic, sorted-key serialization (invariant 3 in `CLAUDE.md`) means most
  potential conflicts are trivial or don't occur at all — two branches that changed
  different, non-overlapping parts of the codebase produce non-overlapping diffs in
  `skeleton.json`, not the free-for-all a naive serializer would produce.
- A documented, explicit merge strategy for the cases that do conflict: on any
  `.arch/` conflict, delete and regenerate rather than hand-merge —
  `hub reindex` reproduces the skeleton straight from code, and semantics are
  union-merged by stable component ID with newest `provenance` winning per artifact.
  Nobody is ever expected to manually resolve JSON inside `.arch/`.
- Dirty working trees never pretend to be clean: the `commit` field in every
  snapshot is `"abc123+dirty"` when the worktree has uncommitted changes at
  extraction time, so provenance never claims a level of precision it doesn't have.

**Validated by:** Slice 4 (sync orchestration). `verify:slice-4`'s watcher tests
cover the dirty-tree (`+dirty` suffix) case directly; the delete-and-regenerate merge
strategy is validated by the `hub reindex` path exercised in the same slice's
kill-server/restart catch-up test, which is functionally identical to "reindex after
an unresolvable `.arch/` state."

## Open questions

These are named risks the MVP build must answer empirically — each has a working
default going in, but the default is not assumed correct until the noted slice
exercises it.

- **Onboarding-scan token cost on large repos.** The initial full semantic pass on a
  large or unfamiliar repo could be expensive in tokens before the developer has
  seen any value. Working mitigation: a breadth-first onboarding scan — a
  components-only first pass (cluster + one summary per component) rather than
  per-file semantic detail, with file-level detail generated on demand only when a
  node is actually opened. Not validated by a dedicated slice in the MVP; flagged
  here so slice 8's onboarding flow implementer treats it as a known constraint
  rather than an afterthought, and so post-MVP work (roadmap item 1, multi-project
  dashboard) doesn't multiply an unresolved cost across every tracked repo.
- **`Stop`-hook reliability during long subagent fan-outs.** A coordinator agent
  running many subagents in parallel may not produce a clean top-level `Stop` event
  per unit of meaningful work, risking long windows where real changes accumulate
  with no sync trigger. Working mitigation: `SubagentStop` is installed alongside
  `Stop` (both trigger the same ingest path), and the FS/git watcher is a backstop
  that syncs on a timer/change basis regardless of whether any hook fired at all —
  the same watcher fallback that mitigates risk 2 covers this case for free.
- **Git post-merge/post-checkout hooks vs. branch-switch watcher.** Branch switches
  and merges could in principle be caught more precisely with dedicated git hooks
  (`post-merge`, `post-checkout`) instead of inferring them from watching
  `.git/HEAD` and `.git/refs/**`. Decision: start with the watcher-based approach
  only — it requires no additional hook installation into the developer's git
  config, only into `.claude/settings.json`, keeping the Hub's footprint in the
  repo to one place. **Validate in slice 4**: `verify:slice-4` must demonstrate the
  watcher alone correctly detects a branch switch (bulk dirty set via
  `git diff --name-only HEAD@{1} HEAD`, full staleness recheck) before this question
  is considered closed; if watcher-only proves unreliable in practice, adding git
  hooks becomes a slice-4 follow-up, not a slice-8 surprise.
