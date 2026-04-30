# Roadmap Manager

Desktop app for managing multi-repo roadmaps via `.md` frontmatter files. Built with **Tauri 2 + React + Rust** with a Node sidecar for Claude agent integration.

## Features

- **Kanban board** — drag items between statuses (Backlog → Todo → In Progress → Done)
- **File watcher** — edits in your IDE sync to the board in real-time
- **Auto-commit** — every mutation creates a git commit with structured message
- **Agent-assisted creation** — Claude reads your codebase and proposes work items
- **Monorepo support** — scans sub-packages (apps/, crates/, packages/) recursively
- **Dependency graph** — visualize blockers with dagre layout

## Download

| Platform | Format |
|----------|--------|
| macOS (Apple Silicon) | `.dmg` |
| macOS (Intel) | `.dmg` |
| Windows (x64) | `.msi` / `.exe` |
| Linux (x64) | `.deb` / `.AppImage` |

→ **[Latest release](https://github.com/wallynm/roadmap-manager/releases/latest)**

## Development

### Prerequisites

- **Rust** (1.75+) — `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Node.js** (20+) — `brew install node`
- **pnpm** — `npm i -g pnpm`

### Setup

```bash
pnpm install
cd sidecar && pnpm install && cd ..
```

### Run (dev)

```bash
pnpm tauri dev
```

### Build (release)

```bash
pnpm tauri build
```

The compiled `.app` / `.dmg` will be in `src-tauri/target/release/bundle/`.

## Architecture

```
src/               → React frontend (Vite + TanStack Query + shadcn/ui)
src-tauri/src/     → Rust core (Tauri 2, sqlx, git2, notify)
sidecar/           → Node.js agent (Claude SDK, stdio IPC)
docs/              → Specs, ADRs, phase docs
```

See [ROADMAP.md](ROADMAP.md) for implementation status and [docs/architecture/](docs/architecture/) for design docs.

## How it works

1. You add a git repo that contains `.md` work items (e.g., `docs/improvements/imp-01-*.md`)
2. The scanner imports items by parsing frontmatter (id, title, status, priority, labels)
3. The kanban shows items grouped by status; drag to transition
4. Every status change writes the `.md` file and auto-commits
5. External edits (IDE, git pull) are detected by the file watcher and synced back
6. The agent can generate new items by reading your codebase and asking questions

## License

Proprietary — Journey Studios.
