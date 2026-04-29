---
id: ADR-005
title: No cross-repo dependencies
type: decision
status: ✅ accepted
created-date: 2026-04-29
---

# ADR-005 — No cross-repo dependencies

## Context

Items têm `depends-on: [ID, ID]` que apontam pra outros items. Pergunta:
um item em civ-web pode declarar dep em FW-04 (que vive em fw-pixijs)?

## Decision

**No**. `depends-on:` é sempre intra-repo. IDs são únicos por repo, não global.

## Rationale

- **Simplicidade do schema**: não precisa namespacing (`fw-pixijs/FW-04` vs. `FW-04`)
- **Independence dos repos**: cada repo é silo. Posso mover repos individualmente sem quebrar refs cross.
- **State machine local**: dep graph algorithms (impact, blocking) são por-repo. Cross-repo
  dependeria de carregar todos os repos sempre — viola o princípio de carga sob demanda.
- **Mental model**: cross-repo coordenação é via comments / docs externos (humano-readable),
  não via campos estruturados que mecanizam decisões.
- **Agent grounding**: agente só lê código do próprio repo via `read_repo_files`. Cross-repo
  significaria expor multiple paths e complicar sandbox.

## Consequences

- IDs como `IMP-01` podem repetir entre repos (cada repo tem seu IMP-01). UI sempre
  mostra `[repo] · IMP-01` pra desambiguar.
- `add_dependency` valida que blocker está no mesmo repo do item.
- Dep graph (reactflow view) é por-repo só.
- Impact analysis é por-repo só.
- Se um item em civ-web realmente depende de algo em fw-pixijs, isso vai pro body
  como link markdown (`see [FW-04](github.com/...)`) — não estruturado.

## Alternatives considered

### Allow cross-repo with namespaced IDs

`depends-on: [civ-web/IMP-01, fw-pixijs/FW-04]`. Possível mas:
- Schema mais complexo
- Validação cross-repo (cycle detection, orphan detection) precisa de todos os repos carregados
- Edge cases (repo desconectado, repo renomeado) viram pesadelos
- Pouco demand real (na prática, dependências cross são exceção rara)

### Allow but only as warnings (orphan-tolerant)

Manager aceita IDs unknown como "external" e só warn. Mas isso polui a noção de orphan
no validate, e remove o ganho de mecanização (a dep não controla nada de fato).

## Consequences if user really needs cross-repo

Workflow recomendado (manual, fora do schema):

1. Criar comment no item de civ-web: "Blocked by FW-04 in fw-pixijs"
2. Manualmente trackear no body
3. Quando FW-04 ship, manualmente revisar o item de civ-web

Manager **não** vai automatizar isso. Se virar dor real, criamos novo ADR superseding este.
