---
title: Agent SDK Integration
type: doc
status: planning
---

# Agent SDK Integration

## Goal

O agente Claude — invocado via `@anthropic-ai/claude-agent-sdk` — é o que transforma
"título de um bug" em ".md completo com Sintoma/Reprodução/Causa". Ele roda local,
faz perguntas, lê código do repo pra fundamentar respostas, e devolve um draft que
o usuário revisa antes de salvar.

## Trigger types

Quatro tipos de invocação. Cada um tem prompt system + tools próprios.

| Trigger | When | Input | Output |
|---|---|---|---|
| `create` | User clica "+ New" e escolhe agente | `{ repoId, type, title, description? }` | proposed `{ frontmatter, body }` |
| `complete` | User clica "Complete" sem `--note` manual | `{ itemId }` | proposed `note` string (added as `## Resolução`) |
| `triage` | User abre "Triage stale" panel | `{ repoId }` (and stale items as context) | per-item suggestion: `cancel` / `refresh` / `merge_into <id>` |
| `digest` | User clica "Generate weekly digest" | `{ repoId, since: date }` | markdown narrativo dos items completados |

## Architecture — sidecar process

Agent SDK é JS/TS. Tauri core é Rust. Solução: spawn Node sidecar **por agent run**, IPC via stdio JSON.

```
Rust (agent_pool)
   │
   │ spawns:  node sidecar/agent.mjs --runId=<uuid> --trigger=create --repo=civ-web --type=bug --title="..."
   │
   ├─→ stdin: JSON messages from Rust (user responses, abort)
   ├─← stdout: JSON messages from sidecar (delta, question, finished, tool_call)
   └─← stderr: logs (forwarded to app log file)
```

### Por que spawn por run, não daemon

- Agent SDK initialization é leve (~500ms). Spawn cost é aceitável.
- Isolamento de erros: se um agente trava ou OOM, mata só o sidecar dele.
- Sem state global persistente — cada run é independente.
- Cancellation trivial: `kill(pid)`.

### Alternativa considerada: Tauri sidecar binary

Tauri suporta declarar "sidecars" no `tauri.conf.json` que são bundlados no .app.
Vantagem: zero deps externas (Node embutido). Desvantagem: build complexo, agent SDK
ainda precisa de Node.js — empacotamento de Node como sidecar é mais trabalho.

**Decisão**: requirir Node 20+ instalado no sistema (`brew install node`). Documentar.
Quando o app é distribuído, validar Node disponível na primeira run; mostrar erro
amigável se não.

(Veja [ADR-003](../adr/003-tauri-react-stack.md) e [ADR-004](../adr/004-agent-sdk-iterative.md).)

## IPC protocol — stdio JSON

### Rust → Sidecar (stdin)

```jsonc
// 1. Initial config (sent on spawn before SDK init)
{ "kind": "init", "trigger": "create", "repoId": "...", "model": "claude-sonnet-4-6",
  "context": { "repoPath": "/Users/...", "type": "bug", "title": "..." } }

// 2. User response to a question
{ "kind": "user_response", "text": "só city panel" }

// 3. User accepts a tool result and asks agent to continue
{ "kind": "continue" }

// 4. Abort
{ "kind": "abort" }
```

### Sidecar → Rust (stdout, line-delimited JSON)

```jsonc
// Streaming partial output (assistant message deltas)
{ "kind": "delta", "text": "I'll check the Tooltip component..." }

// Tool call request (sidecar wants a tool, returns result async)
// Note: tools defined in Rust execute in Rust; SDK calls them via this mechanism.
{ "kind": "tool_call", "id": "call_123", "name": "read_repo_files", "args": { "pattern": "src/Tooltip*.tsx" } }

// Question to user (special tool the agent has)
{ "kind": "question", "text": "Reproduz com qualquer menu ou só com city panel?" }

// Final answer
{ "kind": "finished", "result": { "frontmatter": {...}, "body": "..." }, "model": "...", "tokensIn": N, "tokensOut": N, "costUsd": 0.012 }

// Error
{ "kind": "error", "message": "...", "kind": "rate_limit" }
```

### Tool execution flow

Agent SDK em modo "tools com host execution":

```
1. Sidecar emits { kind: "tool_call", id, name, args }
2. Rust executes the tool against the repo (filesystem, git2, DB)
3. Rust writes back to stdin: { kind: "tool_result", id: "call_123", result: {...} }
4. Sidecar resumes the SDK loop, agent processes the result
```

Why Rust executes tools (not the Node sidecar):
- Rust core já tem acesso ao DB e ao filesystem do repo via paths normalizados.
- Sandboxing: sidecar não acessa fs diretamente, só via tools que Rust controla.
- Performance: queries DB são mais rápidas direto do Rust.

## Tools

Tools são funções expostas ao agente. Cada uma tem schema (Zod-equivalent em sidecar) e implementação Rust.

