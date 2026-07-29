# Hub Data Model

This document specifies the Hub's graph data model: the file formats under `.arch/`, the SQLite cache schema, ID and staleness rules, and merge/conflict handling. It is normative. Where an example JSON block appears, every field shown is required unless explicitly marked optional, and every field's writer, type, and determinism requirement is documented in the accompanying table.

## 1. The two-layer principle (law)

**The skeleton layer and the semantic layer live in separate files, written by separate code paths, and neither may ever write the other's files.**

- The **skeleton layer** (`manifest.json`, `skeleton.json`) is produced exclusively by the Extraction Engine: deterministic, LLM-free, pure static analysis. It is ground truth.
- The **semantic layer** (`semantics/**`, `diagrams/**`) is produced exclusively by Semantic Job Queue workers (LLM-backed). It is interpretation layered over ground truth.

Rationale: regenerating one layer must never be able to corrupt the other. A user can delete `semantics/` entirely and `hub reindex` will reproduce a fully correct, fully navigable graph (skeleton facts only, every badge grey) with zero data loss of ground truth. A user can delete `skeleton.json` and re-extraction reproduces it byte-for-byte from the working tree with zero dependency on any LLM ever having run. This is also why staleness (§6) is a pure function of the two layers compared against each other, not a flag either layer sets about itself.

The UI enforces this at render time: skeleton facts (node existence, member files, `depends-on`/`tests`/`exposes` edges) are always rendered, even when the corresponding semantic artifact is missing or stale. A grey badge means "no interpretation yet," never "no data."

## 2. Hierarchy (L0–L3)

Every node except the L0 system node has exactly one logical parent (`parentId`, §4 — computed, not necessarily a stored field; see below).

| Level | Node kinds | Produced by | Stored in |
|---|---|---|---|
| L0 | `system` (the project itself) | Implicit — not a materialized node row (see §4) | `projects` table / `manifest.json` context |
| L1 | `component` (logical subsystem), `test-suite` | **Semantic layer**: LLM clustering over the skeleton | `semantics/components.json` |
| L1 | `external-dep` (npm package group) | **Skeleton layer** — see exception below | `skeleton.json` |
| L2 | `module` (file or tight file group), `api-endpoint`, `pipeline` (named multi-step flow), `test-file` | **Skeleton layer** (static extraction); `pipeline` additionally gets an LLM-assigned display label | `skeleton.json` |
| L3 (post-MVP) | `symbol` (exported fn/class) | Skeleton layer (tree-sitter tags) | `skeleton.json` |

**Exception, stated explicitly because it looks like a contradiction of the L1 rule above and is not:** `external-dep` is an L1 node kind but is a static fact, not an interpretation — a dependency's name and resolved version are already fully determined by `package.json`/the lockfile, requiring no judgment. The Extraction Engine therefore writes `external-dep` nodes directly into `skeleton.json`, exactly like the `mod:`/`ep:`/`test:` example in the brief shows (`dep:hono`). `component` and `test-suite` are the only L1 kinds actually produced by clustering; `external-dep` never appears in `semantics/components.json`.

## 3. Edge kinds

Edges are stored **only at the level actually observed by extraction** — this is almost always L2 (module-to-module or module-to-endpoint), never pre-aggregated to L1. Aggregation to whatever level the UI is currently viewing happens at read time (§5, edge lifting). `member-of` (child → parent) is never stored as an edge; it is implied entirely by node membership (component membership in `semantics/components.json`, or the implicit skeleton hierarchy).

| Kind | Stored from → to (observed level) | Derivation | MVP / post-MVP |
|---|---|---|---|
| `depends-on` | `module` → `module` | Static import graph (dependency-cruiser) | MVP |
| `tests` | `test-file` → `module` | Static: import graph + naming/co-location heuristics (e.g. `pty.test.ts` imports and is named after `pty.ts`) | MVP |
| `exposes` | `module` (the module that registers the route) → `api-endpoint` | Static: route discovery during per-file extraction (tree-sitter pattern match on Express/Hono/Fastify/Next route-registration calls) | MVP |
| `calls` | `symbol` → `symbol` | Static, tree-sitter call-graph tags (L3) | Post-MVP |
| `deploys` | `component`/`module` → deployment target | Static/config-derived | Post-MVP |

