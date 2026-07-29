# Hub Technology Stack — Architecture Decision Records

Each entry below is a locked decision for the Hub's implementation. Format: Context / Decision / Rationale / Revisit-when. These are binding on implementers — do not substitute an alternative without the coordinator explicitly reopening the ADR.

---

### ADR-01: Node 22 LTS over Bun

- **Context.** The Hub needs a long-lived local server process hosting native addons (`node-pty`, `better-sqlite3`) plus a terminal that must be rock-solid.
- **Decision.** Node 22 LTS.
- **Rationale.** `node-pty` and `better-sqlite3` are battle-tested on Node; the terminal is core, non-negotiable functionality, and native-module ecosystem maturity trumps runtime novelty. Bun's main advantage — faster cold start — is close to irrelevant for a process the user starts once per day and leaves running.
- **Revisit-when.** `node-pty`/`better-sqlite3` (or their functional equivalents) reach equivalent stability on Bun, and a concrete pain point with Node (not a hypothetical speed gain) appears.

### ADR-02: pnpm workspaces monorepo, `packages/shared` contracts-first

- **Context.** The Hub is built by a fleet of Claude coding agents working on different slices in parallel; cross-slice compatibility cannot depend on humans reading diffs.
- **Decision.** pnpm workspaces with `packages/shared`, `packages/server`, `packages/web`, `packages/analyzers`. `packages/shared` (zod schemas for the graph data model and every WS/HTTP contract) is written first, in slice 0, before any consuming package.
- **Rationale.** A shared, versioned, schema-validated contracts package is what lets agent-built slices stay compatible without a human mediating integration — every producer and consumer imports the same zod types, so a contract violation is a type error or a runtime validation failure, not a silent drift.
- **Revisit-when.** Never, at MVP scope — this is foundational to the agent-built-without-human-code-review premise.

### ADR-03: Hono (on `@hono/node-server`)

- **Context.** Need an HTTP framework for `/api/*` and to host the `ws` upgrade handshake on the same port (4820).
- **Decision.** Hono.
- **Rationale.** TypeScript-first, minimal, and its `zod-validator` middleware plugs directly into the `packages/shared` contracts — request/response validation is declarative, not hand-rolled. Small footprint keeps the "one local Node process" model lightweight.
- **Revisit-when.** Hono can no longer cleanly coexist with the raw `ws` upgrade on the same HTTP server, or a hard requirement emerges that only a heavier framework satisfies.

### ADR-04: plain `ws` on the same HTTP server

- **Context.** Two distinct WebSocket concerns exist: topic pub/sub (`/ws/events`) and raw PTY byte streaming (`/ws/pty/:sessionId`).
- **Decision.** The `ws` package, attached to the same underlying HTTP server Hono runs on, path-routed manually.
- **Rationale.** Both use cases are simple enough (pub/sub fan-out; raw byte passthrough) that a heavier realtime framework (Socket.IO, etc.) would add abstraction the Hub doesn't need and would obscure the raw-byte PTY path, which must not be reinterpreted/framed by a higher-level protocol.
- **Revisit-when.** A requirement for automatic reconnection/room semantics beyond what the WebSocket Gateway's own topic subscription bookkeeping provides emerges.

### ADR-05: better-sqlite3, no ORM

- **Context.** The Hub needs a local, disposable cache (`projects`, `nodes`, `edges`, `files`, `semantic_artifacts`, `jobs`, `events`) with a single writer (the Hub Server process itself).
- **Decision.** `better-sqlite3` in WAL mode, hand-written DAOs — no ORM.
- **Rationale.** `better-sqlite3`'s synchronous API is a natural fit for a single local writer with no concurrent-connection story to manage. An ORM's value proposition (query building, migrations abstraction, multi-dialect portability) is close to zero here — there's exactly one dialect, forever — while its cost (another layer of generated code and conventions for agent-built slices to learn and get subtly wrong) is real. Hand-written DAOs over ~7 tables are small enough to be fully legible and fully covered by Vitest.
- **Revisit-when.** The schema grows enough (many more tables, complex relational queries) that hand-written SQL becomes the actual bottleneck for agent velocity, not a hypothetical one.

### ADR-06: node-pty + @xterm/xterm