### `read_repo_files`

```ts
{
  name: "read_repo_files",
  description: "Read files matching a glob pattern, scoped to the current repo. Use for grounding suggestions in actual code.",
  input: {
    pattern: string  // e.g. "src/components/Tooltip*.tsx"
    maxFiles?: number  // default 10
    maxBytes?: number  // default 100000 per file
  },
  output: Array<{ path: string, content: string }>
}
```

Rust implementation: `walkdir` scoped to `repo.path`, glob match, read with size cap.
Refusa paths fora de `repo.path` (`..` injection). Refusa binários (check magic bytes).

### `list_existing_items`

```ts
{
  name: "list_existing_items",
  description: "List existing work items in this repo, optionally filtered by type or status.",
  input: {
    type?: "improvement" | "bug" | "refactoring" | "feature",
    status?: "backlog" | "todo" | "in_progress" | "done" | "canceled" | "duplicate",
    limit?: number  // default 50
  },
  output: Array<{ id: string, title: string, status: string, labels: string[] }>
}
```

Rust: SELECT direto da tabela `items` filtrado por `repo_id`. Usado pra evitar
duplicatas e descobrir items relacionados.

### `run_git_log`

```ts
{
  name: "run_git_log",
  description: "Get recent commits touching a specific path. Useful for understanding what changed recently.",
  input: {
    path: string,                  // relative to repo root
    limit?: number,                // default 10
    sinceDate?: string             // YYYY-MM-DD
  },
  output: Array<{ sha: string, date: string, author: string, message: string }>
}
```

Rust: `git2::Revwalk` scoped to repo. Read-only.

### `read_item`

```ts
{
  name: "read_item",
  description: "Read full contents of an existing item by external_id (e.g., 'IMP-16').",
  input: { externalId: string },
  output: { id, title, body, frontmatter, comments: [...] }
}
```

Útil em triage / digest pra contextualizar.

### `propose_item` (only `create` trigger)

Tool que finaliza o flow. Quando o agente está confiante, chama:

```ts
{
  name: "propose_item",
  description: "Submit your final proposal. After this call, the user reviews and approves.",
  input: {
    frontmatter: {
      title: string,
      type: string,
      priority: string,
      labels: string[],
      // ... outros campos opcionais
    },
    body: string                 // markdown
  },
  output: { ok: true }           // signals end of conversation
}
```

Quando essa tool é chamada, sidecar emite `{ kind: "finished", result: {...} }` e termina.

### `propose_note` (only `complete` trigger)

```ts
{
  name: "propose_note",
  input: { note: string },        // 1-3 sentences resolution summary
  output: { ok: true }
}
```

### `ask_user`

Special tool — quando agente precisa de input. Sidecar emite `{ kind: "question" }` e
**bloqueia** esperando `{ kind: "user_response" }`. Implementado como SDK callback
custom que aguarda resposta async.

## System prompts (per trigger)

### Create

```
You are an assistant that helps users document software work items in markdown files.

The user has flagged something to document. Your job is to:
1. Understand it well enough to write a useful work item
2. Use tools to ground in the actual codebase
3. Ask clarifying questions when needed
4. Propose a final {frontmatter, body} structure

Context:
- Repo: {{repo.name}} ({{repo.path}})
- Type: {{type}}
- User's initial title: "{{title}}"
- User's description: "{{description}}"
- Available templates: {{templates.<type>.fields}}
- Active labels in this repo: {{repo.labels}}

Workflow:
1. Look at existing items via `list_existing_items` to avoid duplicates and reuse conventions.
2. If the title hints at code, use `read_repo_files` to find the relevant file(s) and ground your suggestions.
3. Use `run_git_log` if recent commits might be relevant.
4. Ask **at most 2 clarifying questions** via `ask_user` — only when truly needed (e.g., scope, severity).
5. When confident, call `propose_item` with the finalized content.

Style guide:
- Body sections per type:
  - bug: Sintoma / Reprodução / Causa raiz hipotética
  - improvement: Contexto / Ação / (opcional) Trade-offs
  - refactoring: Contexto / Plano / (opcional) Migration
  - feature: Objetivo / API / (opcional) Open questions
- Frontmatter `priority`: pick from Urgente/Alta/Média/Baixa/Nenhuma based on heuristics:
  - Urgente: data loss, security, broken main flow
  - Alta: regression in committed feature, blocks user
  - Média: new feature, polish, non-blocking bug
  - Baixa: nice-to-have, refactor, cleanup
- Labels: pick from `{{repo.labels.whitelist}}`. Use multiple when applicable.
- Be concise. Avoid filler. Don't speculate beyond what tools confirm.

If the user gives one-liner with no context, infer aggressively from `read_repo_files` then ask 1 question.
```

### Complete

