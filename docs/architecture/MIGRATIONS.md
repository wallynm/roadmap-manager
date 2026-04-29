---
title: Migrations — schema & data
type: doc
status: planning
---

# Migrations

Dois tipos de migration:

1. **Schema migrations**: SQL DDL aplicada no DB (sqlx::migrate!)
2. **Data migrations**: lê/reescreve .md files quando user opt-in

Ambas são versionadas, idempotentes, e auditáveis.

## Schema migrations (SQL)

### Convention

- Pasta: `src-tauri/migrations/`
- Naming: `NNN_description.sql` (3-digit zero-pad, snake_case description)
- Aplicada na ordem na startup do app
- Nunca editar uma migration shipped — sempre nova

### Exemplos

```
src-tauri/migrations/
├── 001_initial.sql                # tables: repos, items, comments, agent_runs, app_state, notifications, views
├── 002_fts.sql                    # FTS5 virtual table for search (Phase 02)
├── 003_drop_area_column.sql       # remove items.area after Phase 07 area→labels migration shipped
├── 004_add_run_estimated_cost.sql # agent_runs.estimated_cost column for cost preview
└── ...
```

### Application

Em `main.rs` na startup:

```rust
let pool = SqlitePool::connect(&db_url).await?;
sqlx::migrate!("./migrations").run(&pool).await?;
```

Falha hard se uma migration falhar (corrupção potencial). User vê dialog "Database
migration failed — backup db.sqlite manually and contact support" e o app aborta.

### Schema migrations rollback

**Não suportado em v1**. Forward-only. Backups manuais via copy do `db.sqlite` antes
de upgrade do app.

## Data migrations (file rewrites)

### Convention

- Implementadas como funções Rust em `src-tauri/src/migrations/`
- Idempotentes: re-rodar não muda nada se já migrated
- Single auto-commit por repo: `chore(roadmap): {migration name}`
- Acionadas via Settings → Repos → [repo] → Migrations tab

### Active data migrations

#### M1: Priority 3-tier → 5-tier pt-br (ADR-007)

**Detect**: any item has `priority` in `[alta, média, baixa]` (lowercase, legacy).

**Apply**:
```rust
async fn migrate_priority(pool: &SqlitePool, repo: &Repo) -> Result<MigrationReport> {
    let items = db::list_by_repo(pool, repo.id).await?;
    let mut report = MigrationReport::default();
    for item in items {
        let new_priority = match item.priority.as_deref() {
            Some("alta")  => "Alta",
            Some("média") | Some("media") => "Média",
            Some("baixa") => "Baixa",
            None | Some("") => "Nenhuma",
            Some(p) if p.chars().next().is_some_and(|c| c.is_uppercase()) => continue, // already migrated
            Some(p) => return Err(format!("unknown priority: {}", p).into()),
        };
        if Some(new_priority) != item.priority.as_deref() {
            update_item_priority(pool, item.id, new_priority).await?;
            rewrite_md_with_new_priority(&item, new_priority).await?;
            report.updated += 1;
        }
    }
    if report.updated > 0 {
        single_commit(repo, "chore(roadmap): migrate priority to 5-tier pt-br").await?;
    }
    Ok(report)
}
```

**Single commit** with all changes batched. Stage all touched files, commit once.

#### M2: Area → labels (ADR-008)

**Detect**: any item has `area` field in frontmatter (legacy).

**Apply**:
```rust
async fn migrate_area_to_labels(pool: &SqlitePool, repo: &Repo) -> Result<MigrationReport> {
    let items = db::list_by_repo(pool, repo.id).await?;
    let mut report = MigrationReport::default();
    for item in items {
        let raw_fm = parse_raw_frontmatter(&item.raw_md)?;
        let area = raw_fm.get("area").map(|v| v.as_str().unwrap_or("").to_string());
        if let Some(area_value) = area {
            let mut labels: Vec<String> = serde_json::from_str(&item.labels).unwrap_or_default();
            if !labels.contains(&area_value) {
                labels.push(area_value);
            }
            // remove "area" key from frontmatter
            // set "labels" to merged array
            rewrite_md(&item, /* new fm */).await?;
            update_item_labels(pool, item.id, labels).await?;
            report.updated += 1;
        }
    }
    if report.updated > 0 {
        single_commit(repo, "chore(roadmap): migrate area to labels").await?;
    }
    Ok(report)
}
```

#### M3 (future): Rename label across repo

**Trigger**: user-initiated via Settings → Labels → Edit → Rename.

**Apply**: scan all items, replace label string in `labels` array, rewrite, single commit.

### Migration UI

Settings → Migrations tab:

```
┌─ Available migrations ──────────────────────────────────┐
│                                                          │
│ 🔄 Priority: 3-tier → 5-tier pt-br                       │
│   civ-web         12 items affected   [ Run ]            │
│   sim-web         8 items             [ Run ]            │
│   forest-web      ✅ already migrated                    │
│                                                          │
│ 🏷  Area → labels                                         │
│   civ-web         54 items affected   [ Run ]            │
│   sim-web         9 items             [ Run ]            │
│   forest-web      3 items             [ Run ]            │
│                                                          │
│ [ Run all pending ]                                      │
└──────────────────────────────────────────────────────────┘
```

Click "Run" → confirmation dialog showing exact transformation per item (preview)
→ apply → progress bar → done with summary toast.

### Auto-detection on first scan

When repo is added (Phase 01), after import, scanner detects pending migrations and
adds notification: "civ-web has 2 pending migrations — run from Settings".

User can dismiss or click → goes to Migrations panel.

### Migration safety

- All data migrations are **read-only by default** — they need explicit user action
- Pre-flight: check repo is clean (no uncommitted changes outside what migration will touch)
- Atomic batch: stage all files, single commit, OR rollback all
- Transactional in DB: BEGIN, run all updates, COMMIT (or ROLLBACK on error)
- Audit: each migration logs: items affected, before/after sample, duration

### Failed migration recovery

If a migration fails partway:

1. Files already written: kept as-is (no automatic revert via git — user reviews)
2. DB in transaction: rolled back automatically
3. Show error with details + log location
4. User options:
   - "Retry" — runs migration again (idempotent — already-migrated items skipped)
   - "Revert via git" — runs `git checkout <files>` to undo file changes (manager doesn't auto-revert)
   - "Continue manually" — guidance link

## Migration testing checklist

Before shipping a new data migration:

- [ ] Idempotent: run twice → second run reports 0 updated
- [ ] Pre-flight checks pass on a typical repo
- [ ] Confirmation dialog shows accurate count + sample transformations
- [ ] Single commit with all changes (not N commits)
- [ ] Rollback path documented
- [ ] Migration logged to app.log with summary
- [ ] Tested on simulation-engine (largest dataset) without manual intervention
