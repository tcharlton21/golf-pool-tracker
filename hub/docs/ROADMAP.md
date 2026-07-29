# ROADMAP.md — Post-MVP

The MVP (slices 0–8) is deliberately narrow: one project, terminal + drillable graph
+ end-to-end sync, nothing else. Everything below is explicitly out of scope until
the MVP is done and the sync loop has proven itself trustworthy on a real project.
Nothing in this roadmap changes the two-layer principle, the staleness model, or the
`.arch/` layout — post-MVP work extends breadth and integrations on top of that
foundation, it does not touch it.

Order below is priority order, not a hard dependency chain unless a section says so.

## 1. Multi-project dashboard

**What:** A grid view of every tracked repo — sync health (skeleton current / stale
/ extracting), last activity timestamp, a stale-count sparkline per project. The
entry point before drilling into any single project's graph.

**Why:** The MVP assumes one project open at a time. A developer running several
agent-driven projects in parallel needs a single glance to know which ones drifted
while they weren't looking — the same honesty principle as per-node staleness
badges, applied at the project level.

**Rough dependencies:** Purely additive over existing data. `projects` is already a
table in the SQLite schema and the Graph Store already scopes everything by
`projectId`, so this is a new frontend surface plus a `GET /api/projects` summary
endpoint — no changes to the sync pipeline, extraction engine, or `.arch/` format.
Should land first among post-MVP items because every later post-MVP feature
(GitHub overlays, diff view, test explorer) is easier to build and test once there's
a real multi-project surface to hang them on.

## 2. GitHub/GitLab overlay integration

**What:** Pull PR and CI check state from GitHub/GitLab and pin it onto graph nodes
("which components does this open PR touch?", "whose tests are red on main?").
Commits get linked to the architecture snapshot recorded at that commit. This is
explicitly **not** version control — git stays git, the Hub never manages branches,
merges, or history; it only reads state to annotate the graph it already renders.

**Why:** The graph already answers "what does this system look like." Overlaying PR
and CI state answers "what's currently in flight, and is it safe," without asking
the developer to leave the Hub or read a diff.

**Rough dependencies:** Needs the multi-project dashboard's per-project chrome to
have somewhere to show overlay badges distinct from staleness badges (they must
never be visually confused — staleness is about the Hub's own honesty, PR/CI state
is about the outside world). Needs a new `overlays` table (or similar) in SQLite
keyed by node ID and provider, populated by a poller or webhook receiver — new
subsystem, does not touch the Sync Orchestrator, Extraction Engine, or Semantic Job
Queue.

## 3. Architecture-diff view between commits

