---
title: Roadmap — roadmap-manager
type: roadmap
status: in-progress
---

# Roadmap — roadmap-manager

Implementação dividida em 8 fases originais + Phase 09 de fixes + Phase 10 de pipeline parity.
Cada fase é shippable independentemente — você pode parar em qualquer fase e ainda ter um
produto funcional.

> **Última validação**: [2026-04-29](docs/validation/2026-04-29-validation-report.md).
> Phases 01-06 + 09 + 10 shipped. 07-08 ainda planned.

| Phase | Title | Status | Adds |
|---|---|---|---|
| 01 | [Foundation](docs/phases/phase-01-foundation.md) | ✅ shipped | Tauri shell, SQLite, repo CRUD, first scan |
| 02 | [Read views](docs/phases/phase-02-read-views.md) | ✅ shipped | Kanban, filters, dep graph, command palette |
| 03 | [Mutations sem agente](docs/phases/phase-03-mutations.md) | ✅ shipped | YAML escape (F5) + error propagation (F6) via Phase 09 |
| 04 | [File watcher + sync](docs/phases/phase-04-sync.md) | ✅ shipped | Watcher wired (F1) + granular events (F7) via Phase 09 |
| 05 | [Agent SDK — create](docs/phases/phase-05-agent-create.md) | ✅ shipped | Sidecar spawn (F2) + agent_respond (F3) + UI (F4) via Phase 09 |
| 06 | [Agent — complete/triage/digest](docs/phases/phase-06-agent-other.md) | ✅ shipped | Sidecar pipeline shared with Phase 05 via F2 |
| 07 | [Comments + labels + priority migration](docs/phases/phase-07-comments-labels-priority.md) | 📋 planned | UX additions + data migrations |
| 08 | [Polish](docs/phases/phase-08-polish.md) | 📋 planned | Notifications, settings panel, distribution |
| **09** | **[Implementation fixes](docs/phases/phase-09-implementation-fixes.md)** | ✅ shipped | **Wire watcher + spawn sidecar + agent UI + YAML escape + error propagation** |
| **10** | **[Pipeline parity](docs/phases/phase-10-pipeline-parity.md)** | ✅ shipped | **Per-template validation + auto-fix + archive + dep static analysis + impact ranking + reindex (substitui o pipeline `.sh/.mjs` do simulation-engine)** |

## Phase 09 — fix list (priorizado)

Decorre da [validation report 2026-04-29](docs/validation/2026-04-29-validation-report.md):