**Note on `exposes` and component-level views:** the brief describes `exposes` conceptually as "component → api-endpoint" because that is the relationship a user cares about at the component drill level. Concretely, it is stored at the module level (the module that defines the route, which is already recorded in the endpoint node's `meta.definedIn`) and reaches "component → api-endpoint" purely through edge lifting (§5) once that module has been assigned to a component in `semantics/components.json`. There is no code path that writes a literal `component → api-endpoint` edge at extraction time — components don't exist yet when extraction runs.

## 4. `parentId` and drill-down semantics

`parentId` is a **logical, computed property**, not a field literally present on every stored node object (skeleton node JSON objects do not carry a `parentId` key — see the `skeleton.json` schema in §7). The Graph Store computes it as follows and caches the result in the SQLite `nodes.parent_id` column (§9):

- **L0 `system`.** No parent. Not itself a stored node; it is the implicit root every L1 node's `parentId` resolves to when unset.
- **L1 (`component`, `test-suite`, `external-dep`).** `parentId = system` (the project root), always. L1 is the top of the visible drill hierarchy.
- **L2 (`module`, `api-endpoint`, `pipeline`, `test-file`).** `parentId` = the id of the `component` (or `test-suite`) whose `members` array (in `semantics/components.json`) contains this node's id. If the node's id instead appears in `components.json`'s `unassigned` array, or `components.json` does not exist yet (no clustering has ever run), `parentId = system` — the node renders as a direct child of the project root until clustering assigns it. This is a normal, transient, honestly-rendered state (see `SYNC_PIPELINE.md` §Semantic scheduling), not an error.
- **L3 `symbol` (post-MVP).** `parentId` = the enclosing `module` id.

**Drill-down.** `getView(projectId, focusNodeId?)` returns exactly the set of nodes whose computed `parentId === focusNodeId` (or `=== system` when `focusNodeId` is omitted), plus every lifted edge whose endpoints both fall within that child set, plus per-node staleness. The frontend's breadcrumb trail is simply the stack of `focusNodeId`s the user has drilled through; navigating a breadcrumb re-issues `getView` with that ancestor's id.

## 5. Edge lifting

Edges are stored once, at the observed (mostly L2) level, per §3. Viewing any higher level requires **lifting**: aggregating every stored edge whose endpoints are descendants of two distinct currently-visible nodes into one rolled-up edge between those visible nodes.

Algorithm, executed by the Graph Store on every `getView` call for the requested `focusNodeId`:

1. Determine the visible node set `V` = children of `focusNodeId` (§4).
2. For each visible node `v ∈ V`, compute its descendant closure `desc(v)` (itself plus, transitively, every node whose computed `parentId` chain leads to `v` — for an L1 component this is its `members` set; for an L2/L3 node this is just itself, since it has no children yet at MVP).
3. For every stored edge `(from, to, kind)` in the project's current edge set: if `from ∈ desc(va)` and `to ∈ desc(vb)` for distinct `va, vb ∈ V`, accumulate it into a rolled-up edge keyed by `(va, vb, kind)`. Edges where `va === vb` (both endpoints resolve into the same visible node, e.g. an intra-component import) are **not** lifted into a self-edge; they are dropped from the lifted view and remain visible only when the user drills into `va`.
4. Each rolled-up edge carries `weight` = the count of underlying stored edges that fed it. Clicking a rolled-up edge in the Node Inspector lists the concrete underlying edges (their real `from`/`to` at the level they were stored).

This is a pure view-time computation over already-stored data — never a second storage location for the same fact. Because recomputing it on every `getView` call would be wasteful for hot views, the Graph Store caches lifted-edge rows in the SQLite `edges` table (marked `raw = 0`, see §9) and invalidates/recomputes them whenever the underlying skeleton edges or `components.json` membership changes.

## 6. `.arch/` directory layout

```
.arch/
  manifest.json          # schemaVersion, hubVersion, analyzer versions, generatedAt, extraction scope globs
  skeleton.json           # ground truth: all static nodes + edges + file hashes
  semantics/
    components.json       # clustering: component defs + membership assignments
    <componentId>.json    # per-component summary, provenance, mermaid ref
  diagrams/
    <componentId>.mmd     # exported Mermaid (export format only; live canvas never renders Mermaid)
    system.mmd
```

All files under `.arch/` are UTF-8 JSON (or, for `diagrams/*.mmd`, plain-text Mermaid source) and are committed to the repo alongside the code they describe — every commit carries its own architecture snapshot. `manifest.json` and `skeleton.json` are written with **deterministic sorted-key, sorted-array serialization**: object keys in a fixed, documented order (never `Object.keys()` insertion order), arrays sorted by node/edge id, so that a re-extraction of an unchanged tree produces byte-identical output and a real change produces a minimal, reviewable git diff. `semantics/**` files are written the same way for the same reason (byte-stable except where content genuinely changed).

## 7. JSON schemas

### 7.1 `manifest.json`

```jsonc
{
  "schemaVersion": 1,
  "hubVersion": "0.1.0",
  "analyzers": [
    { "id": "ts-js", "version": "1.0.0" }
  ],
  "generatedAt": "2026-07-29T18:00:00Z",
  "scope": {
    "include": ["**/*"],
    "exclude": ["**/*.test.ts", "**/*.spec.ts", "fixtures/**"],
    "respectGitignore": true
  }
}
```

| Field | Type | Written by | Determinism requirement |
|---|---|---|---|
| `schemaVersion` | integer | Extraction Engine, on every manifest write | Must equal `skeleton.json.schemaVersion` at all times. A mismatch (e.g. after a Hub upgrade that bumps the schema) is one of the full-extraction fallback triggers (`SYNC_PIPELINE.md` §Incremental extraction). |
| `hubVersion` | semver string | Hub Server, at extraction time | Informational only — never used for compatibility gating; `schemaVersion` is the gate. |
| `analyzers` | array of `{ id: string, version: string }` | Extraction Engine | One entry per analyzer that ran (MVP: always exactly `ts-js`). A version bump for any listed analyzer is a full-extraction fallback trigger. |
| `generatedAt` | ISO 8601 UTC timestamp | Extraction Engine | Updated on every extraction run, full or incremental. Not used in staleness comparisons (§8) — display/audit only. |
| `scope.include` / `scope.exclude` | array of glob strings | User-editable (via `hub track` onboarding prompts or direct file edit); read by Extraction Engine and FS Watcher | Determines which files are ever considered. Editing this and re-running is itself a full-extraction fallback trigger. |
| `scope.respectGitignore` | boolean, default `true` | User-editable | When `true`, gitignored paths are excluded even if matched by `include`. |

### 7.2 `skeleton.json`

```jsonc
{
  "schemaVersion": 1,
  "extractedAt": "2026-07-29T18:00:00Z",
  "commit": "a1b2c3d",            // HEAD at extraction; "a1b2c3d+dirty" if worktree dirty
  "files": {
    "src/server/pty.ts": { "hash": "sha256:9f...", "loc": 212, "lang": "ts" }
  },
  "nodes": [
    { "id": "mod:src/server/pty.ts", "kind": "module", "label": "pty.ts",
      "files": ["src/server/pty.ts"], "meta": { "exports": ["PtyManager"] } },
    { "id": "ep:POST:/api/hooks/claude-code", "kind": "api-endpoint",
      "label": "POST /api/hooks/claude-code",
      "meta": { "method": "POST", "path": "/api/hooks/claude-code", "definedIn": "src/server/routes.ts" } },
    { "id": "dep:hono", "kind": "external-dep", "label": "hono",
      "meta": { "version": "4.6.0" } },
    { "id": "test:test/pty.test.ts", "kind": "test-file", "label": "pty.test.ts",
      "files": ["test/pty.test.ts"], "meta": { "framework": "vitest" } }
  ],
  "edges": [
    { "from": "mod:src/server/index.ts", "to": "mod:src/server/pty.ts", "kind": "depends-on" },
    { "from": "test:test/pty.test.ts", "to": "mod:src/server/pty.ts", "kind": "tests" },
    { "from": "mod:src/server/routes.ts", "to": "ep:POST:/api/hooks/claude-code", "kind": "exposes" }
  ]
}
```

| Field | Type | Written by | Determinism requirement |
|---|---|---|---|
| `schemaVersion` | integer | Extraction Engine | Must equal `manifest.json.schemaVersion`. |
| `extractedAt` | ISO 8601 UTC timestamp | Extraction Engine, end of every run | Not part of staleness comparisons (§8); display/provenance only. |
| `commit` | string, git short SHA, optionally suffixed `+dirty` | Sync Orchestrator (resolves via `git rev-parse --short HEAD` and `git status --porcelain`), passed into the Extraction Engine to stamp | `+dirty` suffix is appended iff the worktree has any uncommitted changes *at the moment extraction runs*. Never used in staleness comparisons — see §11 for why this must not be conflated with staleness. |
| `files` | map of repo-relative POSIX path → `{ hash, loc, lang }` | Extraction Engine | `hash` = `sha256:` + hex digest of the file's current byte content; this is the sole input to staleness hash comparisons (§8). `loc` = line count. `lang` = analyzer-assigned language tag (`"ts"`, `"js"`, `"tsx"`, ...). Deterministic: identical file bytes always produce the identical hash. |
| `nodes` | array of node objects, sorted by `id` | Extraction Engine | See §8 for `id` derivation rules. `label` is a short human-readable display string (deterministically derived — e.g. the filename, or `METHOD path` — never LLM-generated at this layer). `files` (optional) lists the repo-relative source path(s) backing this node; present for `module` and `test-file`, absent for `external-dep`, present but a single synthetic entry for `api-endpoint`/`pipeline` referencing their `definedIn` file. `meta` is a kind-specific free-form object; kind-specific shapes: `module.meta = { exports: string[] }`; `api-endpoint.meta = { method, path, definedIn }`; `external-dep.meta = { version }`; `test-file.meta = { framework }`; `pipeline.meta = { definedIn, steps: string[] }`. |
| `edges` | array of `{ from, to, kind }`, sorted by `(from, to, kind)` | Extraction Engine | `from`/`to` are node ids that must exist in this same `nodes` array (or, transiently during a delta, in the previously-published skeleton — the Graph Store rejects/logs a dangling edge that doesn't resolve after a full apply). See §3 for which kinds are stored here at MVP. |

### 7.3 `semantics/components.json`

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-07-29T18:02:11Z",
  "components": [
    {
      "id": "cmp:sync-orchestrator",     // stable slug, assigned once, reused forever
      "kind": "component",                // "component" | "test-suite"
      "label": "Sync Orchestrator",
      "members": ["mod:src/server/sync/orchestrator.ts"],
      "provenance": {
        "generatedAt": "2026-07-29T18:02:11Z",
        "commit": "a1b2c3d",
        "model": "claude-sonnet-4-5",
        "promptVersion": 2
      }
    }
  ],
  "unassigned": ["mod:src/scratch.ts"]
}
```

| Field | Type | Written by | Determinism requirement |
|---|---|---|---|
| `schemaVersion` | integer | Semantic Job Queue (`cluster` job worker), via Graph Store | Independent of `skeleton.json.schemaVersion`; governs the shape of this file only. |
| `generatedAt` | ISO 8601 UTC timestamp | `cluster` job worker | Timestamp of the run that last touched this file (may reflect an incremental anchored update, not necessarily a full re-cluster). |
| `components[].id` | string, `cmp:`-prefixed stable slug | `cluster` job worker, **once**, at first creation of that component | **Never regenerated.** Assigned deterministically from the LLM-chosen label at creation time (kebab-case; collision-suffixed `-2`, `-3`, ... if the slug already exists) and frozen forever after, even across future clustering runs that would prefer a different name. This is the single most important invariant for trust (`SYNC_PIPELINE.md` §Semantic scheduling, risk #1). |
| `components[].kind` | `"component"` \| `"test-suite"` | `cluster` job worker | Distinguishes L1 kinds sharing this same file; MVP always produces `"component"` — `test-suite` clustering uses the identical mechanism and is enabled once test-file volume in a project warrants it. |
| `components[].label` | string | `cluster` job worker; mutable | Display name. Unlike `id`, may be updated by a later clustering or a user rename action without changing identity. |
| `components[].members` | array of skeleton node ids (sorted) | `cluster` job worker | Every id must reference an existing `skeleton.json` node. Membership must be **total or explicit**: every skeleton node eligible for clustering (currently: `module`, `api-endpoint`, `pipeline`, `test-file`) appears in exactly one `components[].members` array or in top-level `unassigned` — never in neither, never in both. |
| `components[].provenance.generatedAt` | ISO 8601 UTC timestamp | `cluster` job worker | Per-component provenance, used as the tiebreaker in merge conflicts (§13). |
| `components[].provenance.commit` | string, `+dirty`-suffixed as needed | `cluster` job worker | Same semantics as `skeleton.json.commit`. |
| `components[].provenance.model` | string, model identifier | `cluster` job worker | E.g. `"claude-sonnet-4-5"`. |
| `components[].provenance.promptVersion` | integer | `cluster` job worker | Bumped whenever the clustering prompt changes; used for debugging drift, not for staleness. |
| `unassigned` | array of skeleton node ids (sorted) | `cluster` job worker | Nodes with no component yet. Renders as direct children of the system root (§4) with a grey badge (never summarized, because there is no component to summarize).

### 7.4 `semantics/<componentId>.json`

```jsonc
{
  "componentId": "cmp:sync-orchestrator",
  "summary": "Coordinates dirty-file tracking, debounced incremental extraction...",
  "responsibilities": ["Track per-project dirty sets", "Debounce and coalesce sync triggers", "..."],
  "testCoverageNotes": "Covered by test/sync/orchestrator.test.ts; no coverage for branch-switch bulk-dirty path.",
  "diagram": "diagrams/cmp-sync-orchestrator.mmd",
  "provenance": {
    "generatedAt": "2026-07-29T18:02:11Z",
    "commit": "a1b2c3d",
    "model": "claude-sonnet-4-5",
    "inputHashes": { "src/server/sync/orchestrator.ts": "sha256:9f..." },
    "promptVersion": 3
  }
}
```

| Field | Type | Written by | Determinism requirement |
|---|---|---|---|
| `componentId` | string | `summarize-component` job worker | Must equal the filename stem (`<componentId>.json`) and an id present in `components.json.components[].id`. |
| `summary` | string (prose) | `summarize-component` job worker | Free text; non-deterministic (LLM output) by nature — this is expected and is exactly what provenance/staleness exist to bound. |
| `responsibilities` | array of strings | `summarize-component` job worker | Bullet list rendered in the Node Inspector. |
| `testCoverageNotes` | string, optional | `summarize-component` job worker (may consult `tests` edges) | Free text. |
| `diagram` | string, repo-relative path under `diagrams/` | `diagram` job worker (piggybacks after a successful `summarize-component`) | Absent until the `diagram` job for this component has run at least once; the Inspector's "Export Mermaid" action can also populate it on demand. |
| `provenance.generatedAt` | ISO 8601 UTC timestamp | `summarize-component` job worker | |
| `provenance.commit` | string, `+dirty`-suffixed as needed | `summarize-component` job worker | Display/audit only — see §11: never used to compute staleness. |
| `provenance.model` | string | `summarize-component` job worker | |
| `provenance.inputHashes` | map of repo-relative file path → `sha256:` hash | `summarize-component` job worker, copied from `skeleton.json.files` at generation time, restricted to the current member footprint of the component | **This is the entire staleness input.** See §8 for the exact pure function. Key set = the flattened `files` of every node in `components.json.components[].members` for this component at generation time. |
| `provenance.promptVersion` | integer | `summarize-component` job worker | |

## 8. Deterministic ID rules

| Node kind | ID pattern | Example | Notes |
|---|---|---|---|
| `module` | `mod:` + repo-relative POSIX path | `mod:src/server/pty.ts` | A "tight file group" module (post-MVP grouping, e.g. `Foo.tsx` + `Foo.module.css`) uses the primary/entry file's path. |
| `api-endpoint` | `ep:` + `METHOD` + `:` + normalized route path | `ep:POST:/api/hooks/claude-code` | Route path is normalized as authored in code (e.g. Express `:id` params kept literally, not resolved) so re-extraction is stable. |
| `external-dep` | `dep:` + exact npm package name (scope slash kept as-is; JSON ids are not filesystem paths) | `dep:hono`, `dep:@anthropic-ai/claude-agent-sdk` | One node per direct dependency listed in `package.json`; version lives in `meta.version`, not the id, so a version bump does not change the node's identity. |
| `test-file` | `test:` + repo-relative POSIX path | `test:test/pty.test.ts` | |
| `pipeline` | `pipe:` + a content-derived slug (entry-point file path + ordered step signature), **not** the LLM-assigned label | `pipe:src-server-hooks-ingest` | The id must stay stable even when the LLM-assigned `label` changes on a later run — identical rule to why `component` ids are frozen (§7.3). Implementers must not derive this id from any LLM output. |
| `component` / `test-suite` | `cmp:` + stable kebab-case slug of the label **at creation time**, collision-suffixed | `cmp:sync-orchestrator`, `cmp:sync-orchestrator-2` | Assigned once by the `cluster` job worker; frozen forever after (§7.3). |
| `symbol` (post-MVP) | `sym:` + module path + `#` + export name | `sym:src/server/pty.ts#PtyManager` | |

All skeleton-layer ids (`mod:`, `ep:`, `dep:`, `test:`, `pipe:`) are fully deterministic functions of the current file tree — re-extracting an unchanged tree reproduces byte-identical ids, which is what makes cross-commit skeleton diffs meaningful. Semantic-layer ids (`cmp:`) are deterministic-once-assigned but their assignment itself is an LLM decision made exactly once per component's lifetime.

## 9. SQLite schema

The SQLite database is **entirely a cache**. Every table in this section is disposable: `hub reindex` drops and rebuilds `nodes`, `edges`, `files`, and `semantic_artifacts` from `.arch/` (walking the repo tree fresh if `.arch/` itself is missing/corrupt), and truncates `jobs` and `events` (these two are pure runtime/operational state with no `.arch/` counterpart to rebuild from — see the per-table notes below). Losing the entire SQLite file is never a data-loss event for anything that matters; it costs one reindex pass.

better-sqlite3, WAL mode, hand-written DAOs (no ORM — see `STACK.md`).

**`projects`** — one row per tracked repo. *Cache of tracking state; `repo_path` is the only field with no `.arch/`-independent source of truth (it's operator input), so reindex preserves this table's rows and only re-derives the other tables.*

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | Stable slug, e.g. derived from repo dir name, collision-suffixed. |
| `name` | TEXT | Display name. |
| `repo_path` | TEXT, UNIQUE | Absolute filesystem path, realpath-normalized. |
| `tracked_at` | TEXT (ISO 8601) | |
| `last_extracted_at` | TEXT (ISO 8601), nullable | Mirrors `skeleton.json.extractedAt`. |
| `last_commit` | TEXT, nullable | Mirrors `skeleton.json.commit` (may carry `+dirty`). |
| `hooks_installed` | INTEGER (bool) | |
| `watcher_active` | INTEGER (bool) | |

**`nodes`** — cache mirror of the current `skeleton.json.nodes` plus the computed `parent_id` (§4). *Fully disposable; rebuilt verbatim from `.arch/skeleton.json` and `.arch/semantics/components.json` on reindex.*

| Column | Type | Notes |
|---|---|---|
| `project_id` | TEXT, FK → `projects.id` | Composite PK with `id`. |
| `id` | TEXT | Skeleton node id (§8). |
| `kind` | TEXT | |
| `label` | TEXT | |
| `parent_id` | TEXT, nullable | Computed per §4; NULL = direct child of system root. Recomputed whenever `components.json` changes. |
| `files` | TEXT (JSON array) | |
| `meta` | TEXT (JSON object) | |
| `created_at` / `updated_at` | TEXT (ISO 8601) | |

**`edges`** — both raw stored edges (mirroring `skeleton.json.edges`) and cached lifted/derived edges (§5), disambiguated by `raw`. *Fully disposable; raw rows rebuilt from `.arch/skeleton.json`, non-raw rows recomputed on demand.*

| Column | Type | Notes |
|---|---|---|
| `project_id` | TEXT, FK → `projects.id` | |
| `id` | INTEGER PK AUTOINCREMENT | Surrogate key (raw edges have no natural single-column key; `(from_id,to_id,kind)` isn't unique once lifted rows share it at a different level). |
| `from_id` | TEXT | |
| `to_id` | TEXT | |
| `kind` | TEXT | `depends-on` \| `tests` \| `exposes` \| `calls` \| `deploys`. |
| `raw` | INTEGER (bool) | `1` = literal row from `skeleton.json.edges`. `0` = view-time-lifted/derived cache row (§5); these rows are safe to delete and lazily recompute at any time. |
| `weight` | INTEGER, nullable | Only set on `raw = 0` rows: count of underlying raw edges this lifted edge summarizes. |
| `computed_at` | TEXT (ISO 8601), nullable | Only set on `raw = 0` rows; used to invalidate the lifted-edge cache when skeleton/`components.json` changes. |

**`files`** — cache mirror of `skeleton.json.files`. *Fully disposable.*

| Column | Type | Notes |
|---|---|---|
| `project_id` | TEXT, FK | |
| `path` | TEXT | Composite PK with `project_id`. |
| `hash` | TEXT | `sha256:...`. |
| `loc` | INTEGER | |
| `lang` | TEXT | |
| `updated_at` | TEXT (ISO 8601) | |

**`semantic_artifacts`** — cache mirror of each `semantics/<componentId>.json` plus the *computed* (never stored-in-JSON) staleness flag. *Rebuilt from `.arch/semantics/*.json` on reindex; the `stale`/`stale_reason` columns are always recomputed against the current skeleton immediately after rebuild, never read from the JSON file (staleness is never persisted as ground truth inside `.arch/` itself — see §10).*

| Column | Type | Notes |
|---|---|---|
| `project_id` | TEXT, FK | |
| `component_id` | TEXT | Composite PK with `project_id`. |
| `summary` | TEXT | |
| `responsibilities` | TEXT (JSON array) | |
| `test_coverage_notes` | TEXT, nullable | |
| `diagram_path` | TEXT, nullable | |
| `generated_at` | TEXT (ISO 8601) | |
| `commit` | TEXT | |
| `model` | TEXT | |
| `input_hashes` | TEXT (JSON object) | |
| `prompt_version` | INTEGER | |
| `stale` | INTEGER (bool) | Maintained on every skeleton write (§10), not just on read — kept warm so the Sync Status Bar's aggregate counts are cheap. |
| `stale_reason` | TEXT, nullable | `"hash-mismatch"` \| `"membership-changed"` \| NULL. |

**`jobs`** — Semantic Job Queue's operational state. **Not reconstructable from `.arch/`** — this is pure runtime state (what's queued, running, retrying, or parked right now). `hub reindex` truncates this table; nothing is lost that matters, because the next sync cycle's staleness recompute will naturally re-enqueue whatever is genuinely stale, and any user-visible "in progress" state simply resets to "not yet requested" (accurately, since a reindex means the Hub just restarted its bookkeeping).

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK (UUID) | |
| `project_id` | TEXT, FK | |
| `type` | TEXT | `cluster` \| `summarize-component` \| `diagram` \| `describe-tests`. |
| `target_id` | TEXT, nullable | Component id (NULL for project-wide `cluster`). |
| `dedup_key` | TEXT | `"<type>:<target_id>"`. Unique among rows with `status IN ('queued')` — enforced at enqueue time, not as a hard SQL UNIQUE constraint spanning all statuses, since history rows must be allowed to repeat a key. |
| `status` | TEXT | `queued` \| `running` \| `succeeded` \| `failed` \| `parked-failed`. |
| `priority` | INTEGER | Lower dispatches first; see `SYNC_PIPELINE.md` §Semantic scheduling. |
| `attempt` | INTEGER, default 0 | |
| `max_attempts` | INTEGER, default 3 | |
| `next_attempt_at` | TEXT (ISO 8601), nullable | Backoff scheduling. |
| `created_at` / `started_at` / `finished_at` | TEXT (ISO 8601), nullable | |
| `error` | TEXT, nullable | Last failure message. |

**`events`** — append-only audit log (hook arrivals, watcher events, git ref changes, extraction start/complete/failed, job lifecycle). **Not reconstructable from `.arch/`** — pure operational log, used for hook-health detection (`SYNC_PIPELINE.md` §Hook health) and debugging. `hub reindex` truncates this table.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `project_id` | TEXT, FK | |
| `type` | TEXT | E.g. `hook.stop`, `hook.subagent-stop`, `hook.post-tool-use`, `hook.session-end`, `hook.unmapped`, `watcher.change`, `git.commit`, `git.branch-switch`, `extraction.start`, `extraction.complete`, `extraction.failed`, `job.enqueued`, `job.completed`, `job.failed`. |
| `payload` | TEXT (JSON), nullable | E.g. dirty paths, `session_id`. |
| `created_at` | TEXT (ISO 8601) | |

## 10. Staleness — precise specification

A semantic artifact (a `semantics/<componentId>.json` document) is **stale** iff:

```
isStale(artifact, currentSkeleton, currentComponents) :=
     ∃ (path, hash) ∈ artifact.provenance.inputHashes
         such that currentSkeleton.files[path] is undefined
              or currentSkeleton.files[path].hash ≠ hash
  OR
     footprint(artifact.componentId, currentComponents) ≠ keys(artifact.provenance.inputHashes)
```

where `footprint(componentId, currentComponents)` is the current flattened set of repo-relative file paths across every skeleton node listed in `currentComponents.components[componentId].members` (i.e. the union of each member node's `files[]`).

In words, exactly as the brief states it: **stale iff any file in `provenance.inputHashes` now has a different (or missing) skeleton hash, OR a member file was added to or removed from the component's current skeleton footprint since generation.** This is a pure function of the two layers — zero LLM calls, computed instantly, and re-evaluated by the Graph Store on every skeleton write and every `components.json` write (§10 recomputation trigger), never lazily deferred to render time only.

**Badge states** — one of exactly three, rendered per L1 node (components/test-suites) and, by inheritance in the Inspector, contextually noted for their L2 children:

| Badge | Meaning | Condition |
|---|---|---|
| Green | "Verified against current tree." | A `semantic_artifacts` row exists for this component and `isStale = false`. |
| Amber | "Derived from commit X, N files changed since." | A `semantic_artifacts` row exists and `isStale = true`. The exact `N` and the file list are computed by diffing `footprint(...)` against `inputHashes` keys (additions/removals) unioned with the set of paths whose hash differs, and are shown one click away in the Inspector, not inline. |
| Grey | "Never summarized." | No `semantic_artifacts` row exists for this component id at all (new component, or `unassigned` node with no component yet). |

The skeleton layer itself is **never stale by construction** — it has no "staleness" concept; it either reflects the current tree (normal) or, if an extraction run itself failed outright, the Sync Status Bar reports a distinct global condition, "skeleton stale since `<time>`," which is a banner about the *pipeline*, not a per-node badge (`SYNC_PIPELINE.md` §Degradation modes). This condition is never silent.

## 11. Dirty-worktree commit marking

`skeleton.json.commit` and every `provenance.commit` field are stamped `"<shortsha>+dirty"` whenever `git status --porcelain` is non-empty **at the moment that write happens**. This is provenance display text only — it must never be compared as part of staleness (§10), and implementers must not build any logic that diffs commit strings to decide freshness. Concretely: an artifact generated against `"a1b2c3d+dirty"` remains **green** after the developer later commits that exact tree state as `"e4f5678"`, because the file hashes in `inputHashes` still match — nothing about the code changed, only its commit status. The `+dirty` suffix exists purely so a human reading provenance never mistakes a snapshot of uncommitted work for a snapshot of a real commit.

## 12. Merge-conflict strategy for `.arch/` files

Because `skeleton.json` is a pure deterministic function of the tree and `semantics/**` files carry explicit per-entry provenance, `.arch/` conflicts are resolved procedurally, never by hand-editing JSON:

1. **`skeleton.json` / `manifest.json` conflicts.** Do not attempt a textual/structural merge. Delete both conflicting versions and run a full extraction (the same code path `hub reindex` uses) against the already-merged working tree — the merge commit's resulting file tree is ground truth, and the skeleton is always losslessly reproducible from it. This must be automated as part of the standard post-merge flow, not a manual step.
2. **`semantics/components.json` conflicts.** Union the two sides' `components[]` arrays by `id`. An id present on only one side is kept as-is. An id present on both sides with identical `members` is kept as-is (trivial, expected to be the common case — deterministic serialization keeps unrelated entries byte-identical). An id present on both sides with *different* `members` is a genuine semantic conflict: resolve by keeping the version whose corresponding `semantics/<componentId>.json` has the later `provenance.generatedAt` (component entries don't carry their own timestamp; the per-component file is the source of truth for recency), and discard the other side's membership for that id. After union, re-run the "membership must be total" check (§7.3) — any skeleton node now unclaimed falls into `unassigned` until the next `cluster` run picks it up.
3. **`semantics/<componentId>.json` conflicts.** Both branches independently resummarized the same component. Keep whichever side has the later `provenance.generatedAt`; discard the other. No manual merge — regenerating a summary is cheap and a "Re-summarize now" action is always available if the surviving version turns out stale.
4. **`diagrams/*.mmd` conflicts.** Never merge. These are pure exports derived from the winning `semantics/<componentId>.json`; discard both sides and regenerate (re-run the `diagram` job, or let the next successful `summarize-component` piggyback trigger it).
5. This procedure is exposed as part of `hub reindex`'s conflict-repair mode: it refuses to run while unresolved git conflict markers remain anywhere under `.arch/` (i.e. it must run **after** `git merge --continue`/`git rebase --continue`, never instead of resolving the git-level conflict), then applies rules 1–4 non-interactively and writes the resolved files back with the standard deterministic serialization.
