---
id: ADR-003
title: Tauri 2 + React + Vite + Rust core stack
type: decision
status: ✅ accepted
created-date: 2026-04-29
---

# ADR-003 — Tauri 2 + React + Vite + Rust core stack

## Context

App tem que ser:
- Desktop (não web app — quer rodar local sem servidor)
- Acesso ao filesystem (escrever .md em N repos)
- Acesso ao git (commit)
- Spawn subprocess (Node sidecar pro Agent SDK)
- UI rica (dark theme, dnd kanban, dep graph)
- Distribuível como single binary (.app/.dmg)

## Decision

- **Shell**: Tauri 2 (Rust core + WebView frontend)
- **Frontend**: React 18 + Vite + TypeScript
- **UI**: shadcn/ui (Tailwind) + lucide-react + cmdk + reactflow
- **State**: TanStack Query (Tauri commands fetching) + Zustand (local UI state, if needed)
- **Backend**: Rust com sqlx (SQLite), notify (watcher), git2 (commits), tokio (async)
- **Agent runtime**: Node 20+ sidecar process via `tokio::process` + stdio JSON IPC

## Alternatives considered

### Electron — rejected

**Pros:**
- Mature ecosystem, lots of examples
- Easy to ship Node tooling

**Cons:**
- Binary size: 100-200MB (Tauri ~5-15MB)
- Memory: Chromium + Node bundled
- Slower startup
- "We're shipping a browser to run a kanban" mental model

### Electron + native module — rejected

Same cons + Rust nativo via N-API tem fricção.

### Pure Rust GUI (egui / iced) — rejected

**Pros:**
- Single language, no JS
- Tiny binaries

**Cons:**
- Linear-style UI requires lots of polish (animations, keyboard nav, modals)
- shadcn/ui is years ahead of Rust GUI ecosystem in component library breadth
- Reactflow / dnd-kit have no Rust equivalent at parity

### Tauri 2 (accepted)

**Pros:**
- Rust core handles fs/git/db (where Rust shines)
- WebView frontend reuses entire React/Tailwind ecosystem
- Binaries small (~15MB), startup fast
- Tauri 2 has stable IPC, plugins for fs/dialog/notification

**Cons:**
- Two languages (Rust + TS) — but each owns its layer cleanly
- WebKit on macOS (slightly different from Chrome) — minor compat concerns
- Sidecar binaries tooling immature (we use tokio::spawn instead — see AGENT_INTEGRATION.md)

## Specific package choices

- **shadcn/ui**: copy-paste components (no npm dep), full Tailwind control
- **TanStack Query**: cache + invalidation map nicely to Tauri commands as queries
- **reactflow**: dep graph rendering with zoom/pan
- **cmdk**: Linear-style command palette
- **lucide-react**: consistent icon set
- **sonner**: toasts
- **zod**: runtime validation of IPC payloads (defense in depth)
- **sqlx**: async SQLite with compile-time checked queries
- **notify-debouncer-full**: file watcher with builtin debounce
- **git2**: libgit2 bindings, no shell-out to `git`
- **tokio**: async runtime
- **serde / serde_json**: IPC serialization

## Consequences

- Project structure:
  ```
  roadmap-manager/
  ├── package.json                  # frontend deps + tauri scripts
  ├── vite.config.ts
  ├── tauri.conf.json               # Tauri config (window, permissions, build)
  ├── src/                          # React frontend
  │   ├── App.tsx
  │   ├── components/
  │   ├── lib/
  │   └── hooks/
  ├── src-tauri/                    # Rust backend
  │   ├── Cargo.toml
  │   ├── src/
  │   │   ├── main.rs               # Tauri entry, command registration
  │   │   ├── db/                   # sqlx queries
  │   │   ├── parser/               # frontmatter parsing
  │   │   ├── writer/               # idempotent .md writing
  │   │   ├── watcher/              # notify-based fs events
  │   │   ├── vcs/                  # git2 operations
  │   │   ├── agent/                # sidecar pool & IPC
  │   │   └── ipc/                  # Tauri command handlers
  │   ├── migrations/               # SQL migrations
  │   └── icons/
  ├── sidecar/                      # Node sidecar runtime
  │   ├── package.json              # @anthropic-ai/claude-agent-sdk
  │   └── agent.mjs
  └── docs/                         # this directory
  ```

- Build target: macOS .dmg (universal binary, x86_64 + arm64). Linux/Windows future.
- Distribution: `pnpm tauri build` produces .dmg in `src-tauri/target/release/bundle/dmg/`.
- No code signing in v1 (single user). Future: Apple Developer cert + notarization for distribution.
