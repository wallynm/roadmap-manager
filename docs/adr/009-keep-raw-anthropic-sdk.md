---
id: ADR-009
title: Keep raw @anthropic-ai/sdk for sidecar agent
type: decision
status: ✅ accepted
created-date: 2026-04-29
---

# ADR-009 — Keep raw `@anthropic-ai/sdk` for sidecar agent

## Context

The sidecar (`sidecar/agent.mjs`) implements a conversational agent loop using
the raw `@anthropic-ai/sdk` (v0.30+). The original spec mentioned migrating to
`@anthropic-ai/claude-agent-sdk` which provides built-in tool execution loops,
abort signals, streaming helpers, and prompt caching.

Finding #9 from the [2026-04-29 validation report](../validation/2026-04-29-validation-report.md)
flagged this as drift.

## Decision

**Keep the raw SDK** for now.

## Rationale

1. **Manual loop works.** The current `agent.mjs` correctly iterates the
   `messages.create` → tool_use → tool_result cycle. Tool execution is routed
   through Rust via stdio IPC, which the agent SDK doesn't natively support
   (it expects tools to be JS functions).

2. **Minimal blast radius.** Migrating the agent SDK requires rearchitecting
   the tool execution flow. The `claude-agent-sdk` wants to execute tools
   internally; our design delegates tool execution to Rust for sandboxing and
   DB access. Adapting would require custom tool executors or a bridge layer.

3. **No blocking features missing.** The features the agent SDK adds (built-in
   abort signals, streaming helpers, prompt caching) are nice-to-have but not
   blocking the current use cases. Abort is handled via process kill. Streaming
   is line-delimited JSON. Prompt caching can be added manually via the raw
   SDK's `cache_control` parameter.

4. **Re-evaluate after real usage.** Once the full Phase 09 pipeline is shipped
   and we have real usage data, we can measure if the manual loop causes issues
   (memory leaks, error handling gaps, cost inefficiency from missing cache).
   If so, migrate then.

## Consequences

- Sidecar continues using `@anthropic-ai/sdk` directly.
- Tool loop remains manual in `agent.mjs`.
- Prompt caching can be added incrementally without SDK migration.
- If Anthropic deprecates or significantly changes the raw SDK API, we may need
  to migrate sooner. Monitor changelogs.

## Revisit trigger

- Agent SDK v1.0 stable release with clear advantages over raw SDK.
- Performance issues (cost, latency) that prompt caching would solve.
- Need for built-in abort signals that process kill doesn't cover cleanly.
