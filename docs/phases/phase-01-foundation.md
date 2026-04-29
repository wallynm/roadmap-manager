---
id: PHASE-01
title: Foundation — Tauri shell, SQLite, repo CRUD, first scan
type: spec
description: Bootstrap Tauri+React+Rust project, SQLite migrations, parser, repo registration, first scan import. Read-only items list at the end.
status: ✅ shipped
created-date: 2026-04-29
completed-date: 2026-04-29
depends-on: []
---

# Phase 01 — Foundation

## Goal

Ter um app que abre, cadastra um repo, escaneia .md files, popula SQLite, e mostra
uma lista (não interativa) de items na UI. **Sem mutations, sem watcher, sem agent.**

Outcome esperado: você adiciona `~/www/journeystudios/simulation-engine` e vê os 254 items
listados em uma tabela simples.

## Prerequisites

Nenhum — phase foundational.

## Tasks

### 1. Project scaffold

- [ ] `pnpm create tauri-app` com template `react-ts`. Coloca em `~/www/journeystudios/roadmap-manager/`.
- [ ] `cd src-tauri && cargo add sqlx --features 'sqlite-rustls runtime-tokio macros migrate'`
- [ ] `cargo add tokio --features 'full'`
- [ ] `cargo add serde serde_json uuid --features 'v4'`
- [ ] `cargo add anyhow thiserror tracing tracing-subscriber`
- [ ] `cargo add walkdir`
- [ ] `cd .. && pnpm install -D tailwindcss postcss autoprefixer && npx tailwindcss init -p`
- [ ] Configure Tailwind dark mode default
- [ ] `pnpm dlx shadcn-ui@latest init` (dark theme, slate base)
- [ ] Add components: `button dialog input table dropdown-menu toast badge skeleton card`
- [ ] `pnpm install @tanstack/react-query lucide-react sonner cmdk zod`
- [ ] Configure `tauri.conf.json`: window 1400×900, dark, single window, allowlist for `fs:read`/`fs:write` scoped to user's home

### 2. Database setup

- [ ] Create `src-tauri/migrations/001_initial.sql` with full schema from [DATA_MODEL.md](../architecture/DATA_MODEL.md)
- [ ] In `src-tauri/src/db/mod.rs`:
  - `pub async fn open_pool() -> Pool<Sqlite>` — opens DB at app data dir, runs migrations
  - DB path: macOS uses `~/Library/Application Support/com.journeystudios.roadmap-manager/db.sqlite` (use `dirs` crate)
- [ ] In `main.rs`, init DB pool on startup, store in Tauri state.

### 3. Frontmatter parser

- [ ] `cargo add serde_yaml regex sha2` (and `chrono` for dates)
- [ ] Create `src-tauri/src/parser/mod.rs`:
  - `pub fn parse(content: &str) -> Result<Parsed>` — splits frontmatter (between `---` markers) and body
  - Returns `Parsed { yaml: serde_yaml::Value, body: String, raw_frontmatter: String }`
  - Handles malformed YAML gracefully (returns Err with line number)
  - Handles missing frontmatter (returns Err)
- [ ] Hash function: `pub fn hash(content: &str) -> String` — sha256 hex of full file content
- [ ] Status normalizer: `pub fn normalize_status(s: &str) -> ItemStatus` — maps any alias to canonical (per [STATE_MACHINE.md](../architecture/STATE_MACHINE.md))
- [ ] Priority normalizer: `pub fn normalize_priority(s: &str) -> Option<Priority>` — handles legacy 3-tier and new 5-tier

### 4. Repo CRUD

- [ ] In `src-tauri/src/db/repos.rs`:
  - `pub async fn list(pool) -> Vec<Repo>`
  - `pub async fn add(pool, name, path, config) -> Repo`
  - `pub async fn remove(pool, id) -> ()`
  - `pub async fn get(pool, id) -> Option<Repo>`
- [ ] Tauri commands in `src-tauri/src/ipc/repos.rs`:
  - `list_repos`, `add_repo` (with path validation), `remove_repo`