**What:** A view that computes and renders the structural and semantic delta between
two commits' `.arch/` snapshots — "between v1.2 and v1.3: +2 components, Billing
gained a dependency on Notifications, 4 endpoints added." Pure computation over
already-versioned `.arch/` history (every commit already carries its own skeleton
and semantics, per the MVP's storage model); no new extraction, no new LLM calls
beyond describing the delta itself.

**Why:** This is the PR-review artifact for a developer who doesn't read code. Code
review as currently practiced assumes a reviewer reads the diff; this developer's
workflow structurally cannot include that. An architecture diff — stated in terms of
components, dependencies, and endpoints instead of lines — is the actual reviewable
unit for this product's user. **Flagged explicitly: this is the sleeper killer
feature of the whole post-MVP roadmap.** It costs relatively little (the hard part,
versioned deterministic `.arch/` snapshots, is already an MVP invariant) and answers
the single question the MVP's live graph cannot: "what changed, and should I care."

**Rough dependencies:** Needs nothing new in the server beyond a diff-computation
module reading two `.arch/` trees at two commits (`git show <rev>:.arch/skeleton.json`
etc.) — genuinely pure computation, no live extraction. Frontend needs a
commit-range picker and a diff-rendering view, which can reuse most of the Graph
Canvas's node/edge rendering with add/remove/change styling layered on. Benefits
from (2)'s commit-linking so a PR can deep-link straight into its diff view, but does
not require it — can ship standalone against local git history alone.

## 4. Test-suite explorer with coverage ingestion

**What:** A dedicated view over the existing `tests` edges (test-file → module),
extended with ingested coverage data (c8/istanbul JSON) to produce per-component
"verified behavior" panels — what's tested, what isn't, and how thoroughly.

**Why:** The MVP already extracts test files and links them to what they test via
import graph + naming heuristics. This turns that raw edge data into a first-class
answer to "do I actually trust this component," which matters enormously to a
developer who never reads the test code either.

**Rough dependencies:** Feeds off the existing `describe-tests` semantic job type,
already defined in the MVP's job taxonomy (`packages/server/src/semantic/workers/`)
but not built out fully. Needs a coverage ingestion adapter (reads a c8/istanbul JSON
report the developer's own test run produces — the Hub does not run tests itself)
and a new frontend panel. Independent of (1)–(3); can be built in parallel with any
of them.

## 5. Editor/terminal escape hatch

**What:** Turn the MVP's "open externally" placeholder into a real, configurable
action from any node: `open -a <app>`, `$EDITOR`, or `code --goto file:line`,
resolved per-file from the node's `files`/`meta.definedIn` skeleton data.

**Why:** The MVP ships the terminal and the concept of an escape hatch but the
richer, configurable jump-to-line behavior is not required to prove the sync loop —
it's a quality-of-life layer on top of data the skeleton already has.
**Never build an editor** — this item is explicitly bounded to shelling out to an
existing tool the developer already has configured; no in-Hub code view, ever, at
any point on this roadmap.

**Rough dependencies:** None beyond MVP skeleton data (file paths are already
recorded on every `module`/`api-endpoint`/`test-file` node). Purely additive
frontend + a small `POST /api/open` server endpoint that shells out. Can land
anytime; ordered here because it's low-risk and low-effort relative to items above.

## 6. L3 symbol level + `calls` edges

**What:** Add the `symbol` node kind (L3: exported function/class) and the `calls`
edge kind, both already reserved but unimplemented in the MVP's data model, via
tree-sitter tags queries for TS/JS. Add a Python analyzer (using `grimp` for the
import graph) behind the existing `Analyzer` interface (`packages/analyzers`), so the
Hub stops being TS/JS-only.

**Why:** The MVP intentionally stops at L2 (module/endpoint/pipeline/test-file) to
keep drill-down views small and the extraction engine simple. Once the sync loop and
the two-layer model have proven themselves, going one level deeper (and one language
wider) is a natural, additive extension of the same `Analyzer` interface designed for
this from day one — no architecture change, just a second and third implementation
of an interface that already exists.

**Rough dependencies:** Purely additive to `packages/analyzers`; the `Analyzer`
interface (`detect`/`extract` → `SkeletonDelta`) in `packages/shared` does not
change. Drill-down UI needs one more level below `module` in the Graph Canvas, which
is a configuration change to the existing ELK layout, not a new rendering system.
Should follow the test-suite explorer and diff view since symbol-level detail is the
least urgent of the depth-vs-breadth tradeoffs on this list — most "what does this
system look like" questions are answered by L0–L2.

## 7. Voice input

**What:** Push-to-talk dictation into the terminal panel — macOS's built-in
dictation to start, a Whisper-in-browser model later for a more integrated
experience.

**Why:** The product context names voice-dictating ideas as part of this developer's
actual workflow today (outside the Hub, into whatever's in front of them). Bringing
that into the terminal panel closes the loop between "have an idea out loud" and
"an agent is now working on it," without requiring the Hub to build any kind of
chat/prompt UI of its own — it's dictation into the existing dumb-pipe terminal, not
a new interaction model.

**Rough dependencies:** None on other roadmap items. Entirely scoped to
`packages/web/src/components/TerminalPanel/` plus, for the browser-Whisper phase, a
bundled model and a WASM inference path. Ordered last because it is the least
connected to the Hub's core differentiator (the graph) — it is a nice-to-have on the
terminal, which the MVP already treats as a secondary, "dumb pipe" surface by
design.
