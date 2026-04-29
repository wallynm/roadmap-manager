---
id: PHASE-04
title: File watcher + sync — external edits, hash-based loop guard
type: spec
description: Add notify-based file watcher per repo, hash guard to prevent loops, silent re-read on external edits, conflict detection.
status: 🔄 partial
created-date: 2026-04-29
depends-on: [PHASE-03]
gaps: "F1 (watcher não wired a repos lifecycle) e F7 (eventos genéricos) — ver phase-09"
---

# Phase 04 — File watcher + sync

## Goal

Quando user edita um .md no Cursor (ou outro tool), manager detecta e atualiza SQLite
silenciosamente. Quando manager escreve, o watcher dispara mas reconhece como própria
write (hash match) e ignora. Loop guard robusto.

## Tasks

### 1. Watcher core

- [ ] `cargo add notify-debouncer-full`
- [ ] `src-tauri/src/watcher/mod.rs`:
  - `pub struct WatcherPool` — manages one `Debouncer` per repo
  - `pub fn add_repo(&mut self, repo: &Repo) -> Result<()>` — starts watching repo's template dirs
  - `pub fn remove_repo(&mut self, repo_id: Uuid)` — stops watching, drops debouncer
  - `pub async fn run(self, pool: SqlitePool, app: tauri::AppHandle) -> ()` — main event loop
- [ ] Debounce window: **500ms** (config TBD per platform if FSEvents needs different)
- [ ] Filter: only `.md` files, only paths under template dirs

### 2. Event handlers

- [ ] On `Modify(path)`:
  - Read file content
  - Compute hash
  - SELECT item WHERE file_path = path
  - If `item.file_hash == hash`: **ignore** (our own write)
  - Else: external edit → reconcile (parse + update DB) + emit `item:external_edit`
- [ ] On `Create(path)`:
  - If file matches a template prefix:
    - Parse + INSERT new item
    - Emit `item:created`
    - Add notification "Imported new item from disk: IMP-XX"
  - Else: ignore
- [ ] On `Remove(path)`:
  - DELETE item WHERE file_path = path
  - Emit `item:deleted`
  - Add notification "Item deleted from disk: IMP-XX"
- [ ] On `Rename(old, new)`:
  - Treat as Remove(old) + Create(new)
  - Reconcile: if item by `external_id` matches, update `file_path` instead of delete+insert

### 3. Reconciliation logic

- [ ] `src-tauri/src/sync/mod.rs`:
  ```rust
  pub async fn reconcile_external_edit(
      pool: &SqlitePool,
      repo: &Repo,
      path: &Path,
  ) -> Result<ReconcileOutcome> {
      let content = fs::read_to_string(path).await?;
      let new_hash = parser::hash(&content);

      let item = db::items::get_by_path(pool, repo.id, path).await?;
      if let Some(item) = &item {
          if item.file_hash == new_hash { return Ok(ReconcileOutcome::NoOp) }
      }

      let parsed = parser::parse(&content)?;
      let normalized = build_item_from_parsed(parsed, repo)?;

      match item {
          Some(existing) => {
              db::items::update_full(pool, existing.id, &normalized, &new_hash).await?;
              Ok(ReconcileOutcome::Updated(existing.id))
          }
          None => {
              let inserted = db::items::insert(pool, &normalized, &new_hash).await?;
              Ok(ReconcileOutcome::Created(inserted.id))
          }
      }
  }
  ```

### 4. Visual notifications

- [ ] On reconcile: INSERT into `notifications` table:
  - `kind: 'external_edit'`
  - `title: 'IMP-16 edited externally'`
  - `body: 'Status changed from in_progress to done by external edit'` (diff summary)
- [ ] UI inbox shows notification with link to item
- [ ] No sound (per UI_DESIGN spec)

### 5. App startup reconciliation

- [ ] On app launch, before starting watcher:
  - For each repo, run a quick "incremental rescan" comparing current file hashes with DB
  - Pick up any changes that happened while app was closed
  - Emit notifications for detected changes
  - Set `repos.last_scan = now()` after success

### 6. Pause / resume controls

- [ ] Settings → Watcher → toggle per-repo
- [ ] When paused, no events processed; resume triggers full rescan
- [ ] Useful pra git pulls grandes ou refactors em massa fora do app

### 7. Conflict detection

- [ ] Mutation flow (Phase 03) needs an extra check:
  ```rust
  async fn complete_item(...) -> Result<Item> {
      let item = db::get(id).await?;
      let actual_content = fs::read(&item.file_path).await?;
      let actual_hash = hash(&actual_content);
      if actual_hash != item.file_hash {
          // External edit happened between DB cache and now
          // Force re-sync first
          reconcile_external_edit(&repo, &item.file_path).await?;
          // Re-read item from DB after reconcile
          let item = db::get(id).await?;
          // Continue mutation with fresh state
      }
      // ... rest of mutation
  }
  ```

- [ ] If conflict is irreconcilable (e.g., user changed status in editor + UI clicked complete):
  - Show modal: "External edit detected — keep external version, or apply your change?"
  - User chooses. Either way, manager logs the conflict.

### 8. Branch switch handling

- [ ] When user runs `git checkout other-branch`, many .md files may change at once
- [ ] Watcher fires N events over the debounce window
- [ ] Each is processed individually
- [ ] After dust settles (debounce period passes), emit `repo:branch_changed` event
- [ ] UI shows toast: "Switched to branch X — items refreshed"

### 9. Error handling

- [ ] Parse errors: tag item with `parse_error: <message>` in DB; show in UI as "broken card"
- [ ] Permission errors: alert and skip
- [ ] Watcher crashes: restart with backoff; if persistent, alert user

## Files to create / modify

### New

```
src-tauri/src/
├── watcher/
│   ├── mod.rs
│   ├── pool.rs
│   └── handlers.rs
└── sync/
    ├── mod.rs
    └── reconcile.rs
```

### Modified

```
src-tauri/src/main.rs       # init WatcherPool, attach to app state, launch task
src-tauri/src/ipc/mutations.rs  # pre-mutation conflict check
src-tauri/src/db/notifications.rs  # add notifications CRUD
src/components/inbox/InboxPanel.tsx  # render external_edit notifications
src/hooks/useWatcherEvents.ts  # listen to Tauri events for live updates
```

## Acceptance criteria

- [ ] Edit `.md` in Cursor: kanban card auto-refreshes within 1s of save
- [ ] Click "Complete" in UI: file written, watcher fires but no infinite loop (hash match)
- [ ] Delete file via terminal: card disappears within 1s
- [ ] Create new file matching template: imported automatically, card appears
- [ ] Branch switch: items reflect new branch state after checkout completes
- [ ] App startup after closing while editing: incremental rescan picks up changes
- [ ] Conflict scenario (UI vs editor edit at same time): modal lets user choose

## Stress tests (manual, not automated)

- [ ] `git pull` que muda 50 .md files: watcher debounces, processes in batches, no UI freeze
- [ ] Edit .md to invalid YAML: marked broken; rest of items still functional
- [ ] Delete + recreate file in <500ms: handled correctly (treated as modify)
- [ ] Repo path moved on disk (e.g., user renamed dir): watcher errors, UI shows "repo unavailable" until path is updated

## Notes

- Watcher is critical infrastructure — over-test edge cases.
- Hash compare is the single source of truth for "did manager write this or external".
- Don't try to be too smart with diffing — full re-parse + re-write is fine performance-wise (file <100kB).
