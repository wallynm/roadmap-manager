---
id: ADR-007
title: Migrate priority to 5-tier in pt-br
type: decision
status: ✅ accepted
created-date: 2026-04-29
---

# ADR-007 — Migrate priority to 5-tier in pt-br

## Context

Projeto legacy usa 3-tier priority em pt-br: `alta / média / baixa`.
Linear popularizou 5-tier: `Urgent / High / Medium / Low / No priority`.

Pergunta: manter 3-tier? Migrar pra 5-tier? Em que idioma?

## Decision

**Migrar todos os items pra 5-tier em pt-br**:
- `Urgente`
- `Alta`
- `Média`
- `Baixa`
- `Nenhuma`

Tudo capitalized (vs. legacy lowercase) — capitaliza durante migration.

## Migration logic

Quando o repo é cadastrado pela primeira vez (ou via Settings → "Migrate priorities" button):

| Antes (frontmatter) | Depois (frontmatter) |
|---|---|
| `priority: alta` | `priority: Alta` |
| `priority: média` | `priority: Média` |
| `priority: baixa` | `priority: Baixa` |
| `priority:` (missing) | `priority: Nenhuma` |
| `priority: Urgente` (já novo) | unchanged |

Migration roda em batch:
1. Iterate todos os items do repo
2. Para cada um, normalize priority field
3. Re-write .md (idempotente)
4. Single auto-commit: `chore(roadmap): migrate priority to 5-tier`

Items legacy podem manter pt-br lowercase por enquanto se manager nunca tocou no arquivo
(lazy migration on next mutation), mas migration explícita normaliza tudo de uma vez.

## Rationale

- **pt-br consistente**: codebase é pt-br, mantém vibe
- **5-tier cobre Urgente** que 3-tier não tem (3-tier "alta" empacota Urgente + High)
- **Capitalização**: visual mais limpo no UI ("Alta" > "alta")
- **Backward compat**: validate aceita ambas formas (lower e capitalized) until migrated
- **No new ambiguity**: 5 levels é o sweet spot do Linear, não precisa Urgentíssimo

## UI rendering

Cada nível tem cor + ícone:

| Priority | Color | Icon | Linear-equivalent |
|---|---|---|---|
| Urgente | red-600 | 🔥 | Urgent |
| Alta | red-400 | 🔴 | High |
| Média | amber-400 | 🟡 | Medium |
| Baixa | sky-400 | 🟢 | Low |
| Nenhuma | slate-400 | ⚪ | No priority |

Sort order (alta priority first): `Urgente → Alta → Média → Baixa → Nenhuma`.

## Triggers for setting Urgente

Manualmente: user picks via UI dropdown.
Automaticamente: agent triage pode sugerir promoção pra `Urgente` se detect:
- Bug afeta data integrity / security
- Bug bloqueia main user flow
- Mention de "urgent / asap / blocker" no input

Agent **propõe** (não força). User confirma.

## Consequences

- Run migration on every existing repo before production use (post Phase 7)
- Validate accepts both (`alta` lowercase ou `Alta` capitalized) durante transition; depois aceita só capitalized
- Frontmatter writes always use canonical form
- Sort order across UI is consistent
- Templates default usam `Média` ou `Alta` dependendo do type (bug=Alta, improvement=Média, etc.)

## Alternatives rejected

### Manter 3-tier

Mais simples, menos migration. Mas loses "Urgente" tier — user já sentiu falta.

### Migrate to 5-tier in English

Rejected explicitly by user — "Todos pt-br".

### Manager-side mapping (legacy 3-tier in .md, 5-tier in UI)

Considerado em design discussion; rejected porque o mapping confunde quem lê .md fora do manager,
e perde o Urgente tier de qualquer forma.