```
You wrote a resolution note for a work item that's about to be marked done.

Context:
- Item: {{item.id}} — {{item.title}}
- Body: {{item.body}}
- Started: {{item.started_date}}
- Recent commits in this repo since started_date: {{git_log}}

Use `read_item` to see full body if needed, and `run_git_log` to see what was actually shipped.

Then call `propose_note` with a 1-3 sentence summary of what was done. Focus on the
**resolution**, not what the bug/improvement was about (that's already in the body).

Style:
- Past tense, factual
- Mention the actual fix (e.g., "added retry logic to fetchAiFogs")
- Don't describe the symptom, describe the fix
```

### Triage

```
You are reviewing a list of stale items. For each one, propose ONE action:
- "cancel" if obviously irrelevant
- "refresh" if still relevant but should be re-prioritized
- "merge_into <ID>" if duplicate of another item

Use `list_existing_items` to find potential duplicates. Use `read_item` for context.

Output: per-item suggestion JSON list.
```

### Digest

```
Generate a weekly changelog narrative for items completed in {{repo.name}} since {{since}}.

Group by theme (not by date). For each item:
- One-line summary of what shipped
- Optional: significance (if it was an Urgent fix or a milestone)

Use `read_item` for each completed item. Use `run_git_log` to ground in actual commits.

Output: markdown ready to paste into release notes.
```

## Cancellation

User clica "Cancel" → UI dispatches `agent_cancel(runId)` → Rust sends `{ kind: "abort" }`
to sidecar stdin → sidecar calls SDK abort signal → process exits → Rust marks
`agent_runs.status = 'cancelled'`.

Cleanup: any partial state in DB marked as discarded. No .md written.

## Cost & model selection

Default: `claude-sonnet-4-6` (boa qualidade pra documentation work).

Override por trigger / button:
- "Use Opus" toggle (settings panel) → `claude-opus-4-7`
- Triage default: Sonnet
- Digest default: Sonnet
- Create / Complete default: Sonnet

`agent_runs.cost_usd` calculado from `tokensIn * inputCost + tokensOut * outputCost` based on model.
Manager mostra cost cumulativo em settings ("$X.XX agent costs this month").

## API key

Reusar a key do Claude Code. Procura em ordem:
1. `ANTHROPIC_API_KEY` env var
2. `~/.claude/auth.json` (Claude Code's config)
3. App settings (manual override stored encrypted via Tauri's secure storage)

Se nenhum disponível, settings panel pede a key e armazena seguro via `keyring`/Tauri equivalent.

## Streaming UI

UI mostra a "conversa" em modal:

```
┌─ New Bug for civ-web ───────────────────────────────────────┐
│  Initial: "tooltip aparece com menu aberto"                  │
│                                                                │
│  🤖 Reading Tooltip.tsx and MenuComponent.tsx...               │
│  🤖 Tool: read_repo_files [pattern=src/components/Tooltip*]    │
│       → 2 files (4500 bytes)                                  │
│                                                                │
│  🤖 ❓ Reproduz com qualquer menu ou só com city panel?         │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Eu: só city panel                                       │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                │
│  🤖 Generating proposal...                                     │
│                                                                │
│  ┌─ Preview ────────────────────────────────────────────┐     │
│  │ id: BUG-08                                            │     │
│  │ title: tooltip persiste com city panel aberto         │     │
│  │ priority: Média                                       │     │
│  │ labels: [bug, ui]                                     │     │
│  │ ...                                                    │     │
│  │                                                       │     │
│  │ ## Sintoma                                            │     │
│  │ Tooltip continua visível após abrir CityPanel...     │     │
│  └───────────────────────────────────────────────────────┘     │
│                                                                │
│  [ Cancel ]  [ Edit before save ]  [ Save & commit → ]         │
└────────────────────────────────────────────────────────────────┘
```

## Error handling

| Error | Recovery |
|---|---|
| Sidecar crash (uncaught exception) | Mark run failed, show stderr in UI, no .md written |
| Rate limit (429) | Mark run failed with hint to retry; UI shows "rate limited" status |
| Tool error (e.g., file not found) | Sidecar reports as tool result error; agent gets it and adapts |
| Network error | Mark failed; show "no internet" status |
| Invalid `propose_item` (missing required fields) | Reject in Rust, send error back as tool result, agent retries |

## Logging

Sidecar `console.error` → Rust stderr → app log file at
`~/Library/Logs/com.journeystudios.roadmap-manager/agent-{runId}.log`.

Logs auto-rotate (max 50 files, max 10MB each).

## Rate limiting (client-side)

Max 1 concurrent agent run by default (Sonnet is fast enough). Setting bumps to 3.
Excess requests queue with toast "agent busy, request queued".

## Privacy

Agent calls hit Anthropic API. The prompt + tool results are sent over the network.
Manager **does not** send file contents from outside the configured repo. `read_repo_files`
strictly enforces path scope.
