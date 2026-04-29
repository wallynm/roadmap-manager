---
title: UI Design — Linear-inspired layout & components
type: doc
status: planning
---

# UI Design

Inspiração: Linear (dark theme, sidebar, command palette, terse copy). As referências visuais
do usuário são as duas screenshots do Linear (issues view + status dropdown + new issue modal).

## Stack

- **React 18** + **TypeScript** + **Vite**
- **shadcn/ui** (Tailwind + Radix primitives) — instalar componentes individualmente
- **TanStack Query** — fetching/caching/invalidation pra Tauri commands
- **reactflow** — dep graph
- **cmdk** — command palette (Linear-style ⌘K)
- **lucide-react** — ícones
- **sonner** — toasts
- **@tanstack/react-router** ou **react-router** — navegação interna
- **zod** — runtime validation de IPC payloads

Paleta dark-first. Sem light mode em v1.

## Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  ┌─────────┐  ┌─ Top bar ─────────────────────────────────────────┐ │
│  │ Sidebar │  │ Repo selector ▾   View tabs    [+ New]   [⌘K]    │ │
│  │         │  ├─────────────────────────────────────────────────────┤ │
│  │         │  │                                                     │ │
│  │         │  │             Main view                              │ │
│  │         │  │   (Kanban / List / Graph / Settings)                │ │
│  │         │  │                                                     │ │
│  │         │  │                                                     │ │
│  │         │  │                                                     │ │
│  └─────────┘  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Sidebar (left, ~240px)

```
┌─────────────────────┐
│ JO Journeystudios ▾ │
│                     │
│ 🔔 Inbox        [3]  │  ← unread notifications count
│ 👁  My items          │  ← all items I started but not completed
│                     │
│ ────────────────    │
│ Repos               │
│   civ-web      [54] │  ← count of pending items
│   sim-web       [12]│
│   forest-web     [3]│
│   village-sim   [9] │
│   fw-pixijs     [16]│
│                     │
│ ────────────────    │
│ Views               │
│   Active issues  ⌘1 │  ← saved view
│   Backlog        ⌘2 │
│   Stale          ⌘3 │
│                     │
│ ────────────────    │
│ + Add repo          │
│ ⚙  Settings         │
└─────────────────────┘
```

Repo selecionado fica destacado (background tint). Hover mostra menu (`⋮`) com:
- Rescan
- Open in Finder
- Open in editor (VS Code / Cursor / etc — configurável)
- Disconnect

### Top bar

```
┌──────────────────────────────────────────────────────────┐
│  📦 civ-web  ▾    [All] [Active] [Backlog] [Done]   + ⌘K │
│  └ 54 items                                                │
└──────────────────────────────────────────────────────────┘
```

- Repo dropdown: muda contexto, replica o que sidebar faz
- Tabs: filtros rápidos
  - **All**: tudo exceto canceled/duplicate
  - **Active**: in_progress + todo
  - **Backlog**: backlog + todo
  - **Done**: done (recent)
- `+ New` button: abre modal create-item (ver Modals)
- `⌘K`: command palette

### Main view — Kanban (default)

Linear-style colunas:

```
┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐
│ 📋 Backlog │  │ ⬜ Todo    │  │ 🔄 In Prog │  │ ✅ Done    │
│            │  │            │  │            │  │            │
│ ┌────────┐ │  │ ┌────────┐ │  │ ┌────────┐ │  │ ┌────────┐ │
│ │IMP-22  │ │  │ │BUG-08  │ │  │ │IMP-16  │ │  │ │IMP-04  │ │
│ │tile fog│ │  │ │tooltip │ │  │ │aiFogs  │ │  │ │e2e     │ │
│ │M • 🔒2 │ │  │ │U • bug │ │  │ │A • 5d  │ │  │ │M • 2d  │ │
│ └────────┘ │  │ └────────┘ │  │ └────────┘ │  │ └────────┘ │
│ ...        │  │ ...        │  │ ...        │  │ ...        │
└────────────┘  └────────────┘  └────────────┘  └────────────┘
```

