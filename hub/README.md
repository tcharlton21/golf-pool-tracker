# The Hub

The Hub is an architecture-first development environment for solo, agent-driven
developers. It replaces the IDE as the daily driver: instead of a file tree and an
editor, the primary view is a living, drillable knowledge graph of a project's actual
architecture (system → components → APIs/pipelines/test suites → modules), with an
embedded terminal for running Claude Code alongside it. Code is reachable only as an
escape hatch ("open externally"), never edited in the Hub itself.

## Who it's for

A solo developer whose workflow is fully agent-driven — voice-dictate ideas, plan
vertical slices with AI, fan out Claude Code agents, get a working product — and who
does not read the code those agents produce. That developer needs a trustworthy,
current view of what the system actually is, not a stale `.md` plan file written
before the agents started.

## The core loop

- Claude Code edits files in a tracked repo; end-of-turn hooks (`Stop`,
  `SubagentStop`) fire and POST to the Hub — fire-and-forget, never able to slow or
  break the agent's turn.
- The Hub resolves the dirty set and runs deterministic static extraction, rebuilding
  the ground-truth **skeleton** (nodes, edges, file hashes) incrementally.
- The skeleton diff is persisted to SQLite and `.arch/skeleton.json`, and the graph
  canvas updates in the browser in about a second — before any LLM has run.
- Affected components are queued for LLM re-summarization in the background;
  per-node staleness badges show exactly what's stale and why until that resolves.
- The graph never silently drifts from the code: if it can't stay in sync, it says so
  instead of pretending to be current.

## Status

Design/docs phase — implementation not started. This package is the complete
specification the build fleet works from; no code exists yet.

## Docs map

```
docs/
  VISION.md            problem, product thesis, UX principles, non-goals, MVP definition
  ARCHITECTURE.md       system architecture, server components, frontend surfaces
  DATA_MODEL.md         graph node/edge kinds, .arch/ file layout, staleness computation
  SYNC_PIPELINE.md      hook installation, debounce, incremental extraction, semantic scheduling
  STACK.md              tech stack with rationale
  TESTING.md            golden-snapshot strategy, mock LLM transport, verify scripts
  ROADMAP.md            post-MVP plan
  RISKS.md              top risks and mitigations
  slices/
    SLICE-00-contracts-scaffold.md
    SLICE-01-terminal.md
    SLICE-02-extraction-engine.md
    SLICE-03-graph-store.md
    SLICE-04-sync-orchestration.md
    SLICE-05-graph-canvas.md
    SLICE-06-semantic-layer.md
    SLICE-07-staleness-ui.md
    SLICE-08-full-loop.md
```

Start at `CLAUDE.md` in this directory's parent — it is the fleet coordination file
and the required entry point for every build agent.

## A note on location

This `hub/` folder is self-contained: everything needed to build the Hub lives under
it. It currently sits inside an unrelated host repository for drafting purposes only
and will move to its own repository before implementation begins.
