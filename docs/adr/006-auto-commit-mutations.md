---
id: ADR-006
title: Auto-commit on every mutation
type: decision
status: ✅ accepted
created-date: 2026-04-29
---

# ADR-006 — Auto-commit on every mutation

## Context

Toda mutação UI escreve um .md. Opções:
- (a) **Edit only**: deixar `git status` sujo, user commita manualmente quando quiser
- (b) **Auto-commit per mutation**: cada ação UI = um commit individual
- (c) **Branch + PR**: criar branch dedicada, abrir PR no fim

## Decision

**Option B** — auto-commit per mutation, with structured message including item context.

## Rationale

- Audit trail completo — `git log apps/<repo>/docs/improvements/imp-16.md` mostra
  history clean: created, started, blocked, completed, etc.
- Sem fricção — user não esquece de commitar
- Reverter é trivial — `git revert <sha>` desfaz uma mutação
- Granularidade fina — útil pra blame ("quando foi marcado como done?")

## Commit message format

```
chore(roadmap): {ID} → {STATUS_VERB}

Closed via roadmap-manager on {DATE}.
Note: {NOTE}
```

Exemplo:
```
chore(roadmap): IMP-16 → resolvido

Closed via roadmap-manager on 2026-04-29.
Note: fixed by adding aiFogs serialization in save/load handlers.
```

Subject sempre ≤70 chars. Body opcional mas inclui `--note` quando presente.

**Sem Co-Authored-By** (per global memory: nunca adicionar Co-Authored-By: Claude).

## Mutations that auto-commit

Toda action que escreve .md:
- `create_item`, `update_item`
- `start_item`, `complete_item`, `cancel_item`, `mark_duplicate`, `plan_item`
- `add_dependency`, `remove_dependency`
- `add_comment`

Ações DB-only (sem write .md):
- `agent_invoke` (cria run, não muda item)
- `agent_cancel`
- `mark_notification_read`

## Branch policy

Default: commit no branch atual (`HEAD`). Manager **não** muda de branch.

Per-repo override em `repos.config.autoCommit.branch`:
- `null` (default): commit em qualquer branch
- `"main"`: só permite commit em `main`. Tentativa em outra branch → erro com clear message.

`branchPolicy.allowedBranches` adiciona uma whitelist se quiser ser strict.

`warnIfDetached`: se HEAD detached, mostra warn no UI mas commit prossegue.

## Dirty repo handling

Default: `skip_if_dirty = false` (commit prossegue, staging só do .md alvo via `git add <path>`,
não `git add -A`).

Modo strict (`skip_if_dirty = true`): manager se recusa a commitar se houver outras
mudanças pendentes. UI mostra warning.

## Consequences

- Repo histórico fica mais "ruidoso" com many `chore(roadmap):` commits — accept this
  trade-off pelo benefício de granularidade
- `git log --oneline | grep "roadmap"` filtra os commits de roadmap facilmente
- Quem usa squash-merge no PR não é afetado (squash junta tudo)
- GPG signing respeitado se user tem `commit.gpgsign true`
- Hooks (`pre-commit`, `commit-msg`) rodam normalmente — manager não bypassa hooks

## Alternatives considered

### No auto-commit (rejected)

Pros: menos commits no log
Cons: user esquece, fica com `git status` sujo, perde audit trail

### Branch + PR per session (rejected)

Pros: mudanças isoladas, code review style
Cons: overkill pra single-user local; PR no GitHub requer push (manager não faz push)

### Squash by session (rejected)

Acumular mutações da sessão e criar 1 commit ao fechar app. Bom pra log limpo,
mas perde granularidade do "quando" e crash do app perde histórico.

## Override per-mutation

UI tem (em settings → general) toggle "Disable auto-commit globally" pra usar manager
em modo "edit only" (opcional). Default ligado.

Por-repo, mesma toggle em settings de cada repo.

Quando desligado, manager edita .md mas não commita — user vê em `git status` e commita
manualmente. Útil pra repos onde commit-em-massa via UI seria barulhento.