- **Context.** Terminal Panel needs a real PTY on the server side and a real terminal emulator in the browser.
- **Decision.** `node-pty` (server) + `@xterm/xterm` with the `fit` and `webgl` addons (browser).
- **Rationale.** This is the only serious option for a from-scratch web-based terminal — it's the same pairing VS Code, Hyper, and most browser-terminal products use. No meaningful alternative was considered.
- **Revisit-when.** Never, barring the pairing itself becoming unmaintained.

### ADR-07: dependency-cruiser as a library + web-tree-sitter (WASM)

- **Context.** The Extraction Engine needs (a) a whole-repo import graph respecting tsconfig path aliases, monorepo package boundaries, and dynamic imports, and (b) fast per-file structural facts (exports, route registrations, test markers).
- **Decision.** `dependency-cruiser`, used as a library (not its CLI), for the import graph. `web-tree-sitter` (WASM grammars) for per-file parsing.
- **Rationale.** Import/module resolution — tsconfig `paths`, monorepo package aliasing, dynamic `import()`, CJS/ESM interop — **is the tar pit**. Hand-rolling a resolver is a multi-week correctness sink with an unbounded long tail of edge cases (exactly the kind of task that silently produces a subtly-wrong skeleton, which is the one failure mode this product cannot tolerate). `dependency-cruiser` has already solved this and is battle-tested across real-world monorepos — **do not hand-roll module resolution.** `web-tree-sitter`'s WASM distribution avoids native-build pain (no per-platform binary compilation step for agents to get wrong) while remaining fast enough for per-file incremental parsing within the 2-second/2k-file budget.
- **Revisit-when.** `dependency-cruiser`'s resolution proves insufficient for a resolution pattern the Hub must support (flag any such case explicitly rather than patching around it), or WASM parsing throughput becomes the incremental-extraction bottleneck at real project scale.

### ADR-08: chokidar v4

- **Context.** Fallback filesystem watching (§ `SYNC_PIPELINE.md`) plus the narrow `.git/HEAD`/`refs` watch.
- **Decision.** chokidar v4.
- **Rationale.** Standard, cross-platform-correct choice; v4 drops the fsevents native dependency's biggest historical pain points while keeping the same ignore/glob ergonomics the Hub's ignore-rule logic depends on.
- **Revisit-when.** A platform-specific reliability issue chokidar can't address surfaces (unlikely at MVP scope: macOS-only).

### ADR-09: React Flow (@xyflow/react) + elkjs (`elk.layered`) over Cytoscape/D3

- **Context.** Graph Canvas renders one drill level at a time — the children of a focused node — not the whole project graph simultaneously.
- **Decision.** React Flow for rendering/interaction, elkjs's `elk.layered` algorithm for layout, invoked fresh on each drill transition.
- **Rationale.** Two decisive arguments. First, **scale**: because the product is drill-down (never a full-project hairball view), any single rendered view is on the order of **5–40 nodes** — graph-rendering libraries' large-scale performance characteristics (which is where Cytoscape/D3 earn their complexity budget) are simply not a consideration here; optimizing for 10,000-node rendering would be solving a problem the Hub doesn't have. Second, **nodes-as-React-components**: every node needs live badges (staleness color), spinners (during extraction), and inline actions — React Flow renders each node as an actual React component, so these are ordinary React state/props, styled and tested like any other component. Cytoscape and D3 both render to canvas/SVG with their own imperative update model, fighting React's data flow at every turn and costing real agent-implementation effort for zero benefit at this scale.
- **Revisit-when.** A future post-MVP view genuinely needs simultaneous large-N rendering (e.g. a whole-project "everything" overview beyond the drill model) — evaluate then, don't pre-optimize now.

### ADR-10: Mermaid as export-only format

