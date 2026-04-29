---
id: PHASE-06
title: Agent — complete (auto-note), triage, weekly digest
type: spec
description: Add three more agent triggers — generating resolution notes from git diff, batch triage of stale items, weekly digest narratives.
status: ❌ stub-only
created-date: 2026-04-29
depends-on: [PHASE-05]
gaps: "Bloqueado por F2 (sidecar não spawna). Sidecar code para complete/triage/digest está pronto mas inalcançável — ver phase-09"
---

# Phase 06 — Agent: complete / triage / digest

## Goal

Estender o agente pra três casos one-shot que reusam toda a infra do Phase 05:

1. **Complete with auto-note**: ao clicar "Complete", agente lê `git log` desde `started_date`,
   gera 1-3 sentence resolution summary, user revisa.
2. **Triage stale**: ao abrir painel "Stale items", agente revisa items pendentes por muito
   tempo e sugere `cancel | refresh | merge_into <ID>` por item.
3. **Weekly digest**: gera changelog narrativo dos items completados na semana.

## Tasks

### 1. Complete trigger

- [ ] Add to `sidecar/prompts/`:
  - `complete.mjs` — system prompt for resolution note
- [ ] Sidecar dispatches by `init.trigger`:
  ```js
  switch (init.trigger) {
    case 'create':   return runCreate(init)
    case 'complete': return runComplete(init)
    case 'triage':   return runTriage(init)
    case 'digest':   return runDigest(init)
  }
  ```
- [ ] `runComplete(init)`:
  - Init context: `{ itemId, repoPath }`
  - Tools available: `read_item`, `run_git_log`, `propose_note`
  - Prompt: read full body, fetch git log of `<repo>/<file_path>` since `started_date`
  - Output: 1-3 sentence note via `propose_note({ note })`
  - **No questions** — one-shot generation. If unclear, agent generates best-effort note.
- [ ] UI: "Complete" button has dropdown:
  - "Complete with note..." → manual note dialog (Phase 03)
  - "Complete with agent note" → triggers agent, shows preview, user accepts or edits
  - "Complete (no note)"
- [ ] Toast: "Generating note..." → "Note ready, review?"
- [ ] Sound: same as Phase 05 (Tink/Glass/Funk)

### 2. Triage trigger

- [ ] `triage.mjs` system prompt
- [ ] `runTriage(init)`:
  - Init context: `{ repoId, staleItems: [{ id, title, age_days, status, body_excerpt }] }`
  - Tools: `read_item`, `list_existing_items` (to find dup candidates)
  - Output: `propose_triage({ suggestions: [{ itemId, action, reason, mergeIntoId? }] })`
  - For each stale item, agent picks one of:
    - `cancel` (with reason) — irrelevant or already implicitly resolved
    - `refresh` (with reason) — still relevant, flag for re-prioritization
    - `merge_into <ID>` — duplicate of another existing item
- [ ] UI: Settings → Stale items → "Run triage" button
  - Or: when `--stale` filter shows items, button "Triage with agent"
  - Shows table with current vs proposed action per item
  - User accepts all, accepts individually, or rejects
  - Apply: dispatches mutations per accepted suggestion
- [ ] Cost: triage of 10 items = ~1 API call (batch in single agent run)

### 3. Digest trigger

- [ ] `digest.mjs` system prompt
- [ ] `runDigest(init)`:
  - Init context: `{ repoId, since: 'YYYY-MM-DD' }`
  - Tools: `list_existing_items` (status=done, completed_date>=since), `read_item`, `run_git_log`
  - Output: `propose_digest({ markdown })` — narrative ready to paste into release notes
  - Style: group by theme (not date), terse, factual
- [ ] UI: Settings → Digest → "Generate weekly digest" button
  - Or sidebar: "Generate digest" command in command palette
  - Output shown in modal with copy button + "Save as .md" option
- [ ] Default `since`: Monday of current week
- [ ] Optional: schedule weekly digest auto-generation (notification, not auto-published)

### 4. Mutation: agent triage applies suggestions

- [ ] Add `apply_triage_suggestions` Tauri command:
  - Input: `Vec<{ itemId, action, reason, mergeIntoId? }>`
  - For each:
    - `cancel`: call `cancel_item(id, reason)`
    - `refresh`: just emit a notification "Refresh: {id} — {reason}"; doesn't auto-mutate (user decides priority)
    - `merge_into`: call `mark_duplicate(id, mergeIntoId)`
  - Returns count of applied per type

### 5. Cost optimization

- [ ] Default model for `triage` and `digest`: Sonnet (cheap enough)
- [ ] Default model for `complete`: Sonnet (faster)
- [ ] Settings toggle "Use Opus for create" (and per-trigger if needed)
- [ ] Show cost estimate before run (rough): "~$0.02 estimated"
- [ ] After run, show actual cost: "$0.018 actual"

## Files to create / modify

### New

```
sidecar/prompts/
├── complete.mjs
├── triage.mjs
└── digest.mjs

src/components/
├── agent/
│   ├── TriagePanel.tsx
│   └── DigestModal.tsx
└── modals/
    └── ResolutionPreviewDialog.tsx

src-tauri/src/ipc/
└── triage.rs       # apply_triage_suggestions command
```

### Modified

```
sidecar/agent.mjs                    # dispatch by trigger
src-tauri/src/agent/tools.rs         # add propose_note, propose_triage, propose_digest tools
src/components/modals/CompleteItemDialog.tsx  # add "Use agent" option
src/components/inbox/InboxPanel.tsx  # show "stale items detected" notifications
```

## Acceptance criteria

- [ ] Click "Complete with agent note" → sidecar runs → preview note → save → file gets `## Resolução` with that note
- [ ] Stale items list visible (uses Phase 02's `--stale` filter)
- [ ] "Triage with agent" → table of suggestions appears
- [ ] Accept all → mutations applied (cancellations, duplicates marked)
- [ ] "Generate weekly digest" → markdown narrative generated, copyable
- [ ] All three triggers reuse same sidecar process (just different system prompt)
- [ ] Cost tracked correctly per trigger type

## Edge cases

- **Empty stale list** triage: agent run skipped, UI shows "Nothing stale 🎉"
- **No completed items in week** digest: "No items completed since Monday"
- **Item has no `started_date`** complete: agent uses `created_date` as fallback for git log range
- **Network down**: agent error path same as Phase 05; manual "Complete with note" still works

## Notes

- This phase doesn't add new IPC primitives; only new prompts + UI entry points.
- Triage is a great first showcase for agent value — it's the operation most painful to do manually.
- Digest can become a Slack/Discord webhook target in a future phase if needed.
