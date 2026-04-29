---
id: ADR-002
title: .md files are source of truth, SQLite is cache
type: decision
status: ✅ accepted
created-date: 2026-04-29
---

# ADR-002 — .md files are source of truth, SQLite is cache

## Context

Two options for the data canonical:
- (A) **DB-first**: manager writes to SQLite first, then renders .md files. DB is canonical.
- (B) **MD-first**: manager writes to .md files first, watcher rebuilds SQLite cache. Files are canonical.

Cada um tem trade-offs reais sobre edição manual, sync, recovery.

## Decision

**Option B**: `.md` files são source of truth. SQLite é cache reconstrutível.

## Alternatives considered

### Option A (DB-first) — rejected

**Pros:**
- Transactional writes (ACID for cross-table updates)
- Faster mutations (no file write path)
- Could have non-md-representable state easily

**Cons:**
- Manual edits in IDE/Cursor become "stale" — DB doesn't see them until reconcile
- Conflict resolution is hard: which side wins?
- Loses the property that `git log` is the audit trail
- Breaks integration with external tools (any script reading .md is one step behind)
- "Source of truth" diverges from version control

### Option B (MD-first) — accepted

**Pros:**
- Edição no IDE continua funcionando (user pode editar `imp-16.md` no Cursor a qualquer momento)
- Git é o audit trail (cada mutation = commit)
- Recovery trivial: delete SQLite, rescan all repos, recompute
- Compat com tooling existente (validate scripts, grep, find, etc.)
- Files are inherently shareable / versionable / collaboratable
- "What you see in `git diff` is what changed" — consistent mental model

**Cons:**
- Slower mutations (file write + git commit on every change)
- Need a robust watcher to keep cache in sync (see FILE_SYNC.md)
- Hash-based loop guard adds complexity
- Some state lives only in DB (agent_runs, notifications) — not in files

## Consequences

- All mutations go through `parser.write` → file → `git commit` → cache update flow
- Watcher with hash guard reconciles external edits (see FILE_SYNC.md)
- "DB-only" state (agent runs, notifications, app state) is acknowledged as ephemeral
  and not part of the canonical roadmap data
- `rescan_repo` is a fundamental operation (DB recoverable from files)
- Backup strategy: backup the .md files (via git push). DB regenerable.

## Trade-offs accepted

- Race window between manager-write and watcher-event is mitigated via hash compare,
  not via lock files or pause mechanisms. Edge cases documented in FILE_SYNC.md.
- "Item exists in DB but file is gone" edge case: watcher delete event removes the row.
- "File exists but no DB row" (user creates a file outside the manager): rescan picks it up;
  watcher `Create` event auto-imports.
