# Slice 1 — Terminal

## Goal

Give the Hub its embedded terminal: a PTY manager on the server, a `/ws/pty/:sessionId`
bridge, and a tabbed xterm.js panel on the frontend with reattach-after-refresh
support. This is fully independent of the sync loop — the terminal is a dumb pipe.

## Required reading

`CLAUDE.md` (esp. invariant 7 — the terminal never drives sync), `docs/VISION.md`,
`docs/ARCHITECTURE.md` (PTY Manager section), `docs/STACK.md`, `docs/TESTING.md`.

## Scope

- `packages/server/src/pty/manager.ts` — `PtyManager` class: spawns `node-pty`
  sessions keyed by `sessionId` (default shell or `claude`), holds a ~200KB
  scrollback ring buffer per session for reattach.
- `packages/server/src/pty/ws-route.ts` — `/ws/pty/:sessionId` handler: raw byte
  frames plus JSON resize/control messages; replays the scrollback buffer on
  (re)attach.
- `packages/server/src/http/routes/terminal-sessions.ts` — `POST /api/terminal/sessions`
  (create a session, choose shell vs. `claude`), `GET /api/terminal/sessions` (list
  active sessions, used to restore tabs after a browser refresh).
- `packages/web/src/components/TerminalPanel/TerminalPanel.tsx` — tabbed xterm.js UI
  (fit + webgl addons).
- `packages/web/src/components/TerminalPanel/useTerminal.ts` — WS client hook: binary
  frame I/O, resize wiring.
- `packages/web/src/components/TerminalPanel/useTerminalSessions.ts` — tab state,
  session list fetched from the API, reattach on mount.

## Out of scope

The sync loop and hook ingest (slice 4). The graph canvas (slice 5). Anything that
reads or parses terminal output for any purpose — forbidden outright by invariant 7
in `CLAUDE.md`, not just unscheduled.

## Interfaces consumed

`packages/shared`'s WS envelope base types (slice 0), used only for the JSON
resize/control-message framing — the terminal data channel itself is raw bytes, not
a shared schema payload.

## Interfaces exposed

- `/ws/pty/:sessionId` (raw bytes + resize control frames).
- `POST /api/terminal/sessions`, `GET /api/terminal/sessions`.
- `packages/web/src/components/TerminalPanel/TerminalPanel.tsx`, mounted as-is by
  slice 5/8's app shell.
- The "new Claude session in this project" action (a thin wrapper over
  `POST /api/terminal/sessions` with `shell: "claude"`), consumed by slice 8's
  onboarding flow.

## Definition of Done

1. `pnpm --filter server build` and `pnpm --filter web build` exit 0.
2. Playwright: open the terminal panel, type `echo hubtest`, assert `hubtest`
   appears in the xterm DOM buffer — a full round trip through `/ws/pty`.
3. Playwright: with an active session showing the output from step 2, reload the
   browser tab and assert the same scrollback (including `hubtest`) reappears
   without re-running the command.
4. Server/Playwright test: spawn a session running `claude --version`, assert the
   version string appears in the PTY output buffer within a timeout — proves the
   `claude` binary spawns correctly through `node-pty` (no API key or network
   needed for `--version`).
5. Server unit test: two concurrent PTY sessions in the same test process are
   independently addressable — bytes written to session A's WS connection never
   appear in session B's scrollback buffer.
6. `pnpm verify:slice-1` runs items 1–5 and exits 0.

## Verification

`verify:slice-1` = `playwright test e2e/slice-1 && vitest run packages/server/test/slice-1`

Asserts: echo round-trip, scrollback survival across reload, `claude --version`
spawns, and session isolation.

## Dependencies & parallelization

Needs slice 0. Runs in parallel with slice 2 and the slice-5 frontend shell
immediately after slice 0 lands. Not on the critical path (0→2→3→4→6→8) — the sync
loop does not depend on the terminal — but slice 8's full app shell mounts this
slice's `TerminalPanel` as-is.
