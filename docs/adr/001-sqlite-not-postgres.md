---
id: ADR-001
title: SQLite (not Postgres) for the local cache
type: decision
status: ✅ accepted
created-date: 2026-04-29
---

# ADR-001 — SQLite (not Postgres) for the local cache

## Context

O manager precisa de um índice/cache local pra:
- Servir queries rápidas pra UI (kanban, filtros, search)
- Armazenar dados que não vivem no .md (agent_runs, notifications, app_state, comments metadata)
- Sobreviver entre sessões

Decisão original era Postgres local. Reavaliamos antes de implementar.

## Decision

Usar **SQLite** via `sqlx` (Rust). Arquivo único em
`~/Library/Application Support/com.journeystudios.roadmap-manager/db.sqlite` (macOS).

## Alternatives considered

### Postgres (rejected)

**Pros:**
- Familiar / industrial-strength
- Pgvector / json operators nativos
- Múltiplas conexões concorrentes (irrelevante aqui)

**Cons:**
- Server process separado: precisa instalar via brew/Docker, configurar, rodar
- Fricção pra distribuição: app standalone que requer Postgres rodando é UX ruim
- Single-user / local-only: zero ganho do server-mode
- Backup/migrate: SQL dumps precisam de pg_dump na máquina

### SQLite (accepted)

**Pros:**
- Zero setup. Embutido na lib `sqlx` ou `rusqlite`
- App é standalone .dmg: abre e funciona
- Backup trivial: copy the file
- Schema migrations idênticas (DDL é compatível)
- `~50MB` pra 5 repos × ~1k items × ~10kB médio — tamanho irrelevante

**Cons:**
- Não-concorrente write (single writer at a time) — irrelevante single-user
- Sem replicação — irrelevante local-only

## Consequences

- Stack Rust simplifica: `sqlx` com feature `sqlite-rustls` (no native deps)
- Migrations em `src-tauri/migrations/NNN_*.sql` aplicadas via `sqlx::migrate!`
- Distribuição como Tauri .dmg sem deps externas além de Node 20+ pro sidecar do agente
- Recovery trivial: delete o file → re-scan todos os repos via `rescan_repo`
- Future: se algum dia precisar multi-user / cloud, escrevemos um adapter — schema é portável