Card layout:
```
┌──────────────────────────────────┐
│ IMP-16                            │ ← external_id top-left, monospace muted
│ aiFogs não persiste ao save/load  │ ← title, larger, white
│                                   │
│ 🔴 Alta  bug · correctness        │ ← priority emoji + labels
│ 🔒 blocked by IMP-21 (or)         │ ← if blocked, show count or first blocker
│ ⚡ unblocks 9                      │ ← if has impact, show
│                                   │
│ 5d                                │ ← age (started_date or created_date)
└──────────────────────────────────┘
```

**Drag-drop** entre colunas → invoca mutation correspondente:
- → Backlog: `update_item({ status: "backlog" })`
- → Todo: `update_item({ status: "todo" })`
- → In Progress: `start_item({ id })` (sets started_date)
- → Done: `complete_item({ id })` — mostra inline mini-modal pra `--note` opcional

`Cancel` e `Duplicate` não estão como colunas — acessíveis via menu do card (⋮) ou status dropdown.

**Sort within column**: padrão é impact desc → priority → created_date asc.
Right-click no header da coluna abre menu com opções de sort.

Cards collapsible: ⌘+click no header da coluna colapsa.

### Main view — List

Tabela densa, Linear-style:

```
┌──────────────────────────────────────────────────────────────────────┐
│ ☐ ID        Status         Title                  Priority  Labels    │
├──────────────────────────────────────────────────────────────────────┤
│ ☐ IMP-16   🔄 In Progress  aiFogs não persiste    🔴 Alta   bug,corr  │
│ ☐ BUG-08   ⬜ Todo          tooltip persiste...    🟡 Média  bug,ui    │
│ ☐ IMP-22   📋 Backlog       tile sprite fog       🟡 Média  correct.  │
│ ...                                                                    │
└──────────────────────────────────────────────────────────────────────┘
```

Bulk select via checkboxes → bulk actions toolbar aparece (Move to, Cancel all, Add label, Delete).

Sortable por qualquer coluna. Colunas resizable.

### Main view — Graph

Reactflow rendering do dep graph, scoped ao repo atual:

```
[IMP-16] ──blocks──→ [IMP-22] ──blocks──→ [IMP-30]
                            ↘
                             [IMP-31]
[BUG-08] (isolated)
```

- Nodes coloridos por status (gray=backlog, blue=todo, yellow=inprogress, green=done, red=canceled)
- Tamanho do nó proporcional a `impact` (transitive unblocks count)
- Click → highlight downstream + upstream
- Double-click → abre item modal
- Layout automático (dagre / hierarchical)
- Toggle "show done items" no toolbar

### Main view — Settings

Tabs:
1. **General** — theme (sempre dark), language, sound on/off, default model, agent concurrency
2. **Repos** — table de repos cadastrados com Edit/Disconnect actions
3. **API key** — set/test Anthropic key
4. **Cost** — usage report ($X this month, breakdown por repo)
5. **About** — version, log location, "Rescan all repos"

## Modals

### `+ New` — create item

Reproduz o formato Linear do screenshot do user:

```
┌─ TS › New issue ─────────────────────────────────  [draft]  ⤢  × ┐
│                                                                    │
│  Teste de uma nova issue                                           │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │ Aqui vai toda a descrição de uma nova issue...           │     │
│  │                                                            │     │
│  └──────────────────────────────────────────────────────────┘     │
│                                                                    │
│  ⚡ Quick suggestions   🔴 Bug                                      │
│                                                                    │
│  ⚪ Todo  ⋯ Priority  ◎ Labels  ⋯                                  │
│                                                                    │
│                                                                    │
│  [📎]                              ⊙ Create more  [Create issue]   │
└────────────────────────────────────────────────────────────────────┘
```

Comportamento:
- Title (obrigatório) + description (opcional, markdown)
- "Quick suggestions" chip aparece se o título matchar pattern (`bug`, `fix`, `add`, etc.)
  → sugere type + label
- Botões inferiores abrem dropdowns:
  - `Type`: improvement / bug / refactoring / feature
  - `Status`: default Todo (raramente muda)
  - `Priority`: 5 levels com keyboard shortcut (1-5)
  - `Labels`: multi-select chips
  - `⋯`: more (estimate, due date — futuro)
