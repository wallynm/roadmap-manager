---
id: PHASE-07
title: Comments + labels + priority migration
type: phase
status: 📋 backlog
labels: []
created-date: 2026-04-29
depends-on: [PHASE-06]
---

# Phase 07 — Comments + labels + priority migration

## Goal

Polish: comments visíveis e funcionais com round-trip pro .md. Labels com cores e
gestão visual. Rodar as migrations (priority 3→5-tier pt-br, area→labels) nos repos
existentes.

## Tasks

### 1. Comments round-trip

- [ ] Parser: detect `## Comments` section in body, extract entries
  ```
  ## Comments

  ### YYYY-MM-DD HH:MM — author
  Comment body (markdown, multi-line OK)

  ### YYYY-MM-DD HH:MM — agent (auto)
  Another comment...
  ```
- [ ] Parser regex captures: timestamp, author, isAgent (parse "agent (auto)"), body
- [ ] On scan/import: parsed comments → INSERT into `comments` table
- [ ] On comment write: regenerate the entire `## Comments` section in body
  - Sort comments by `created_at` ascending
  - Format consistently (always 2-space indent for body, blank line between entries)
- [ ] Idempotent: parse → re-render produces same bytes (no drift)

### 2. Add comment UI

- [ ] Item details modal → "Add comment" button → textarea modal
- [ ] Author resolved from `git config user.name` (cached in `app_state`)
- [ ] On submit:
  - INSERT into comments
  - Regenerate `## Comments` section
  - Write file + auto-commit (`chore(roadmap): IMP-16 commented`)
- [ ] Edit comment: pencil icon on each entry → inline editor → save updates DB + re-renders section
- [ ] Delete comment: trash icon → confirm → removes from DB + re-renders

### 3. Agent comments

- [ ] Agent (any trigger) can call special tool `add_comment` to leave a comment on an item
- [ ] Comments from agent stored with `is_agent=1`, displayed with 🤖 icon and `(auto)` suffix
- [ ] Common pattern: in `complete` trigger, agent adds a comment with details (raw git log analysis) before proposing the brief note

### 4. Labels UI

- [ ] Item card: chip per label, colored per `repos.config.labels.colors`
- [ ] Item details modal → labels editor: shadcn `<Combobox>` with whitelist + add/remove
- [ ] If `allowFreeForm: true`, "Create label" appears in combobox when typed value not in whitelist
- [ ] Color picker: pick from preset palette (12 colors), assigned per label per repo

### 5. Settings: labels panel

- [ ] Settings → Repos → [repo] → Labels tab
- [ ] List of labels with color swatch, usage count
- [ ] Edit: rename label (propagates to all items using it via batch mutation)
- [ ] Delete: warns "X items use this label", confirmation, then bulk-removes from items
- [ ] Color picker per label
- [ ] Toggle `allowFreeForm`

### 6. Priority migration

- [ ] Settings → Repos → [repo] → "Migrate priorities" button (visible only if any item has lowercase priority)
- [ ] On click:
  - Confirmation dialog: "This will rewrite N items: alta → Alta, média → Média, baixa → Baixa, missing → Nenhuma. Auto-commit will be made. Continue?"
  - If confirmed:
    - Batch update all items in repo
    - Single commit: `chore(roadmap): migrate priority to 5-tier pt-br`
    - Show progress + summary
- [ ] Auto-detect on first scan: if mixed priority forms detected, show banner "Migrate priorities?" with one-click action

### 7. Area → labels migration

- [ ] Similar to priority migration:
  - Settings → Repos → [repo] → "Migrate area to labels" button
  - Shows preview of transformation per item
  - Confirms, batch updates, single commit `chore(roadmap): migrate area to labels`
- [ ] After migration, `area:` field removed from frontmatter; values appear in `labels:`

### 8. Cancellation reasons + duplicate context

- [ ] Cancel item → reason dialog → reason persisted as `## Cancelamento (DATE)\n\n{reason}` body section
- [ ] Mark duplicate → `duplicate_of: <external_id>` in frontmatter + `## Duplicate of\n\n[<id>](path)` body section
- [ ] UI clearly shows duplicate-of link in item details modal (clickable to open original)

## Files to create / modify

### New

```
src/components/
├── labels/
│   ├── LabelChip.tsx
│   ├── LabelEditor.tsx
│   └── LabelManager.tsx        # settings panel
├── comments/
│   ├── CommentList.tsx
│   ├── CommentEntry.tsx
│   └── AddCommentDialog.tsx
└── settings/
    └── MigrationPanel.tsx

src-tauri/src/migrations/
├── priority.rs       # batch priority normalization
└── area_to_labels.rs # batch area extraction → labels merge
```

### Modified

```
src-tauri/src/parser/   # add comments section parser
src-tauri/src/writer/   # regenerate comments section
src-tauri/src/ipc/comments.rs  # add CRUD commands
src/components/modals/ItemDetailsModal.tsx  # comments + labels integration
src-tauri/src/ipc/migrations.rs  # migration commands
```

## Acceptance criteria

- [ ] Add comment via UI → file gets `## Comments` section appended/updated → committed
- [ ] Edit existing comment in section: parsed correctly even if user manually edited the .md
- [ ] Delete comment: section re-rendered without that entry
- [ ] Round-trip stable: parse → render produces identical bytes
- [ ] Labels editor allows multi-select from whitelist; colors render correctly
- [ ] Run priority migration on simulation-engine → all 254 items end up with capitalized 5-tier priority
- [ ] Run area→labels migration → `area: testing` items now have `labels: [testing]` (merged with existing labels)
- [ ] Auto-detection banner appears post-import if migrations are pending

## Notes

- Comments e labels são features Linear-essential. Comments podem virar dor pequena
  se editados ao mesmo tempo via UI e via editor — testar reconciliação.
- Migrations são idempotentes: re-rodar não faz nada (já normalized).
- Agent's complete-trigger pode usar `add_comment` para deixar contexto detalhado
  antes de propor o note brief.

### 2026-04-30 05:39 — Wallysson Nunes
Eu acho que ja está funcionando!

### 2026-04-30 05:41 — Wallysson Nunes
Esse é outro caso
