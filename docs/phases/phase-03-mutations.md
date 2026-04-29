---
id: PHASE-03
title: Mutations sem agente — create/start/complete/plan/block + auto-commit
type: spec
description: All write operations go through manager: create item via form, start, complete with note, cancel, mark duplicate, plan (re-open), add/remove dependency. Auto-commit per mutation.
status: 🔄 partial
created-date: 2026-04-29
depends-on: [PHASE-02]
gaps: "F5 (YAML escape) e F6 (auto-commit error propagation) — ver phase-09"
---

# Phase 03 — Mutations sem agente

## Goal

Permitir todas as operações de escrita pela UI — sem agente ainda. User cria items
manualmente via form, drag-drop atualiza status, complete adiciona note manual.

Fluxo "validation cruzada" da ROADMAP.md fica funcional **menos** a parte do agente:
user cria item via form, escreve sintoma/reprodução manualmente, clica "Save",
manager grava .md + auto-commit.

## Tasks

### 1. Idempotent writer

- [ ] `src-tauri/src/writer/mod.rs`:
  - `pub fn render(item: &Item, template: &Template) -> String` — produces the full .md content
    (frontmatter + body) deterministically. Same item + template = same bytes.
  - YAML serialization preserves field order from `template.frontmatterFields`
  - Body is `item.body` as-is (no auto-formatting beyond trim trailing whitespace)
  - Trailing newline always present (POSIX convention)
- [ ] `pub async fn write_atomic(path: &Path, content: &str) -> Result<()>`:
  - Write to `<path>.tmp`, then `rename` (atomic on POSIX)
- [ ] `pub fn compute_hash(content: &str) -> String` — sha256 hex (already in parser, re-export)

### 2. Git VCS module

