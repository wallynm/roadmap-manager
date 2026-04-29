---
id: PHASE-02
title: Read views — Kanban, filters, dep graph, command palette
type: spec
description: Add interactive read views (kanban with drag preview, list, dep graph), filters, search, command palette. Still no mutations.
status: ✅ shipped
created-date: 2026-04-29
completed-date: 2026-04-29
depends-on: [PHASE-01]
---

# Phase 02 — Read views

## Goal

Transformar a tabela básica do Phase 01 num conjunto de views úteis (kanban, list, graph)
com filtros, search, e command palette. **Read-only** — drag-drop é só visual feedback,
não persiste mutations ainda.

## Tasks

### 1. Kanban view

- [ ] `src/components/kanban/KanbanBoard.tsx` — 4 colunas (Backlog, Todo, In Progress, Done)
- [ ] `KanbanColumn.tsx` — header com count + sort menu
- [ ] `ItemCard.tsx` — layout do card descrito em [UI_DESIGN.md](../architecture/UI_DESIGN.md)
  (id top-left, title, priority emoji, labels, blocking indicator, age)
- [ ] Sort within column: impact desc → priority → created_date asc
- [ ] DnD-kit setup: drag preview shows ghost card; drop target shows insertion line
- [ ] Drop handler: just `console.log` for now (mutations in Phase 03)
- [ ] Empty column placeholder
- [ ] Keyboard nav: j/k to move selection, Enter to open

### 2. List view

- [ ] `ItemList.tsx` — densa table view, Linear-style
- [ ] Sortable columns (click header to sort)
- [ ] Resizable columns (persist widths in app_state)
- [ ] Bulk select via checkboxes (UI only, no actions yet)
- [ ] Row click → open item modal (Phase 02 read-only modal)

### 3. Dep graph view

- [ ] `cargo add petgraph` (if doing graph algorithms in Rust) OR compute in frontend
- [ ] In Rust: `compute_dep_graph(repo_id) -> { nodes, edges, impacts }` using `petgraph`
- [ ] `src/components/graph/DepGraph.tsx` using reactflow
- [ ] Nodes colored by status, sized by impact (transitive unblocks)
- [ ] dagre layout (hierarchical, top-to-bottom)
- [ ] Click node → highlight upstream + downstream (visual)
- [ ] Double-click node → open item modal
- [ ] Toggle "show done items" in toolbar
- [ ] Zoom controls

### 4. Item details modal (read-only)

- [ ] `src/components/modals/ItemDetailsModal.tsx`
- [ ] Shows: title, status badge, priority, labels, dates, body (rendered markdown)
- [ ] Dependencies section (list with status badges)
- [ ] Comments section (read-only display, "Add comment" disabled in this phase)
- [ ] Right pane: raw frontmatter view, "Open in editor" button (Tauri shell::open)

### 5. Filters

- [ ] Top bar tabs: All / Active / Backlog / Done
- [ ] Filter panel (collapsible): status, priority, labels, type
- [ ] Filters persist in URL (?status=todo&priority=alta) for shareable views
- [ ] Combine with search query

### 6. Search

- [ ] Search bar in top bar (or just `⌘F`)
- [ ] Searches: title, body, external_id, labels
- [ ] Backend: `list_items` accepts `search` filter; uses SQLite FTS5 (full text search)
- [ ] Migration `002_fts.sql`: create FTS5 virtual table on `items` (title, body)
- [ ] Triggers to keep FTS in sync with `items` table
- [ ] UI: highlight matched terms in results

### 7. Command palette

- [ ] `src/components/command/CommandPalette.tsx` using `cmdk`
- [ ] Opens on `⌘K`
- [ ] Sections:
  - **Suggestions**: "Create new" (placeholder, disabled), "Switch repo" (functional)
  - **Items**: search across all repos by title/id
  - **Commands**: "Toggle view", "Rescan repo", "Open settings"
  - **Recent**: recently viewed items
- [ ] Enter selects → action
- [ ] Each item shows breadcrumb: `repo › type › id title`

### 8. Saved views

- [ ] DB table `views` already in schema (Phase 01)
- [ ] Settings → Views section to manage
- [ ] Sidebar shows saved views with shortcuts (⌘1-9)
- [ ] "Save current view" button when filters applied: saves `{ filters, sort, layout }` as `views` row

### 9. Inbox panel

- [ ] Sidebar "Inbox" entry with badge
- [ ] Inbox modal: list of notifications (only shows what we can populate now —
  empty in this phase since no mutations/watcher yet, but layout is ready)
- [ ] "Mark all read" action

## Files to create / modify

### New

```
src/components/
├── kanban/
│   ├── KanbanBoard.tsx
│   ├── KanbanColumn.tsx
│   └── ItemCard.tsx
├── list/
│   └── ItemRow.tsx  (extracted from Phase 01 ItemList)
├── graph/
│   ├── DepGraph.tsx
│   └── ItemNode.tsx
├── modals/
│   └── ItemDetailsModal.tsx
├── command/
│   └── CommandPalette.tsx
├── filters/
│   ├── FilterPanel.tsx
│   └── FilterChip.tsx
└── inbox/
    └── InboxPanel.tsx

src/hooks/
├── useDepGraph.ts
├── useFilteredItems.ts
├── useCommandPalette.ts
└── useKeyboardShortcuts.ts

src/lib/
├── markdown.ts        # render md to HTML (use react-markdown)
└── search.ts          # FTS query builder
```

### Modified

```
src-tauri/src/db/items.rs  # add filter clause support, FTS query
src-tauri/migrations/      # add 002_fts.sql
src-tauri/src/ipc/         # add compute_dep_graph command
```

## Acceptance criteria

- [ ] Kanban com cards arrastáveis (animação visual, drop é no-op)
- [ ] Click em card abre details modal com body renderizado
- [ ] List view sortable por todas as colunas
- [ ] Dep graph mostra árvore real com nodes coloridos por status, sized by impact
- [ ] `⌘K` abre command palette, busca por items funciona
- [ ] Top bar tabs filtram corretamente
- [ ] Filter panel combina filtros (AND) e mostra count
- [ ] Saved view via "Save view" → aparece na sidebar com shortcut

## Notes

- Phase 02 é read-only — qualquer "salvar" estado fica em DB local (saved views, last selection),
  mas não muda items.
- Performance check: lista de 254 items deve render <100ms; dep graph render <500ms.
- Acessibility: navegação por teclado funcionando em todos os views (Tab, Arrow, Enter, Esc).
