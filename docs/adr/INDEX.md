---
title: Architecture Decision Records
type: doc
status: active
---

# Architecture Decision Records (ADRs)

Cada decisão arquitetural com trade-off real é registrada como um ADR. Quando uma
decisão é revisitada, a nova ADR tem `Supersedes: ADR-NNN` e a antiga vira `superseded`.

## Índice

| ADR | Title | Status |
|---|---|---|
| [ADR-001](001-sqlite-not-postgres.md) | SQLite (not Postgres) for the local cache | ✅ accepted |
| [ADR-002](002-md-as-source-of-truth.md) | .md files are source of truth, SQLite is cache | ✅ accepted |
| [ADR-003](003-tauri-react-stack.md) | Tauri 2 + React + Vite + Rust core stack | ✅ accepted |
| [ADR-004](004-agent-sdk-iterative.md) | Agent SDK in iterative conversational mode | ✅ accepted |
| [ADR-005](005-no-cross-repo-deps.md) | No cross-repo dependencies | ✅ accepted |
| [ADR-006](006-auto-commit-mutations.md) | Auto-commit on every mutation | ✅ accepted |
| [ADR-007](007-priority-tier-pt-br-migration.md) | Migrate priority to 5-tier in pt-br | ✅ accepted |
| [ADR-008](008-area-becomes-label.md) | `area` becomes a label (deprecated as separate field) | ✅ accepted |
| [ADR-009](009-keep-raw-anthropic-sdk.md) | Keep raw `@anthropic-ai/sdk` for sidecar agent | ✅ accepted |

## Como criar um novo ADR

1. Próximo número disponível (ADR-009, ADR-010, ...)
2. Título imperativo curto (`<verb> <subject>`)
3. Frontmatter padrão (`id, title, type=decision, status, created-date`)
4. Estrutura:
   - **Context** — problema, opções, restrições
   - **Decision** — o que foi decidido (uma frase)
   - **Alternatives considered** — outras opções com pros/cons
   - **Consequences** — implicações práticas no código
5. Adicionar linha no índice acima

## Quando criar ADR vs nota inline

ADR para decisões com trade-off real, especialmente:
- Escolhas de stack / lib (sqlx vs prisma)
- Princípios arquiteturais (md vs db source)
- Decisões irreversíveis depois de shipped (cross-repo deps)

Não-ADRs (notas inline em phase docs ou code comments):
- Detalhes de implementação reversíveis
- Convenções de naming
- Pequenos ajustes de UX
