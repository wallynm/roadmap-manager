---
title: Data Model — SQLite schema
type: doc
status: planning
---

# Data Model

## Stack

- **SQLite** via `sqlx` (Rust). Arquivo único em `~/Library/Application Support/com.journeystudios.roadmap-manager/db.sqlite` (macOS).
- **Migrations**: arquivos `.sql` versionados em `src-tauri/migrations/`, aplicados na startup via `sqlx::migrate!`.
- **Não** usar ORM. SQL escrito manualmente, queries tipadas via `sqlx::query_as!`.

## Por que SQLite (não Postgres)

Veja [ADR-001](../adr/001-sqlite-not-postgres.md). Resumo:
- Single-user local-only → zero benefício do server-mode
- 5 repos × ~1k items × ~10kB médio = 50MB. SQLite engole numa boa.
- Zero setup → o app é um .dmg que abre e funciona, sem dependência externa.
- Recovery trivial: `rm db.sqlite && rescan all repos`.

## Schema (initial migration: `001_initial.sql`)

```sql
-- Repos cadastrados pelo usuário. Path absoluto no filesystem.
CREATE TABLE repos (
    id          TEXT PRIMARY KEY,           -- UUID v4
    name        TEXT NOT NULL UNIQUE,       -- "civ-web" (display name)
    path        TEXT NOT NULL UNIQUE,       -- absolute, e.g. /Users/wally/repos/civ-web
    config      TEXT NOT NULL,              -- JSON: templates + label whitelist + defaults
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    last_scan   TEXT                        -- last successful full rescan
);

-- One row per .md file we manage.
CREATE TABLE items (
    id              TEXT PRIMARY KEY,           -- UUID v4
    repo_id         TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    external_id     TEXT NOT NULL,              -- "IMP-16" — unique per repo, not global
    type            TEXT NOT NULL,              -- "improvement" | "bug" | "refactoring" | "feature" | "spec" | "decision"
    title           TEXT NOT NULL,
    file_path       TEXT NOT NULL,              -- relative to repo, e.g. "docs/improvements/imp-16-aifogs.md"
    file_hash       TEXT NOT NULL,              -- sha256 of the entire file contents (for loop guard)
    body            TEXT NOT NULL,              -- raw markdown body (everything after frontmatter)
    frontmatter     TEXT NOT NULL,              -- raw YAML (preserved verbatim for round-tripping)

    -- Indexed/extracted from frontmatter for queries:
    status          TEXT NOT NULL,              -- "backlog" | "todo" | "in_progress" | "done" | "canceled" | "duplicate"
    priority        TEXT,                       -- "urgente" | "alta" | "média" | "baixa" | "nenhuma" (nullable for types without priority)
    labels          TEXT NOT NULL DEFAULT '[]', -- JSON array of strings
    depends_on      TEXT NOT NULL DEFAULT '[]', -- JSON array of external_id strings
    duplicate_of    TEXT,                       -- external_id when status='duplicate'
    created_date    TEXT,                       -- YYYY-MM-DD
    started_date    TEXT,                       -- YYYY-MM-DD (when entered InProgress)
    completed_date  TEXT,                       -- YYYY-MM-DD (when entered Done/Canceled)

    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(repo_id, external_id),
    UNIQUE(repo_id, file_path)
);

CREATE INDEX idx_items_repo_status ON items(repo_id, status);
CREATE INDEX idx_items_priority ON items(priority);

-- Comments live in DB AND get round-tripped to "## Comments" section in .md.
CREATE TABLE comments (
    id          TEXT PRIMARY KEY,
    item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    author      TEXT NOT NULL,                  -- "wally" | "agent"
    is_agent    INTEGER NOT NULL DEFAULT 0,     -- 0 = human, 1 = agent
    body        TEXT NOT NULL,                  -- markdown
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_comments_item ON comments(item_id, created_at);

-- Audit trail of agent invocations. Reproduces the run history visible in UI.
CREATE TABLE agent_runs (
    id           TEXT PRIMARY KEY,
    repo_id      TEXT REFERENCES repos(id) ON DELETE SET NULL,
    item_id      TEXT REFERENCES items(id) ON DELETE SET NULL,  -- nullable for "create" trigger (no item yet)
    trigger      TEXT NOT NULL,                  -- "create" | "complete" | "triage" | "digest"
    model        TEXT NOT NULL,                  -- "claude-sonnet-4-6" | "claude-opus-4-7"
    status       TEXT NOT NULL,                  -- "running" | "succeeded" | "failed" | "cancelled"
    prompt       TEXT NOT NULL,                  -- initial user input
    transcript   TEXT,                           -- full conversation as JSON array (user/assistant/tool messages)
    output       TEXT,                           -- final result (proposed .md content for create, note for complete, etc)
    error        TEXT,                           -- if status=failed
    duration_ms  INTEGER,
    cost_usd     REAL,
    started_at   TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at  TEXT
);

CREATE INDEX idx_agent_runs_item ON agent_runs(item_id);
CREATE INDEX idx_agent_runs_status ON agent_runs(status);

-- App-wide singleton for window state, last-selected repo, etc.
CREATE TABLE app_state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL                         -- JSON
);

-- Notifications inbox (sound already played; this is for visual badge + history).
CREATE TABLE notifications (
    id          TEXT PRIMARY KEY,
    kind        TEXT NOT NULL,                  -- "agent_finished" | "external_edit" | "stale_alert" | etc.
    title       TEXT NOT NULL,
    body        TEXT,
    item_id     TEXT REFERENCES items(id) ON DELETE CASCADE,
    read        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_notifications_unread ON notifications(read, created_at) WHERE read = 0;

-- Saved filters / views (Linear-style "Views").
CREATE TABLE views (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    repo_id     TEXT REFERENCES repos(id) ON DELETE CASCADE,  -- nullable = global view
    filters     TEXT NOT NULL,                  -- JSON: { status?, priority?, labels?, type? }
    sort        TEXT NOT NULL DEFAULT '[]',     -- JSON array of sort specs
    layout      TEXT NOT NULL DEFAULT 'kanban', -- "kanban" | "list" | "graph"
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## `repos.config` JSON shape

Esse blob é o template do repo. Veja [REPO_CONFIG.md](REPO_CONFIG.md) para spec completa.
Resumo aqui:

```jsonc
{
  "templates": {
    "improvement": {
      "dir": "docs/improvements",
      "filePrefix": "imp",
      "idPrefix": "IMP",
      "frontmatterFields": ["id", "title", "type", "priority", "status", "labels", "created-date"],
      "defaults": {
        "priority": "Média",
        "status": "⬜ pendente",
        "labels": ["architecture"]
      },
      "bodyTemplate": "# {ID} — {TITLE}\n\n**Contexto:** TODO\n\n**Ação:** TODO\n"
    },
    "bug":          { /* similar */ },
    "refactoring":  { /* similar */ },
    "feature":      { /* similar (only fw-pixijs-style) */ }
  },
  "labels": {
    "whitelist": ["architecture", "performance", "correctness", "feature", "ui", "testing", "refactoring", "design", "documentation", "bug", "tech-debt"],
    "colors": {
      "architecture": "#8B5CF6",
      "performance":  "#F59E0B",
      "correctness":  "#EF4444",
      "feature":      "#3B82F6",
      "ui":           "#EC4899",
      "testing":      "#10B981",
      "refactoring":  "#6B7280",
      "bug":          "#DC2626"
    }
  },
  "autoCommit": {
    "enabled": true,
    "branch": null,                     // null = current branch | "chore/roadmap" = always this
    "messageFormat": "chore(roadmap): {ID} → {STATUS_VERB}",
    "includeNoteInBody": true,
    "addReferenceLine": true            // appends "Closed via roadmap-manager on {DATE}." etc.
  }
}
```

## Migrations strategy

- Migrations live in `src-tauri/migrations/NNN_description.sql`.
- Naming: `001_initial.sql`, `002_add_views_table.sql`, etc.
- Applied in order on every app startup via `sqlx::migrate!()`.
- **Never** edit a shipped migration — always add a new one.
- Schema changes that require data migration (e.g., split a column): include `UPDATE` statements in the same migration file.

## Data migrations (ADR-007 priority + ADR-008 area→labels)

Estas rodam **uma vez por repo** quando ele é cadastrado pela primeira vez (ou via "Migrate" button no settings):

### Priority migration (ADR-007)

`alta/média/baixa` (3-tier) → `Urgente/Alta/Média/Baixa/Nenhuma` (5-tier pt-br).

| Antes (frontmatter) | Depois (frontmatter) |
|---|---|
| `priority: alta` | `priority: Alta` (capitalize, no change in tier) |
| `priority: média` | `priority: Média` |
| `priority: baixa` | `priority: Baixa` |
| missing | `priority: Nenhuma` |

`Urgente` é nova — só atribuída a items novos manualmente (ou via agent triage).

Implementação: scan all .md files no repo, capitalize, write back. Auto-commit:
`chore(roadmap): migrate priority to 5-tier pt-br`.

### Area → labels migration (ADR-008)

`area: testing` → `labels: [testing]` (mescla com labels existentes).

| Antes | Depois |
|---|---|
| `area: testing`<br>(no labels) | `labels: [testing]` |
| `area: correctness`<br>`labels: [bug]` | `labels: [bug, correctness]` |
| `area:` ausente | `labels: []` (no-op) |

Auto-commit: `chore(roadmap): migrate area to labels`.

Após migration, `area` deixa de existir como campo no schema. Validação só checa `labels`.

## Index reconstruction (rescan)

Reconstruct DB from .md files:

```rust
async fn rescan_repo(repo_id: Uuid) -> Result<RescanReport> {
    let repo = db.get_repo(repo_id).await?;
    let mut report = RescanReport::default();

    // 1. Walk filesystem per template directory
    let on_disk: HashMap<String, ParsedItem> = walk_repo(&repo).collect();

    // 2. Compare with DB
    let in_db: HashMap<String, Item> = db.list_items(repo_id).await?.into_iter()
        .map(|i| (i.file_path.clone(), i))
        .collect();

    // 3. Diff
    for (path, parsed) in &on_disk {
        match in_db.get(path) {
            None => {
                db.insert_item(parsed.into()).await?;
                report.added += 1;
            }
            Some(existing) if existing.file_hash != parsed.hash => {
                db.update_item(existing.id, parsed.into()).await?;
                report.updated += 1;
            }
            Some(_) => {} // unchanged
        }
    }

    for (path, _) in &in_db {
        if !on_disk.contains_key(path) {
            db.delete_item_by_path(path).await?;
            report.removed += 1;
        }
    }

    db.set_repo_last_scan(repo_id, Utc::now()).await?;
    Ok(report)
}
```

Usado em:
- First import quando repo é adicionado
- Manual "Rescan" button no settings
- Recovery quando o DB foi apagado

## Backup / export

Export por repo: gera um JSON com todos os items. Útil para versão histórica fora do git.

```sh
# CLI tool that lives next to the app:
roadmap-manager export --repo civ-web > civ-web-snapshot.json
```

Não é prioritário pra v1 — ADR pode adicionar quando precisar.
