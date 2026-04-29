---
title: Architecture
type: doc
status: planning
---

# Architecture

## Layered model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Tauri shell (single window)                     │
│                                                                          │
│  ┌── React UI (frontend, runs in WebView) ──────────────────────────┐  │
│  │                                                                    │  │
│  │   Sidebar       Main views          Modals                        │  │
│  │   ┌──────┐     ┌─────────────┐    ┌──────────────────┐           │  │
│  │   │ Repos │    │  Kanban     │    │  New item        │           │  │
│  │   │  ▸    │    │  Dep graph  │    │  (agent-driven)  │           │  │
│  │   │ Filters│   │  List       │    │  Item details    │           │  │
│  │   │ Cmd-K │    │  Settings   │    │  Settings        │           │  │
│  │   └──────┘     └─────────────┘    └──────────────────┘           │  │
│  │                                                                    │  │
│  └────────────────────┬───────────────────────────────────────────────┘  │
│                       │ Tauri IPC (typed commands)                       │
│  ┌────────────────────▼───────────────────────────────────────────────┐  │
│  │              Rust core (backend, runs on main thread)                │  │
│  │                                                                    │  │
│  │  Module      Owns                          Depends on              │  │
│  │  ──────      ────                          ──────────              │  │
│  │  db          SQLite cache + migrations     sqlx                    │  │
│  │  scanner     First import, file → row      walkdir                 │  │
│  │  parser      .md ↔ frontmatter ↔ row       gray-matter equivalent  │  │
│  │  writer      row → .md (idempotent)        parser                  │  │
│  │  watcher     fs events, debounce, hash     notify, parser          │  │
│  │  vcs         git commit, status, log       git2                    │  │
│  │  agent_pool  spawn/manage Node sidecars    tokio::process          │  │
│  │  ipc         exposes Tauri commands        all of above            │  │
│  └────────────────────┬───────────────────────────────────────────────┘  │
│                       │ stdio JSON IPC                                    │
│  ┌────────────────────▼───────────────────────────────────────────────┐  │
│  │              Node sidecar (Agent SDK runtime)                        │  │
│  │              `@anthropic-ai/claude-agent-sdk`                        │  │
│  │              Tools: read_repo_files, list_items, run_git_log         │  │
│  │              One process per concurrent agent run                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                  ↓                    ↓                    ↓
            ~/repos/civ-web      ~/repos/sim-web      ~/repos/forest-web
            (each: own .git, own docs/, own roadmap-manager.repo.json)
```

## Process model

- **1 process** = Tauri main (Rust). Carrega React em WebView embutido.
- **N processes** = Node sidecars, um por agent run ativo. Spawned on-demand, killed on completion.
  Sidecars não persistem entre runs — agent state vive no DB (`agent_runs` table).
- **0 daemons** = quando você fecha o app, tudo morre. Sem processo de fundo.

## Data flow — ler items

```
1. UI carrega → query useRepos() → Tauri IPC: list_repos()
2. Rust: SELECT * FROM repos → JSON → UI
3. UI carrega items do repo selecionado → useItems(repoId)
4. Rust: SELECT * FROM items WHERE repo_id = ? → JSON → UI
5. UI renderiza kanban
```

SQLite é o que serve a UI. Nunca lemos .md em runtime de UI (só durante scanner inicial e watcher events).

## Data flow — mutar item (sem agente)

```
1. User clica "Complete" no card IMP-16
2. UI: useMutation → Tauri IPC: complete_item(item_id, note?)
3. Rust:
   a. Reload item from DB (fresh)
   b. parser.update_frontmatter(file_path, { status, completed_date })
   c. parser.append_section(file_path, "## Resolução", note)
   d. Capture new file hash
   e. UPDATE items SET status, completed_date, file_hash WHERE id = ?
   f. vcs.auto_commit(repo_path, file_path, "chore(roadmap): IMP-16 → ✅ resolvido", note)
   g. Return updated item to UI
4. File watcher will fire later → sees hash matches → no-op
5. UI invalidate query → refetch → refresh kanban
```

## Data flow — mutar item COM agente

```
1. User clica "+ New" → escolhe repo "civ-web" + type "bug" + título "tooltip aparece com menu aberto"
2. UI: agent.startCreate({ repo, type, title }) → Tauri IPC: agent_invoke
3. Rust agent_pool:
   a. INSERT INTO agent_runs (status='running', trigger='create', ...)
   b. spawn Node sidecar com args: --trigger=create --repo=civ-web --type=bug --title="..."
   c. Bridge stdio → emit Tauri events to UI for streaming
4. Sidecar:
   a. Init Agent SDK with system prompt for "create item"
   b. Loop:
      - Call tool list_existing_items({ repo, type }) → check ID conflicts
      - Call tool read_repo_files({ pattern: 'apps/civ-web/src/**/Tooltip*.tsx' }) → ground in code
      - Maybe ask user a clarifying Q (emits IPC event "agent_question")
      - User responds via UI → IPC event back to sidecar (resume conversation)
      - When confident, call tool propose_item({ frontmatter, body }) → returns to Rust
   c. Exit
5. Rust:
   a. UPDATE agent_runs SET status='succeeded', output, duration_ms, cost_usd
   b. Show preview modal in UI with proposed .md
