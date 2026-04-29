---
id: ADR-008
title: area becomes a label (deprecated as separate field)
type: decision
status: ✅ accepted
created-date: 2026-04-29
---

# ADR-008 — `area` becomes a label

## Context

Legacy schema usa `area:` (single value: `correctness | performance | architecture | ...`).
Linear-style usa labels (multi-value, free-form ou whitelist).

Pergunta: manter `area` separado? Mesclar com labels? Substituir labels por área multi-valor?

## Decision

`area` deixa de ser campo separado. Vira **label normal**, mesclando com labels existentes.

## Migration

Quando repo é cadastrado:

| Antes (frontmatter) | Depois (frontmatter) |
|---|---|
| `area: testing`<br>(no labels) | `labels: [testing]` |
| `area: correctness`<br>`labels: [bug]` | `labels: [bug, correctness]` |
| (no area, no labels) | `labels: []` |
| `area:` ausente, mas tem labels | unchanged |

Migration auto-commit: `chore(roadmap): migrate area to labels`.

Após migration, schema validation **não exige** `area`. Frontmatter sem `area:` é válido.
`area:` ainda em frontmatter (legacy not-yet-migrated) é tolerado (read-only) but
re-write moves it into labels.

## Rationale

- **Labels are more flexible** — multi-value (bug + correctness + ui) vs single area
- **Linear convention** — labels é o padrão moderno
- **Less schema rigidity** — adicionar uma nova "area" exige mudar enum; labels são free-form (subject to whitelist)
- **Better filtering** — UI pode filtrar por múltiplas labels combinadas
- **Color per label** — UI rendering fica mais visual

## Label whitelist (per repo)

`repos.config.labels.whitelist` define labels válidas. Default:

```jsonc
{
  "whitelist": [
    "architecture", "performance", "correctness",
    "feature", "ui", "testing", "refactoring",
    "design", "documentation", "bug", "tech-debt"
  ]
}
```

`allowFreeForm: true` permite qualquer label (default false).

UI valida adições — mostra autocomplete da whitelist.

## Consequences

- `items.area` column no SQLite **removed** (migration data → `labels`)
- `items.labels` é JSON array, indexable via SQLite JSON1 extension pra queries
- Validate schemas no validate command: remove `area` requirement, add `labels` validation
- Templates per-type ajustam `defaults.labels` (bug → `[bug, correctness]`, refactoring → `[refactoring]`, etc.)

## Trade-offs

**Lost**: simpler validation (`area in [enum]` vs. labels which can be free-form)
**Lost**: easy "what % of items are correctness?" queries (now requires JSON1 query)
**Gained**: multi-label flexibility, color-coding, Linear conventions

Trade is worth it. Most analysis queries we'd want still work via JSON1.

## Alternatives considered

### Keep `area` AND add labels

Pros: backward compat 100%
Cons: redundant fields, two ways to categorize same thing → drift

### Replace with hierarchical labels (`area:testing`, `tech:rust`)

Linear-style ":"-prefix namespacing. Considered but adds complexity for marginal benefit.
Manager v1 uses flat labels; can revisit if drift appears.

### Drop `area` entirely without migration

Lose information from legacy items. Migration preserves it as label.
