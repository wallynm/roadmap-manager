---
id: PHASE-10
title: Pipeline parity — close gaps vs simulation-engine .sh/.mjs CLI
type: spec
description: Implement the batch/hygiene operations the desktop app still lacks compared to simulation-engine's roadmap-archive.sh + 9 .mjs scripts. Validation is per-repo-template (not 6 hardcoded schemas), archive moves shipped items + rewrites cross-refs, dep graph gets static analysis, and queries gain impact/temporal ranking.
status: ✅ shipped
created-date: 2026-04-29
completed-date: 2026-04-29
depends-on: [PHASE-01, PHASE-02, PHASE-03, PHASE-04, PHASE-09]
---

# Phase 10 — Pipeline parity

## Context

`simulation-engine` ships with a CLI pipeline (`scripts/roadmap-archive.sh` +
9 helper `.mjs` scripts, ~3000 lines) that does **batch hygiene** over the repo:
validates frontmatter against multiple schemas, auto-fixes missing fields,
archives shipped items + rewrites cross-references, detects orphan/cycle
dependencies, ranks items by unblock-impact, regenerates `INDEX.md` per
subdirectory, and counts pending checkboxes inside scenario `ROADMAP.md`s.

The desktop app today covers the **per-item lifecycle** (CRUD, kanban, watcher,
agent, auto-commit, dep graph **visualisation**) but not the batch operations.
A user who relies on the manager still has to drop into the terminal to run
`pnpm roadmap:validate`, `pnpm roadmap:archive`, `pnpm roadmap:fix`,
`pnpm roadmap:next --impact`, etc.

This phase closes that gap **without diluting the manager's design**:

- Validation is **per-template** (each repo declares `RepoConfig.templates`
  with `required_fields` + `defaults`). No hardcoded "Schema A/B/C/D/E/F" list
  copied from the `.sh`. Adding a template to a repo is enough to teach the
  manager what valid means there.
- Archive is opt-in, transactional, and emits a single auto-commit per move.
- Static analysis (orphan/cycle/self-ref) reuses the dep graph already built
  for `DepGraph.tsx`.
- Impact ranking + temporal filters are computed in Rust and exposed via the
  same `useItems` query, so the existing filter UI extends naturally.

## Goal

After this phase, **`pnpm roadmap:*` from the simulation-engine pipeline can be
retired** and replaced by:

- IPC commands callable from the manager UI (validate, fix, archive, reindex,
  rank).
- Tauri menu items / command palette entries triggering those commands on the
  active repo.
- Optional headless mode (`roadmap-manager validate --repo <path>`) for CI
  pre-commit hooks.

Per-template means a repo with `improvement / bug / refactoring / feature`
templates gets exactly those validated; a repo with one custom `task` template
gets only that one. The manager never asserts global rules.

## Fix list — prioritized

### F1 — Per-template frontmatter validation

**Estimated**: 6h
**Severity**: 🔴 Critical
**Replaces**: `scripts/roadmap-archive.sh --validate`
**Files**: new `src-tauri/src/validator/mod.rs`; new `ipc/validate.rs`;
new `src/components/validation/ValidationPanel.tsx`; extend `parser/mod.rs`
with field-presence checks.

Scan every `.md` file matching any registered `TemplateConfig.dir` glob.
For each match, parse frontmatter and check that every entry in the template's
`required_fields` is present and non-empty. Report failures as
`ValidationIssue { file, template, missing: Vec<String>, extra: Vec<String> }`.

Behaviour mirrors the `.sh`'s `check_yaml`/`check_blockquote` pair, but the
schema comes from the repo config — no hardcoded list. A repo whose template
declares `required_fields: ["id", "title", "type", "status"]` validates
exactly those four; nothing else is enforced.

**API**:

```rust
#[tauri::command]
pub async fn validate_repo(
    pool: State<'_, SqlitePool>,
    repo_id: String,
) -> Result<ValidationReport, String>;

pub struct ValidationReport {
    pub checked: u32,
    pub passing: u32,
    pub failing: u32,
    pub issues: Vec<ValidationIssue>,
}
```

**Acceptance**:

- [ ] Validate command available in command palette (`Validate repo`).
- [ ] Issues listed in a panel with file path + missing fields per row.
- [ ] Click a row → opens the file in the editor at the frontmatter block.
- [ ] Repo with all valid items reports `✅ All files conform to their template.`
- [ ] No file outside a registered `TemplateConfig.dir` is checked.