6. User clica "Save" no modal:
   - Same path as "create item without agent" (parser.write + vcs.auto_commit)
7. Sound: agent_finished → save → file_committed (ou apenas o final)
```

## Frontend ↔ backend contract

Tauri commands são tipados (Rust enum + TS types gerados). Lista canônica:

| Command | Args | Returns | Side effects |
|---|---|---|---|
| `list_repos` | — | `Repo[]` | none |
| `add_repo` | `{ path }` | `Repo` | scan + import |
| `remove_repo` | `{ id, deleteData }` | `()` | DB delete (files preservados) |
| `list_items` | `{ repoId, filters? }` | `Item[]` | none |
| `get_item` | `{ id }` | `Item & { comments[] }` | none |
| `create_item` | `{ repoId, type, frontmatter, body }` | `Item` | write .md + commit |
| `update_item` | `{ id, patch }` | `Item` | write .md + commit |
| `complete_item` | `{ id, note? }` | `Item` | write .md + commit |
| `start_item` | `{ id }` | `Item` | write .md + commit |
| `cancel_item` | `{ id, reason? }` | `Item` | write .md + commit |
| `mark_duplicate` | `{ id, originalId }` | `Item` | write .md + commit |
| `plan_item` | `{ id }` | `Item` (re-open) | write .md + commit |
| `add_dependency` | `{ id, blockerId }` | `Item` | write .md + commit |
| `remove_dependency` | `{ id, blockerId }` | `Item` | write .md + commit |
| `add_comment` | `{ itemId, body }` | `Comment` | append `## Comments` + commit |
| `agent_invoke` | `{ trigger, ... }` | `{ runId }` | spawn sidecar |
| `agent_respond` | `{ runId, message }` | `()` | forward to sidecar |
| `agent_cancel` | `{ runId }` | `()` | kill sidecar |
| `agent_get_run` | `{ runId }` | `AgentRun` | none |
| `rescan_repo` | `{ repoId }` | `{ added, updated, removed }` | re-import |
| `validate_repo` | `{ repoId }` | `{ orphans, cycles, schemaErrors }` | none |

Eventos Tauri (server → client push):

| Event | Payload | When |
|---|---|---|
| `item:created` | `Item` | manager wrote a new .md |
| `item:updated` | `Item` | any field changed |
| `item:deleted` | `{ id }` | item file removed |
| `item:external_edit` | `Item` | watcher saw a non-manager change |
| `agent:delta` | `{ runId, text }` | streaming partial output |
| `agent:question` | `{ runId, question }` | sidecar wants user input |
| `agent:finished` | `{ runId, result }` | success or failure |
| `repo:scanning` | `{ repoId, progress }` | first scan progress |
| `notification:play_sound` | `{ kind }` | UI plays native sound |

## State machine — items

Estados (canônicos, não confundir com strings de frontmatter):

```rust
enum ItemStatus {
    Backlog,    // 📋
    Todo,       // ⬜
    InProgress, // 🔄
    Done,       // ✅
    Canceled,   // ❌
    Duplicate,  // 🔗
}
```

Mapping para frontmatter (pt-br, multi-emoji aceito por compat):

| Status | Frontmatter strings aceitas | String escrita pelo manager |
|---|---|---|
| Backlog | `📋 planned`, `📋 backlog` | `📋 backlog` |
| Todo | `⬜ pendente`, `⬜ todo` | `⬜ pendente` |
| InProgress | `🔄 em andamento`, `🔄 em progresso` | `🔄 em andamento` |
| Done | `✅ resolvido`, `✅ shipped`, `✅ done` | `✅ resolvido` |
| Canceled | `❌ cancelado` | `❌ cancelado` |
| Duplicate | `🔗 duplicado` (deve ter `duplicate-of: <id>` no frontmatter) | `🔗 duplicado` |

Transições válidas:

```
                              ┌─→ Canceled (❌) [terminal]
                              │
Backlog ─→ Todo ─→ InProgress ┤
   │         │         │       └─→ Duplicate (🔗) [terminal]
   │         │         │
   │         │         └────────→ Done (✅) [terminal, exceto via Plan]
   │         │
   │         └──→ Backlog (re-prioritização)
   │
   └──→ Todo (entrou na fila)

Plan: Done → Todo (re-abrir um item shipped — ADR-007)
```

UI deve renderizar transições inválidas como disabled. Backend valida e rejeita com erro claro.

## Princípios de design

1. **`.md` é a fonte de verdade** — DB nunca contradiz arquivo. ADR-002.
2. **Atomicidade por mutação** — uma ação UI = um commit git = um state change DB. Nunca multi-commit silencioso.
3. **Idempotência** — escrever frontmatter duas vezes deve produzir o mesmo arquivo. Hash determinístico.
4. **Conversation > generation** — agente é iterativo, faz perguntas. Não gera .md em one-shot. ADR-004.
5. **Sandboxed agent** — sidecar não tem acesso fora dos repos cadastrados nem fora de `read_*` e tools explícitas. Nunca `bash` aberto.
6. **No cross-repo state** — items de civ-web não sabem da existência de items em forest-web. Cada repo é silo. ADR-005.
7. **Reconcilable** — apague o SQLite e regenere via `rescan_repo` em todos os repos. Nada se perde.