- [ ] `cargo add git2`
- [ ] `src-tauri/src/vcs/mod.rs`:
  - `pub fn auto_commit(repo: &Repo, item: &Item, action: ActionType, note: Option<&str>) -> Result<Oid>`
  - Implementation per [FILE_SYNC.md § Auto-commit](../architecture/FILE_SYNC.md#auto-commit)
  - Stage only the specific .md file (NOT `git add -A`)
  - Build commit message via template substitution
  - Use git config user.name/email for signature (don't override)
  - Respect GPG signing if configured
- [ ] `pub fn current_branch(repo: &Repo) -> Result<String>`
- [ ] `pub fn is_dirty(repo: &Repo, exclude: &[PathBuf]) -> Result<bool>`
- [ ] Branch policy enforcement (return errors UI can display)

### 3. Mutation commands

- [ ] In `src-tauri/src/ipc/items.rs`, implement all mutation commands:

```rust
#[tauri::command]
async fn create_item(repo_id: Uuid, type_: String, title: String, body: String,
                    priority: String, labels: Vec<String>) -> Result<Item> {
    // 1. Validate type against repo template
    // 2. Generate next external_id
    // 3. Build frontmatter dict from template fields + provided values
    // 4. Render via writer
    // 5. Compute file path (template.dir / filePrefix-NN-slug.md)
    // 6. Write atomic
    // 7. INSERT into items
    // 8. auto_commit
    // 9. Emit Tauri event item:created
    // 10. Return new item
}

async fn update_item(id: Uuid, patch: ItemPatch) -> Result<Item> { /* ... */ }
async fn start_item(id: Uuid) -> Result<Item> { /* status → in_progress, started_date = today */ }
async fn complete_item(id: Uuid, note: Option<String>) -> Result<Item> {
    // status → done
    // completed_date = today
    // if note: append "## Resolução (DATE)\n\n{note}\n"
    // commit
}
async fn cancel_item(id: Uuid, reason: Option<String>) -> Result<Item> { /* similar */ }
async fn mark_duplicate(id: Uuid, original_id: String) -> Result<Item> {
    // status → duplicate
    // duplicate_of = original_id
    // append "## Duplicate of\n\n[ID](file)" to body
}
async fn plan_item(id: Uuid) -> Result<Item> {
    // status: done|canceled → todo
    // clear completed_date, started_date stays
    // append "## Re-aberto (DATE)" or "## Re-ativado (DATE)" section
}
async fn add_dependency(id: Uuid, blocker_id: String) -> Result<Item> {
    // validate blocker exists in same repo (no cross-repo per ADR-005)
    // depends_on array push, dedup
}
async fn remove_dependency(id: Uuid, blocker_id: String) -> Result<Item> { /* ... */ }
async fn add_comment(item_id: Uuid, body: String) -> Result<Comment> {
    // INSERT into comments
    // Re-render `## Comments` section in .md (regenerate from all comments for this item)
    // Write + commit
}
```

- [ ] Every mutation uses transactional pattern:
  1. Read fresh from DB
  2. Verify file_hash matches actual file (catch externals)
  3. Apply patch
  4. Render new content
  5. Write file
  6. UPDATE DB row + new file_hash
  7. Commit
  8. Emit event
- [ ] State machine validation: reject invalid transitions with `Error::InvalidTransition`

### 4. ID generation

- [ ] `src-tauri/src/writer/ids.rs`:
  - `pub async fn next_external_id(pool, repo_id, type_, template) -> String`
  - Scan existing items for that type in that repo
  - Extract numeric suffix from external_id (e.g. `IMP-16` → `16`)
  - Return `template.idPrefix + "-" + (max+1).pad(template.idPadding)`

### 5. Slug generation

- [ ] `src-tauri/src/writer/slug.rs`:
  - `pub fn slugify(s: &str) -> String`:
    - Lowercase
    - Remove pt-br accents (NFD normalize)
    - Replace whitespace + non-word with `-`
    - Collapse `--+` to `-`
    - Trim `-` from ends
    - Cap at 60 chars

### 6. Comments section round-trip

- [ ] When adding a comment, re-render the `## Comments` section in body:

```markdown
## Comments

### 2026-04-29 14:32 — wally
Tentei reproduzir...

### 2026-04-29 16:10 — agent (auto)
Encontrei referência...
```

- [ ] Parser reads existing `## Comments` and parses back into `comments` table on rescan/import
- [ ] Modifying or deleting a comment regenerates the entire section

### 7. UI mutations

- [ ] **New item modal** (functional now): form com title, type, priority dropdown, labels chips, description textarea
- [ ] Drag-drop in kanban → mutation. Animation: optimistic update via TanStack Query, revert on error.
- [ ] Item details modal: action buttons trigger mutations
  - "Complete" → opens dialog asking for note (optional) → calls complete_item
  - "Cancel" → asks reason
  - "Mark duplicate" → autocomplete search picker
  - "Plan (re-open)" → confirm
  - "Add comment" → textarea modal
- [ ] Right pane in details: status/priority/labels selectors all functional
- [ ] Add/remove dependency UI (search picker for blocker)

### 8. Optimistic UI

- [ ] All mutations use TanStack Query `onMutate` for optimistic updates:
  ```ts
  useMutation({
    mutationFn: completeItem,
    onMutate: async ({ id, note }) => {
      await queryClient.cancelQueries(['items', repoId])
      const previous = queryClient.getQueryData(['items', repoId])
      queryClient.setQueryData(['items', repoId], (old) =>
        old.map(i => i.id === id ? { ...i, status: 'done' } : i)
      )
      return { previous }
    },
    onError: (err, vars, ctx) => {
      queryClient.setQueryData(['items', repoId], ctx.previous)
      toast.error(`Failed: ${err.message}`)
    },
    onSuccess: (item) => {
      queryClient.invalidateQueries(['items', repoId])
      toast.success(`${item.id} completed`)
    },
  })
  ```

### 9. Toast notifications (sonner)

- [ ] Success: short, dismissable (`IMP-16 completed`)
- [ ] Error: persistent, with retry button (`Failed: branch protection`)
- [ ] Mutation in flight: subtle spinner

## Files to create / modify

### New

```
src-tauri/src/
├── writer/
│   ├── mod.rs
│   ├── ids.rs
│   └── slug.rs
├── vcs/
│   ├── mod.rs
│   └── error.rs
└── ipc/
    └── mutations.rs   # all mutation commands

src/components/modals/
├── NewItemModal.tsx       # full-featured form (no agent yet)
├── CompleteItemDialog.tsx
├── CancelItemDialog.tsx
└── MarkDuplicateDialog.tsx

src/hooks/
├── useCreateItem.ts
├── useUpdateItem.ts
├── useCompleteItem.ts
└── useDependencies.ts
```

### Modified

```
src-tauri/src/parser/   # add comments section parsing
src-tauri/src/db/items.rs  # update queries
src/components/kanban/KanbanBoard.tsx  # wire drag-drop to mutations
src/components/modals/ItemDetailsModal.tsx  # action buttons functional
```

## Acceptance criteria

- [ ] Creating new item via form writes correct .md with auto-commit
- [ ] Drag card from Todo → In Progress: file gets `status: 🔄 em andamento` + `started-date: TODAY`, commit made
- [ ] Complete with note: file gets new `## Resolução` section, commit message includes note
- [ ] Cancel with reason: similar with `## Cancelamento`
- [ ] Mark duplicate: requires picking original; file gets `duplicate_of:` field + body section
- [ ] Plan (re-open): completed_date cleared, status → todo
- [ ] Adding dependency: validates blocker exists in same repo; depends-on array updated; commit
- [ ] Adding comment: appended to ## Comments section in correct order; commit
- [ ] Optimistic UI feels instant; errors rollback gracefully
- [ ] All commits pass repo's pre-commit hooks (validate, lint, etc.)
- [ ] Idempotent: clicking "Complete" twice on already-done is no-op (no spurious commit)

## Edge cases

- **Empty repo at first create**: scaffolds the dir if it doesn't exist
- **Path conflicts**: if a file with the proposed name already exists, append `-N` to slug
- **Branch policy violation**: clear error, no commit, suggest switching branch
- **Hooks fail**: commit fails; manager rollbacks the file write (re-writes previous version);
  user sees error with hook output

## Notes

- This phase concludes with a manager that can fully replace `pnpm roadmap:complete <id>` etc.
  on the simulation-engine side. Run a parallel test: do the same operation via CLI and via UI;
  compare the resulting .md byte-by-byte. They should match.