- **Context.** Diagrams are a valuable artifact (`diagrams/*.mmd`, the Node Inspector's "Export Mermaid" action) but the live canvas is React Flow.
- **Decision.** Mermaid `.mmd` files are generated only as a static export target; the live, interactive Graph Canvas never renders Mermaid.
- **Rationale.** Mermaid is excellent as a portable, git-diffable, copy-pasteable-into-docs artifact, but it is not an interactive rendering surface — it has no notion of live badges, click-to-drill, or WS-driven updates. Keeping it export-only avoids building and maintaining two rendering paths for the same graph; React Flow is the only live path, Mermaid is the only "take this with you" path.
- **Revisit-when.** Never expected to change — this is a permanent separation of concerns, not a placeholder.

### ADR-11: Zustand, no TanStack Query

- **Context.** Frontend state is driven almost entirely by server-pushed WebSocket deltas (`graph.skeleton-updated`, `graph.semantics-updated`, `sync.status`, `job.progress`), not client-initiated polling/caching.
- **Decision.** Zustand as the single client state store, updated by a WS-delta reducer. No TanStack Query (or any request-cache library).
- **Rationale.** This is a push-based app: the server is the source of truth and tells the client what changed, when. TanStack Query's value proposition — cache invalidation, refetch-on-window-focus, stale-while-revalidate around pull-based REST calls — solves a problem this architecture doesn't have. A plain Zustand store with a reducer that applies incoming deltas (and an initial `getView` fetch to seed it) is simpler and matches the actual data flow.
- **Revisit-when.** A view emerges that is genuinely pull/poll-based rather than push-driven (none identified at MVP).

### ADR-12: Claude Agent SDK with `claude -p` subprocess fallback

- **Context.** Semantic Job Queue workers need to run constrained, headless LLM reasoning over repo contents (clustering, summaries, diagrams, test descriptions).
- **Decision.** `@anthropic-ai/claude-agent-sdk` as the primary transport; `claude -p --output-format json` as a subprocess fallback under the identical job contract (same input, same JSON-schema-validated output shape).
- **Rationale.** Reuses the developer's existing Claude Code authentication — no separate API key provisioning step for the Hub to own. The SDK path gives structured tool-call control (constraining workers to `Read`/`Grep`/`Glob` only); the `claude -p` fallback exists for environments/versions where the SDK path is unavailable, without requiring workers to know which transport is active — the job contract (constrained tools, schema-validated JSON out) is identical either way.
- **Revisit-when.** The SDK path becomes universally available/reliable enough that the subprocess fallback is dead code worth removing, or a different auth model is adopted.

### ADR-13: Vitest + Playwright

- **Context.** No human reads the code to confirm a slice is done — every slice's Definition of Done must be machine-verifiable.
- **Decision.** Vitest for server-side unit/golden-snapshot tests (extraction determinism, staleness computation, scheduling rules); Playwright for end-to-end browser tests (terminal round-trip, drill-down, badge updates).
- **Rationale.** This pairing is central to agent-buildability, not incidental tooling: golden snapshots (`fixtures/golden/`) are what make "byte-identical to expected output" an executable assertion rather than a human judgment call, and Playwright driving a real browser against a real Hub Server is what makes "the UI actually updates on a WS delta" verifiable without a human watching a screen.
- **Revisit-when.** Never expected to change at MVP; if a slice's DoD can't be expressed in one of these two frameworks, that's a signal the slice's scope needs rethinking, not a signal to add a third test framework.

### ADR-14: local web app over Electron/Tauri

- **Context.** The Hub needs a UI shell for a daily-driver, terminal-plus-graph tool on a single developer's Mac.
- **Decision.** Plain local web app: Node server + Vite-built frontend opened in the system browser. No Electron or Tauri wrapper at MVP.
- **Rationale.** A browser tab against a localhost server delivers the full terminal-plus-graph experience with none of Electron/Tauri's packaging, auto-update, and native-shell maintenance burden — burden that provides zero product value until the Hub needs OS-level integration (menu bar presence, global shortcuts, notifications) it doesn't need yet. Explicitly deferred, not rejected.
- **Revisit-when.** A concrete requirement needs OS-level chrome a browser tab structurally cannot provide (e.g. persistent background presence without a browser tab open, global keyboard shortcuts, a dock icon). Electron wrap is the documented next step at that point, not a rewrite.

### ADR-15: vanilla over IDE fork

- **Context.** The Hub replaces the IDE as the daily driver for a user who does not read code, but code must still be reachable when needed.
- **Decision.** Never build an editor. Code access is exclusively an "open externally" escape hatch: `open -a`, `$EDITOR`, or `code --goto file:line` from any node in the Inspector.
- **Rationale.** Forking or embedding an editor (Monaco, a VS Code fork, etc.) is an enormous, ongoing maintenance surface in service of a use case the product's own premise says is secondary — the user does not read code as their primary workflow, the graph is. Delegating to whatever editor is already installed is strictly less work and strictly more respectful of the user's existing tooling choices than reimplementing a worse version of it.
- **Revisit-when.** Never, at any roadmap horizon currently defined — this is a foundational product stance (per the design brief's "vanilla — no IDE fork; never build an editor"), not a resourcing tradeoff to revisit later.
