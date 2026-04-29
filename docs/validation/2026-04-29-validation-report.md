---
title: Validation Report — 2026-04-29
type: doc
status: frozen
created-date: 2026-04-29
---

# Validation Report — 2026-04-29

Audit independente da implementação Cursor da phase 01-08. Snapshot point-in-time:
**não editar este documento depois de gravado**. Findings → tasks em
[`phase-09-implementation-fixes.md`](../phases/phase-09-implementation-fixes.md).

## Methodology

1. Verificar build (Rust `cargo check` + TypeScript `tsc --noEmit`)
2. Comparar schema SQLite vs `DATA_MODEL.md`
3. Ler módulos críticos (parser, writer, vcs, watcher, sync, agent/pool, ipc)
4. Comparar comandos registrados vs spec
5. Spot-check de mutations (complete_item, cancel_item)
6. Verificar wiring de file watcher
7. Verificar wiring de sidecar de agente
8. Verificar UI entrypoints (NewItemModal, AgentRunModal)

## What works (passing)

| Aspecto | Status | Notas |
|---|---|---|
| Compile (Rust) | ✅ | `cargo check` clean em ~1m03s |
| Compile (TS) | ✅ | `tsc --noEmit` clean |
| Schema SQLite | ✅ | Bate com `DATA_MODEL.md` (variação cosmética: `trigger_type` em vez de `trigger`, palavra reservada em SQL) |
| Mutations Phase 03 | ⚠️ | Funcionais (write+update+commit) mas erros silenciados — ver Finding #6 |
| Parser frontmatter | ✅ | regex + sha256 + normalize_priority |
| State machine | ✅ | `can_transition_to` enforce |
| Sync/reconcile | ✅ | Hash compare correto em `sync::reconcile_external_edit` |
| VCS (git2) | ✅ | Stage path-específico (não `add -A`), branch policy |
| Frontend completeness | ✅ | Kanban, list, dep graph, command palette, inbox, comments — todos presentes |
| Sidecar code | ⚠️ | `agent.mjs` tem loop SDK funcional, mas usa `@anthropic-ai/sdk` raw em vez de `claude-agent-sdk` (Finding #9) |

## Critical findings (block the validation cruzada use case)

### Finding #1 — Watcher nunca attachado a repos
**Severity**: 🔴 Critical
**Phase impacted**: 04
**Location**: `src-tauri/src/ipc/repos.rs::add_repo`

`WatcherPool` é inicializado em `lib.rs:31` mas **nunca** se chama
`watcher_pool.add_repo()` quando o user adiciona um repo. Conseqüência: zero file
watching. Edita no Cursor → kanban nunca atualiza. **Phase 04 é no-op runtime**.

### Finding #2 — Sidecar do agente nunca é spawned
**Severity**: 🔴 Critical
**Phase impacted**: 05
**Location**: `src-tauri/src/ipc/agent.rs:25-51` + `src-tauri/src/agent/pool.rs:19-26`

`agent_invoke` insere linha em `agent_runs` com status `'running'` e retorna o
`run_id`. **Nunca spawna `node sidecar/agent.mjs`**, nunca pipe stdio, nunca emite
eventos. UI fica esperando para sempre. Status `'running'` permanece eternamente.
**Phase 05/06 é no-op completo**.

### Finding #3 — `agent_respond` Tauri command ausente
**Severity**: 🔴 Critical
**Phase impacted**: 05
**Location**: `src-tauri/src/lib.rs:36-63` (invoke_handler list)

Spec previa `agent_respond({ runId, message })` para o usuário responder a
`ask_user`. Não está registrada. UI não consegue responder perguntas do agente.

### Finding #4 — `NewItemModal` sem toggle "Use agent" + `AgentRunModal` ausente
**Severity**: 🔴 Critical
**Phase impacted**: 05
**Location**: `src/components/modals/NewItemModal.tsx` + ausência de `AgentRunModal.tsx`

Form simples sem opção de invocar agente. Mesmo se backend funcionasse, UI não tem
entrypoint nem componente de streaming view (per Phase 05 spec § 9).

## Important findings (quality, not blocking)

### Finding #5 — `writer::render` não escapa YAML
**Severity**: 🟡 Important
**Phase impacted**: 03
**Location**: `src-tauri/src/writer/mod.rs:50`

`format!("{}: {}", field, v)` sem quoting. Title contendo `:` (`Foo: bar`) ou
`[BUG] crash` produz YAML inválido. Round-trip parse → write → parse explode.

### Finding #6 — Erros de auto-commit silenciados
**Severity**: 🟡 Important
**Phase impacted**: 03
**Location**: `src-tauri/src/ipc/items.rs:241,292,...` (`let _ = vcs::auto_commit(...)`)

Se branch policy falha, repo dirty, hook fail, etc., o `Result` é dropado. UI mostra
success mesmo quando commit não aconteceu. Viola a invariante "ação UI = um commit".

### Finding #7 — Watcher emite só evento genérico
**Severity**: 🟡 Important
**Phase impacted**: 04
**Location**: `src-tauri/src/watcher/mod.rs:63`

Emite só `items:refresh` (genérico). Spec previa `item:created`, `item:updated`,
`item:deleted`, `item:external_edit` distintos para UI granular.

## Spec drift (cosmetic / acceptable)

- `agent_runs.trigger_type` em vez de `trigger` (palavra reservada — OK)
- `RepoConfig` definido em `scanner/mod.rs` em vez de módulo dedicado
- `WatcherPool::remove_repo` existe mas não é chamado em `repos::remove_repo` ipc

## Phases não implementadas (esperado, parte do roadmap)

### Finding #8 — Phase 07 (migrations) ausente
**Severity**: 🟢 Planned work
**Location**: `src-tauri/src/migrations/` não existe

Priority migration (3-tier → 5-tier) e area→labels migration (ADRs 007/008) não
implementadas. `MigrationPanel.tsx` ausente. Esperado — Phase 07 ainda planned.

### Finding #9 — Sidecar SDK choice
**Severity**: 🟢 Drift acceptable
**Location**: `sidecar/package.json`

Usa `@anthropic-ai/sdk` (raw) em vez de `@anthropic-ai/claude-agent-sdk`. Funciona,
mas perde features SDK (built-in tool execution, abort signals, etc). Aceitável se
loop manual atender; revisar quando spawn estiver wireado.

### Finding #10 — Phase 08 (polish) ausente
**Severity**: 🟢 Planned work
**Location**: `src/components/settings/` não existe

Settings panels (General/Cost/Migration/ApiKey/etc) ausentes. `pages/SettingsView.tsx`
existe como placeholder. Esperado — Phase 08 ainda planned.

## Phase implementation status — actual

| Phase | Spec | Realidade | Status |
|---|---|---|---|
| 01 Foundation | ✅ | ✅ completo | ✅ shipped |
| 02 Read views | ✅ | ✅ completo (kanban, list, graph, cmd palette) | ✅ shipped |
| 03 Mutations | ✅ | ⚠️ funcional, mas Findings #5, #6 | 🔄 partial |
| 04 Sync | ✅ | ❌ código existe mas não wired (Finding #1, #7) | 🔄 partial |
| 05 Agent create | ✅ | ❌ sidecar nunca spawned (#2, #3, #4) | ❌ stub-only |
| 06 Agent other | ✅ | ❌ depende de #2 — código sidecar pronto, inalcançável | ❌ stub-only |
| 07 Migrations | ✅ | ❌ ausente (#8) | 📋 planned |
| 08 Polish | ✅ | ❌ ausente (#10) | 📋 planned |

## Action plan

Ver [`phase-09-implementation-fixes.md`](../phases/phase-09-implementation-fixes.md)
para lista priorizada com fixes detalhados (file:line + código sugerido).

Ordem mínima para o caso de uso "validation cruzada" funcionar end-to-end:

1. Finding #1 (~30min) — ativa watcher
2. Finding #5 (~30min) — evita corrupção
3. Finding #6 (~15min) — torna erros visíveis
4. Finding #7 (~30min) — UI reage corretamente
5. Finding #2 (~3-4h) — habilita Phase 05/06 (maior trabalho)
6. Finding #3 (~30min) — fecha loop conversational
7. Finding #4 (~2h) — UI do agente

Total estimado: ~7-8 horas de trabalho focado.