---

### F2 — Auto-fix per-template

**Estimated**: 4h
**Severity**: 🔴 Critical
**Replaces**: `scripts/fix-frontmatter.mjs` (668 lines)
**Files**: new `src-tauri/src/validator/fix.rs`; extend `ipc/validate.rs` with
`fix_repo` command.

For each `ValidationIssue`:

1. Backfill missing `required_fields` using the template's `defaults`.
2. Derive `created-date` from `git log --diff-filter=A -- <file>` (first
   commit) when missing. Use `git2` (already a dep).
3. Derive `completed-date` from the latest commit touching the file when
   `status` is a terminal state (`done`, `canceled`, `duplicate`) and the
   field is missing.
4. Convert legacy inline-list metadata (`> **Type:** spec`) into YAML
   frontmatter when the template requires YAML and the file uses blockquote
   form. (Only when the repo's template explicitly opts in via a new
   `migrateFrom: ["blockquote"]` flag — silent rewriting otherwise is
   too risky.)

All writes go through the existing `writer::write_atomic` and trigger one
auto-commit per fix batch (`chore(roadmap): backfill frontmatter for N files`).

**Acceptance**:

- [ ] Validation panel has a "Fix all" button + per-row "Fix this".
- [ ] Auto-fix never overrides a present field (idempotent on already-valid
      files).
- [ ] Single batch commit; not one per file.
- [ ] Watcher's hash-match logic suppresses the kanban refresh storm.

---

### F3 — Archive shipped items + rewrite cross-refs

**Estimated**: 4h
**Severity**: 🔴 Critical
**Replaces**: `scripts/roadmap-archive.sh` (default mode)
**Files**: new `src-tauri/src/archive/mod.rs`; new `ipc/archive.rs`;
extend `roadmap.rs::regenerate` to skip archived files.

Detect items with `status` in the template's terminal-states set whose file
is **not** under `_archive/`. For each:

1. Compute target path: `<template.dir>/_archive/<basename>`.
2. `git mv` the file (preserves history).
3. Walk every `.md` in the repo (excluding `_legacy/`, `_archive/`,
   `node_modules/`, `target/`, `pkg/`) and rewrite occurrences of the old
   path to the new path. Use a Rust-native string replace (no shelling out
   to `sed`).
4. Single auto-commit per archive batch:
   `chore(roadmap): archive N shipped items + update cross-refs`.

Terminal states are template-driven: a template can declare
`terminalStates: ["done", "canceled"]`. If absent, fall back to `["done"]`.

**Acceptance**:

- [ ] Command palette: `Archive shipped items`.
- [ ] Dry-run mode: panel shows "would move N files, would update M refs"
      before the user confirms.
- [ ] After confirm: files moved, all internal links updated, single commit
      created.
- [ ] Items in archived files still appear in the manager (status = done) —
      archiving is a filesystem layout choice, not a deletion.

---

### F4 — Dep graph static analysis (orphan / cycle / self-ref)

**Estimated**: 2h
**Severity**: 🟡 Important
**Replaces**: `scripts/roadmap-deps-check.mjs`
**Files**: extend `src-tauri/src/db/items.rs` (already builds adjacency for
`DepGraph.tsx`); new `validator::deps_check`.

Run three passes over the dep graph:

- **Orphan**: `depends-on: [X]` where item `X` does not exist in the repo.
- **Self-ref**: item depends on itself.
- **Cycle**: any directed cycle (Tarjan SCC over `depends-on` edges).

Surface results in the same validation panel from F1, alongside frontmatter
issues. Cycles render the cycle path (`A → B → C → A`).

**Acceptance**:

- [ ] Validation panel section "Dep graph" shows count of each issue type.
- [ ] Orphan rows: clicking offers "Remove dep" or "Create the missing item".
- [ ] Cycle rows: clicking opens `DepGraph.tsx` filtered to the cycle nodes.

---

### F5 — Impact ranking + temporal queries

**Estimated**: 3h
**Severity**: 🟡 Important
**Replaces**: `scripts/roadmap-next.mjs --impact / --since / --stale`
**Files**: extend `db/items.rs::list` with `OrderBy::Impact` and `since`/
`stale_days` filters; extend `useItems.ts` and `FilterPanel.tsx`.

`OrderBy::Impact` sorts items by transitive unblock count — BFS over the
**reverse** `depends-on` graph; an item that, once done, would unblock 12
others ranks above one that unblocks 0. Tie-break by `created-date` asc.