- [ ] React hook `useRepos()` in `src/hooks/useRepos.ts` using TanStack Query:
  ```ts
  export function useRepos() {
    return useQuery({
      queryKey: ['repos'],
      queryFn: () => invoke<Repo[]>('list_repos'),
    })
  }
  ```

### 5. First scan / import

- [ ] In `src-tauri/src/scanner/mod.rs`:
  - `pub async fn scan_repo(pool, repo_id) -> ScanReport`
  - Uses `walkdir` to traverse template dirs configured for the repo
  - For each .md file matching template's `filePrefix-*.md`:
    - Read content
    - Parse frontmatter
    - Compute hash
    - Insert/update item row
  - Returns `ScanReport { added, updated, removed, errors }`
- [ ] Tauri command `add_repo` runs scan after creation, returns repo + initial scan report.
- [ ] UI shows progress modal during first scan (Tauri events `scan:progress`).

### 6. Items read

- [ ] In `src-tauri/src/db/items.rs`:
  - `pub async fn list_by_repo(pool, repo_id, filters?) -> Vec<Item>`
  - `pub async fn get(pool, id) -> Option<Item>`
- [ ] Tauri command `list_items({ repoId, filters? })` returns `Vec<Item>`.
- [ ] React hook `useItems(repoId, filters?)`.

### 7. Minimal UI

- [ ] Sidebar component (just for repo list — no inbox/views yet).
- [ ] Top bar with repo selector dropdown.
- [ ] Main view: simple table of items (no kanban yet) using `<Table>` from shadcn.
  Columns: ID, Title, Status, Priority, Labels, Created.
- [ ] "Add repo" dialog: file picker (Tauri `dialog::open` API), shows path, calls `add_repo`.
- [ ] Empty state when no repos.
- [ ] Error states for failed parse, etc.

### 8. App shell + routing

- [ ] React Router (or TanStack Router) setup with routes:
  - `/` (default → first repo or empty state)
  - `/repos/:repoId` (repo view)
  - `/settings` (placeholder)
- [ ] AppShell layout with sidebar + main + top bar slots.

## Files to create

### Rust

```
src-tauri/
├── Cargo.toml
├── tauri.conf.json
├── migrations/
│   └── 001_initial.sql
└── src/
    ├── main.rs
    ├── db/
    │   ├── mod.rs
    │   ├── repos.rs
    │   └── items.rs
    ├── parser/
    │   ├── mod.rs
    │   └── status.rs
    ├── scanner/
    │   └── mod.rs
    ├── ipc/
    │   ├── mod.rs
    │   ├── repos.rs
    │   └── items.rs
    └── error.rs
```

### Frontend

```
src/
├── App.tsx
├── main.tsx
├── lib/
│   ├── tauri.ts
│   ├── queries.ts
│   └── format.ts
├── hooks/
│   ├── useRepos.ts
│   └── useItems.ts
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx
│   │   ├── Sidebar.tsx
│   │   └── TopBar.tsx
│   ├── modals/
│   │   └── AddRepoDialog.tsx
│   ├── ItemList.tsx
│   └── ui/  (shadcn components)
└── types/
    └── index.ts  (Item, Repo, etc.)
```

## Acceptance criteria

- [ ] `pnpm tauri dev` opens window
- [ ] "Add repo" → file picker → select `~/www/journeystudios/simulation-engine` → scan completes
- [ ] Sidebar shows repo with item count
- [ ] Main table shows ~254 items with correct title/status/priority parsed
- [ ] Removing repo via sidebar context menu deletes from DB (files preserved)
- [ ] App restart preserves repos (DB persists)
- [ ] Schema migrations run cleanly on fresh DB

## Out of scope (deferred to next phases)

- Kanban view (Phase 02)
- Mutations (Phase 03)
- File watcher (Phase 04)
- Agent integration (Phase 05+)
- Comments, dep graph, command palette (later phases)

## Notes

- Use `tauri::async_runtime::block_on` sparingly — prefer fully async commands
- Type-safe Tauri commands: define `#[tauri::command]` returning typed structs serializable as JSON
- TS types ideally generated from Rust via [`ts-rs`](https://crates.io/crates/ts-rs) — set this up early to avoid manual type drift
- Logging via `tracing` (target: `roadmap_manager=debug`); console output in dev, file in prod
