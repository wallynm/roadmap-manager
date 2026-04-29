---
id: ADR-004
title: Agent SDK in iterative conversational mode
type: decision
status: ✅ accepted
created-date: 2026-04-29
---

# ADR-004 — Agent SDK in iterative conversational mode

## Context

When user creates a new item via "+ New", the agent fills out frontmatter + body.
Three modes considered:

- (a) **One-shot**: agent gets title → returns full .md → user reviews. No loop.
- (b) **Iterative conversational**: agent asks clarifying Q's via tool, user answers, repeats until confident.
- (c) **Staged**: agent suggests `type/priority/area`, user confirms, then expands body, etc.

## Decision

**Mode (b) — iterative conversational**.

## Rationale

- **One-shot tem qualidade pior**: sem perguntas de scope ("é bug ou improvement?",
  "reproduz com qualquer X ou só com Y?"), o agente chuta detalhes que o user precisa corrigir → mais retrabalho que se ele tivesse perguntado.
- **Iterativo aproveita o ground**: agente lê código (`read_repo_files`), descobre hipóteses,
  pergunta pra confirmar. O .md final é mais fundamentado.
- **Mode (c) staged é UX confusa**: 3 stages visuais com decisão a cada um quebra fluxo.
  Conversa contínua é mais natural.

## How it works

Agent SDK em loop. Flow:

```
User: title + maybe description
  ↓
Agent: think → call tool list_existing_items (avoid dups)
  ↓
Agent: think → call tool read_repo_files (ground in code)
  ↓
Agent: maybe call tool ask_user("é bug ou improvement?")
  ↓
User: responds (UI sends user_response over stdin)
  ↓
Agent: maybe more tool calls
  ↓
Agent: maybe one more clarifying Q (cap at 2 total)
  ↓
Agent: call tool propose_item({ frontmatter, body })
  ↓
SDK exits → sidecar emits "finished"
  ↓
UI shows preview modal → user reviews → Save
```

## Constraints (in system prompt)

- **At most 2 clarifying questions** — não vira interrogatório.
- **Use tools first, ask later** — só pergunta o que não dá pra inferir do código.
- **Concise** — sem filler, sem "I'll help you with that".
- **Body sections per type** (defined per template config).
- **Priority heuristics** explicitas no prompt.

## Alternatives reconsidered

### One-shot (rejected)

Simpler, lower latency, lower cost. Mas a qualidade do output baixa significativamente
sem grounding. Em testes mentais, casos onde one-shot é OK (título já super específico)
são raros — e o agente iterativo pula perguntas quando já é claro.

### Hybrid (one-shot first, ask if confused)

Considerado. Funciona, mas adiciona complexidade no prompt sem ganho claro vs. iterativo
direto que já é eficiente quando confidence é alta.

## Consequences

- Latência maior por interação (vários tool calls + possíveis Q's). Em prática:
  ~10-30s pra create item, vs ~5s one-shot. Aceitável.
- Cost maior por run (mais tokens). Cap em settings ($X/month) + warn.
- Sidecar precisa supportar multi-turn com stdin/stdout async — implementação mais cuidadosa.
- UI streaming (delta + question) é parte do design, não opcional.

## Out of scope (this ADR)

- `complete` trigger é mais simples (one-shot OK, agent só lê context e propõe note)
- `triage` é batch com per-item suggestions (não conversa por item)
- `digest` é narrativo standalone (sem perguntas)

Apenas `create` exige conversational. Outros triggers são one-shot. Veja AGENT_INTEGRATION.md.