- `Create more`: toggle pra abrir novo modal após salvar
- `[Create issue]`: dispatch `create_item` → escreve .md + auto-commit
- **Toggle "Use agent"** (top right, near `⤢`): se ativo, em vez de `create_item`,
  dispatch `agent_invoke({ trigger: "create" })` → modal vira streaming chat (ver AGENT_INTEGRATION.md)

Save as draft: persiste em `app_state` como JSON, recuperável via "drafts" no command palette.

### Item details modal

Click no card abre modal full-screen com tudo do item:

```
┌─ civ-web › IMP-16 ───────────────────────────────────────  ⤢  × ┐
│                                                                    │
│  aiFogs não persiste ao save/load                                  │
│                                                                    │
│  🔄 In Progress  🔴 Alta  bug, correctness                         │
│  Started 2026-04-25  •  Created 2026-04-20                         │
│                                                                    │
│  ─────────────────────────────────────────────────                 │
│                                                                    │
│  ## Sintoma                                                        │
│  AI fogs (visibility) é resetado ao abrir um save game...          │
│                                                                    │
│  ## Reprodução                                                     │
│  1. Iniciar partida                                                │
│  2. ...                                                            │
│                                                                    │
│  ─────────────────────────────────────────────────                 │
│                                                                    │
│  Dependencies (1)                                                  │
│    🔒 IMP-21 — TerrainTileLayer não respeita fog of war (Backlog)  │
│                                                                    │
│  ─────────────────────────────────────────────────                 │
│                                                                    │
│  ## Comments  (2)                                                  │
│                                                                    │
│  💬 wally · 2026-04-25 14:32                                       │
│     Talvez seja relacionado ao IMP-21?                             │
│                                                                    │
│  🤖 agent · 2026-04-25 14:35  (auto)                               │
│     Encontrei referência em src/save/serialize.ts:142...           │
│                                                                    │
│  [ + Add comment ]                                                 │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
                                                            ┌──────┐
[ Cancel ] [ Mark Duplicate ] [ Plan (re-open) ] [ ✓ Complete ]
                                                            └──────┘
```

Right pane (toggleable) tem:
- Status / priority / labels selectors
- Add/remove dependencies
- View raw frontmatter
- Open file in editor button
- Show recent agent runs for this item

### Agent run modal (streaming)