| ID | Severity | Fix | Estimated |
|---|---|---|---|
| F1 | 🔴 Critical | Wire watcher to repo lifecycle (Finding #1) | 30min |
| F2 | 🔴 Critical | Spawn sidecar de agente com stdio IPC (Finding #2) | 3-4h |
| F3 | 🔴 Critical | Add `agent_respond` Tauri command (Finding #3) | 30min |
| F4 | 🔴 Critical | NewItemModal toggle + AgentRunModal (Finding #4) | 2h |
| F5 | 🟡 Important | YAML escape no writer (Finding #5) | 30min |
| F6 | 🟡 Important | Propagar erros de auto-commit (Finding #6) | 15min |
| F7 | 🟡 Important | Granular watcher events (Finding #7) | 30min |
| F8 | 🟢 Decision | Sidecar SDK choice — `@anthropic-ai/sdk` vs `claude-agent-sdk` (Finding #9) | doc only |

Total estimado: ~7-8h de trabalho focado.

## Phase 10 — feature list (priorizado)

Cobertura das operações de hygiene/batch hoje feitas pelo pipeline `.sh + .mjs`
do simulation-engine. Detalhe completo em
[phase-10-pipeline-parity.md](docs/phases/phase-10-pipeline-parity.md).

| ID | Severity | Feature | Substitui | Status |
|---|---|---|---|---|
| P10-F1 | 🔴 Critical | Per-template frontmatter validation | `roadmap-archive.sh --validate` | ✅ shipped |
| P10-F2 | 🔴 Critical | Auto-fix per-template (defaults + git-derived dates) | `fix-frontmatter.mjs` | ✅ shipped |
| P10-F3 | 🔴 Critical | Archive shipped items + cross-ref rewrite | `roadmap-archive.sh` (default) | ✅ shipped |
| P10-F4 | 🟡 Important | Dep graph static analysis (orphan/cycle/self-ref) | `roadmap-deps-check.mjs` | ✅ shipped |
| P10-F5 | 🟡 Important | Impact ranking (BFS reverse graph) + temporal filters | `roadmap-next.mjs --impact/--since/--stale` | ✅ shipped |
| P10-F6 | 🟡 Important | Reindex `INDEX.md` por template subdirectory | `roadmap-reindex.mjs` | ✅ shipped |
| P10-F7 | 🟢 Nice | ROADMAP.md body parsing (checkbox count) | `roadmap-archive.sh --status` (checkboxes) | ✅ shipped |
| P10-F8 | 🟢 Nice | Sub-roadmap status (emoji heuristic, opt-in glob) | `roadmap-archive.sh --status` (scenarios) | ✅ shipped |

Phase 10 entregue em 2026-04-29 — ~1500 linhas Rust + 450 TS + 26 testes (todos passando).
Cross-check 100% match com spec; zero gaps.

**Decisão arquitetural**: validação é **per-repo-template** (cada
`RepoConfig.templates[type]` declara `required_fields` + `defaults`), não 6
schemas hardcoded. Adicionar template ao repo = ensinar o manager o que é
"válido" lá. Reforça princípio #4 ("Templates per repo").

## Princípios não-negociáveis (cross-phase)

Esses ficam pra sempre, não mudam entre fases:

1. **`.md` é source of truth** — SQLite é cache reconstrutível. Edição manual no IDE continua funcionando.
2. **Auto-commit em toda mutação** — manager nunca deixa o repo dirty silenciosamente.
3. **No cross-repo deps** — `depends-on` é sempre intra-repo. IDs únicos por repo, não global.
4. **Templates per repo** — cada repo declara seu próprio formato de frontmatter via JSON.
5. **Localhost only** — não há multi-user, não há deploy. Tudo na sua máquina.
6. **Agent SDK opcional** — manager funciona 100% sem internet (modo manual). Agent é açúcar.

## Resumo das decisões fechadas

Veja **[docs/adr/](docs/adr/)** pra cada decisão isolada com rationale.

| Decisão | Resumo |
|---|---|
| ADR-001 | SQLite local-only (não Postgres). Zero setup, suficiente pra 5 repos × ~1k items. |
| ADR-002 | `.md` é source of truth, SQLite é cache. Edições externas reconciliadas via watcher. |
| ADR-003 | Tauri 2 + React/Vite + Rust core + Node sidecar pro Agent SDK. |
| ADR-004 | Agent SDK em modo iterativo conversacional (Q&A) — nunca one-shot generation. |
| ADR-005 | No cross-repo deps. Cada repo é silo. |
| ADR-006 | Auto-commit em toda mutação UI, com referência ao item e contexto. |
| ADR-007 | Migrate priorities pra 5-tier pt-br (Urgente/Alta/Média/Baixa/Nenhuma). |
| ADR-008 | `area` deixa de ser campo separado — vira label normal. |

## State machine

6 estados, derivados de Linear:

```
     ┌──────────┐
     │ Backlog  │ 📋  (não na fila imediata)
     └────┬─────┘
          ↓
     ┌──────────┐
     │   Todo   │ ⬜  (na fila, ainda não começou)
     └────┬─────┘
          ↓
     ┌──────────┐
     │In Progress│ 🔄  (em andamento)
     └────┬─────┘
          ↓
     ┌──────────┐
     │   Done   │ ✅  (concluído)
     └──────────┘

  Transições laterais (a partir de qualquer estado não-final):
    → Canceled   ❌  (não vai mais ser feito)
    → Duplicate  🔗  (apontando pra outro item)
```

`Canceled` e `Duplicate` são estados terminais e novos no schema. Veja
[docs/architecture/STATE_MACHINE.md](docs/architecture/STATE_MACHINE.md) para detalhes.

## Stack final

- **Frontend**: React 18 + Vite + TypeScript + shadcn/ui (dark) + TanStack Query + reactflow + cmdk
- **Backend (Rust core)**: Tauri 2, sqlx (SQLite), notify (watcher), git2 (commits), tokio
- **Agent**: Node sidecar process (`@anthropic-ai/claude-agent-sdk`) com IPC stdio JSON
- **Build**: `pnpm tauri build` → `.dmg/.app` standalone

## Validação cruzada — caso de uso ground truth

Antes de qualquer fase, esse fluxo precisa fechar end-to-end:

> "Eu noto um bug no civ-web: tooltip aparece com menu aberto. Abro o roadmap-manager, clico
> `+ New`, escolho repo `civ-web`, type `bug`, digito o título. O agente é invocado, lê
> `MenuComponent.tsx` e `Tooltip.tsx`, faz uma pergunta `'reproduz com qualquer menu ou só com
> city panel?'`, eu respondo, ele gera o .md completo (frontmatter + body com Sintoma/Reprodução/
> Causa hipotética). Eu reviso, ajusto uma palavra, clico Save. Manager grava em
> `apps/civ-web/docs/bugs/bug-08-tooltip-with-menu-open.md`, faz `git commit -m
> 'chore(roadmap): BUG-08 created via agent'`, toca o som de conclusão, card aparece no kanban
> coluna Todo. File watcher detecta o próprio commit (hash match → ignora)."

Cada fase entrega uma fatia desse fluxo. Phase 5 é onde o ciclo completo fecha.
