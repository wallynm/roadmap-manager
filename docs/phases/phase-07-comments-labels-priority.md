---
id: PHASE-07
title: Phase 07 — Comments + labels + priority migration
type: phase
status: ✅ done
labels: []
created-date: 2026-04-29
depends-on: [PHASE-06]
---

# Phase 07 — Comments + labels + priority migration

## Goal

Polish: comments visíveis e funcionais com round-trip pro .md. Labels com gestão visual. Rodar as migrations (area→labels) nos repos existentes.

## Tasks

### 1. Comments round-trip ✅

* [x] Format: `## comment: Author - YYYY-MM-DD HH:MM` heading inline no body
* [x] Parser no frontend: `parseComments`, `splitAtComments`, `extractCommentsSection`, `stripCommentsSection`
* [x] On comment write: append `\n\n## comment: {author} - {date}\n\n{body}\n` diretamente no arquivo
* [x] Comments separados do conteúdo principal — não exibidos no BlockNote editor

### 2. Add comment UI ✅

* [x] Item view → "Add comment" button → textarea inline
* [x] Author resolvido do `git config user.name`
* [x] On submit: append ao body → write file → auto-commit (`chore(roadmap): commented`)
* [x] Edit comment: pencil icon → inline editor → save atualiza arquivo + commit
* [x] Delete comment: trash icon → remove do arquivo + commit

### 3. Agent comments ✅

* [x] Comments de agent armazenados com `is_agent=1`, exibidos com ícone Bot e `(auto)` suffix

### 4. Labels UI ✅

* [x] Item view → labels editor: add/remove com input livre
* [x] Labels exibidas como chips nas listas e kanban

### 5. Area → labels migration ✅

* [x] `migrate_area_to_labels` roda como pré-pass no `fix_issues`
* [x] Converte `area:` frontmatter → `labels:` sequence, merge com labels existentes

### 6. Cancellation reasons + duplicate context ✅

* [x] Cancel item → reason dialog → `## Cancelamento (DATE)\n\n{reason}` appended ao body
* [x] Mark duplicate → `duplicate_of:` no frontmatter + `## Duplicate of\n\n{id}` no body

## Out of scope (deferred)

- Labels coloridas por config do repo (color picker, `labels.colors`)
- Labels whitelist + Combobox (input livre cobre o caso de uso)
- Settings: labels panel (renomear/deletar labels em bulk)
- Priority migration UI button (roda via fix automaticamente)
- Agent `add_comment` tool integration (complete-trigger)
- Auto-detect migration banner

## Acceptance criteria ✅

* [x] Add comment via UI → file gets `## comment:` entry appended → committed
* [x] Edit existing comment → inline editor → file updated → committed
* [x] Delete comment → entry removed from file → committed
* [x] Comments não aparecem no BlockNote editor (filtrados no frontend)
* [x] Labels editor permite add/remove livre
* [x] Area→labels migration roda via fix_repo → `area:` removido, valores em `labels:`
* [x] Cancel com reason → `## Cancelamento` no body
* [x] Mark duplicate → `duplicate_of:` frontmatter + body section