Veja [AGENT_INTEGRATION.md § Streaming UI](AGENT_INTEGRATION.md#streaming-ui).

### Confirmation modals

Pra ações destrutivas/significantes:
- Cancel item: "Cancel IMP-16? Provide reason (optional)" → input
- Mark duplicate: "Duplicate of which item?" → autocomplete search
- Disconnect repo: "Remove civ-web from manager? Files won't be deleted." → confirm

## Command palette (⌘K)

cmdk-style, Linear copycat:

```
┌─ ⌘K ──────────────────────────────────────────────┐
│  🔍 Search items, run command...                    │
│                                                     │
│  Suggestions                                        │
│   ↪ Create new item              ⌘N                 │
│   ↪ Switch repo →                                   │
│   ↪ Toggle view: kanban/list/graph                  │
│                                                     │
│  Items (matched "ai")                               │
│   IMP-16  aiFogs não persiste                       │
│   IMP-31  AI Player flicker                         │
│                                                     │
│  Commands                                           │
│   Run agent triage on civ-web                       │
│   Generate weekly digest                            │
│   Rescan all repos                                  │
└─────────────────────────────────────────────────────┘
```

Tudo navegável via teclado. Esc fecha.

## Keyboard shortcuts

Linear-aligned onde faz sentido:

| Shortcut | Action |
|---|---|
| `⌘K` | Open command palette |
| `⌘N` | Create new item |
| `⌘\` | Toggle sidebar |
| `1`-`4` | Switch view tab (All / Active / Backlog / Done) |
| `[`/`]` | Prev/next repo in sidebar |
| `g` then `i` | Go to inbox |
| `g` then `m` | Go to my items |
| `j`/`k` | Move selection down/up in list/kanban |
| `Enter` | Open selected item |
| `Esc` | Close modal / clear selection |
| `s` | Open status menu (when item selected) |
| `p` | Open priority menu |
| `l` | Open labels menu |
| `c` | Add comment |
| `e` | Edit item |
| `d` | Duplicate menu |
| `Delete` / `⌘Backspace` | Cancel item (with confirm) |

Settings panel mostra shortcuts em "About" tab.

## Sounds

Native macOS system sounds. Assets em `/System/Library/Sounds/*.aiff`.

| Event | Sound | Stage |
|---|---|---|
| Item created (manual) | (silent) | — |
| Agent invoked | `Tink.aiff` | start |
| Agent finished succesfully | `Glass.aiff` | finish |
| Agent failed/cancelled | `Funk.aiff` | error |
| External edit detected | (silent) | — |
| Notification received (e.g., stale alert) | `Pop.aiff` | info |
| Auto-commit succeeded | (silent — would be too frequent) | — |

Settings → toggle "play sounds" off (default on).

## Visual notifications (Inbox)

Persistente em DB (`notifications` table). Sidebar inbox mostra unread count.

```
┌─ Inbox ─────────────────────────────────────────────────────┐
│  Mark all read     Filter: [All] [Unread] [Mentions]        │
│                                                              │
│  🤖  agent finished                          2m ago          │
│     IMP-16 proposal ready · Click to review                  │
│                                                              │
│  ⚠️  external edit                            5m ago          │
│     IMP-22 was edited outside the app                       │
│                                                              │
│  📊  weekly digest available                  1h ago          │
│     8 items shipped this week — Open digest                  │
│                                                              │
│  💀  stale items                              1d ago          │
│     3 items in progress >14d — Triage                        │
└──────────────────────────────────────────────────────────────┘
```

Cada notification clicável → leva pro item / view relevante.

## Loading & empty states

- Repo first scan: progress bar com "Scanning... X/Y items"
- No repos cadastrados: large "Add your first repo →" CTA
- Empty kanban column: subtle "Drop here or create" placeholder
- Search no results: "Nothing matches. Create new?"

## Component inventory (high-level)

```
src/
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── TopBar.tsx
│   │   └── AppShell.tsx
│   ├── kanban/
│   │   ├── KanbanBoard.tsx
│   │   ├── KanbanColumn.tsx
│   │   └── ItemCard.tsx
│   ├── list/
│   │   ├── ItemList.tsx
│   │   └── ItemRow.tsx
│   ├── graph/
│   │   ├── DepGraph.tsx
│   │   └── ItemNode.tsx
│   ├── modals/
│   │   ├── NewItemModal.tsx
│   │   ├── ItemDetailsModal.tsx
│   │   ├── AgentRunModal.tsx
│   │   └── ConfirmDialog.tsx
│   ├── command/
│   │   └── CommandPalette.tsx
│   ├── settings/
│   │   ├── SettingsView.tsx
│   │   ├── ReposPanel.tsx
│   │   ├── TemplateEditor.tsx
│   │   └── ApiKeyPanel.tsx
│   └── ui/                       ← shadcn primitives (button, dialog, input, etc)
├── lib/
│   ├── tauri.ts                  ← typed wrappers around invoke()
│   ├── queries.ts                ← TanStack Query hooks
│   ├── events.ts                 ← Tauri event listeners
│   ├── status.ts                 ← state machine helpers
│   └── format.ts                 ← date / status / priority formatters
├── hooks/
│   ├── useRepos.ts
│   ├── useItems.ts
│   ├── useCommandPalette.ts
│   └── useKeyboardShortcuts.ts
├── pages/                        ← if using react-router
└── App.tsx
```

## Color palette (Tailwind tokens)

Background: `slate-950 / 900`. Foreground: `slate-100 / 200`. Accent: `indigo-500 / 600`.

Status colors:
- Backlog (📋): `slate-500`
- Todo (⬜): `sky-400`
- In Progress (🔄): `amber-400`
- Done (✅): `emerald-500`
- Canceled (❌): `red-500`
- Duplicate (🔗): `violet-400`

Priority colors:
- Urgente: `red-600`
- Alta: `red-400`
- Média: `amber-400`
- Baixa: `sky-400`
- Nenhuma: `slate-400`

## Window state persistence

App state (window size/position, last selected repo, sidebar collapsed) saved to
`app_state` table on every change (debounced 500ms). Restored on next launch.