Filters:

- `since: <YYYY-MM-DD>` — `created-date >= since`.
- `stale_days: u32` — items in `in_progress` whose `started-date` is older
  than N days.

UI: filter panel grows two fields ("Created since", "Stale longer than");
sort dropdown grows "Impact (most unblocking first)".

**Acceptance**:

- [ ] Sort by impact: top item annotated with `[unblocks N]` badge in list
      view.
- [ ] `Stale longer than 7d` filter surfaces in-progress items idle for ≥7d.
- [ ] Filters persist per-repo via `usePrefs`.

---

### F6 — Reindex `INDEX.md` per template subdirectory

**Estimated**: 2h
**Severity**: 🟡 Important
**Replaces**: `scripts/roadmap-reindex.mjs`
**Files**: extend `roadmap.rs` with `regenerate_indexes`; trigger on every
status change + on archive.

For each `TemplateConfig.dir`, generate an `INDEX.md` listing items grouped
by status with one row per item: `- [ID] Title — status — priority`. Items
under `_archive/` are listed in a separate "Shipped" section at the bottom.

Existing `INDEX.md` is overwritten only if its content actually changed
(hash-compare) to avoid noise commits.

**Acceptance**:

- [ ] Status change → relevant `INDEX.md` is updated atomically before the
      auto-commit.
- [ ] Single auto-commit covers item + index together.
- [ ] Repos that don't want indexes can opt out via
      `template.generateIndex: false`.

---

### F7 — Roadmap body parsing (checkbox count)

**Estimated**: 2h
**Severity**: 🟢 Nice-to-have
**Replaces**: `roadmap-archive.sh --status` checkbox-count section
**Files**: new `parser/checkboxes.rs`; extend `roadmap.rs::regenerate`.

Parse `ROADMAP.md` body looking for `- [ ]` / `- [x]` patterns. Persist a
`Repo.pending_checkboxes` and `Repo.completed_checkboxes` counter
(serialized into `repos.config` JSON, not a new column — no migration
required). Surface in the sidebar repo list as a small badge.

**Acceptance**:

- [ ] Repo sidebar shows `📝 N` next to each repo with pending checkboxes.
- [ ] Hover tooltip lists the first 5 unchecked items with their headings.

---

### F8 — Nested scenario status (emoji heuristic)

**Estimated**: 1h
**Severity**: 🟢 Nice-to-have
**Replaces**: `roadmap-archive.sh --status` scenarios section
**Files**: extend `parser/checkboxes.rs` with emoji classification.

Some repos (simulation-engine specifically) keep secondary roadmaps under
`apps/*/docs/ROADMAP.md`. Classify each by counting 📋 / 🔄 / ✅ in the body.
Surface as a "Sub-roadmaps" section in the repo sidebar.

Opt-in via `RepoConfig.subRoadmapGlobs: ["apps/*/docs/ROADMAP.md"]`. Default
empty — repos without that pattern see nothing.

**Acceptance**:

- [ ] simulation-engine repo: sidebar shows "Sub-roadmaps: 11" (one per app)
      with per-scenario status counts.
- [ ] Repos without the glob configured: no sub-roadmap UI rendered.

---

## Out of scope

- **Multi-repo aggregations** — ADR-005 stands; no cross-repo dep graph,
  no cross-repo "next work" view.
- **`roadmap-block` / `roadmap-plan` parity** — the manager already lets you
  edit `depends-on` directly via the item editor and toggle status back to
  planned via the kanban; no new commands needed.
- **`roadmap-status:write` mode** — the equivalent ROADMAP.md regeneration
  is already done by `roadmap.rs::regenerate` on every mutation.

## Risks

- **Auto-fix overwrites user intent**: F2 must be strictly idempotent and
  never modify a field that's already present, even if it doesn't match the
  default. Test coverage required for every case.
- **Archive cross-ref rewrite breaks links inside code**: F3 only walks `.md`
  files, never source code. If a `.rs` or `.ts` file embeds a doc URL, it
  stays untouched (and may break — accept this).
- **Template config drift**: the per-template approach means a repo with a
  misconfigured template "validates" as passing. F1 should warn when a repo
  has `.md` files outside any registered `template.dir` ("found N orphan
  files in `docs/`").

## Total estimated

~24h focused work (3 days). F1+F2+F3 alone (~14h) cover the most-used
operations.
