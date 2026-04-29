---
id: PHASE-05
title: Agent SDK — create item iteratively
type: spec
description: Integrate Claude Agent SDK as Node sidecar. Create-trigger only: iterative conversation with tools (read_repo_files, list_existing_items, run_git_log), streaming, sound notifications.
status: ❌ stub-only
created-date: 2026-04-29
depends-on: [PHASE-04]
gaps: "F2 (sidecar nunca spawnado), F3 (agent_respond ausente), F4 (UI ausente) — ver phase-09"
---

# Phase 05 — Agent SDK: create

## Goal

When user clicks "+ New" with "Use agent" toggle on, manager spawns Node sidecar with
Claude Agent SDK. Agent does iterative conversation, calls tools, asks clarifying questions,
proposes final .md content. User reviews → save → manager writes file + commit.

This is where the "validation cruzada" use case from ROADMAP.md fully closes.

## Tasks

### 1. Sidecar package

- [ ] Create `sidecar/` dir at project root:
  ```
  sidecar/
  ├── package.json
  ├── tsconfig.json
  ├── agent.mjs        # entrypoint
  ├── ipc.mjs          # stdio JSON protocol
  ├── tools.mjs        # tool definitions (delegate to Rust via IPC)
  ├── prompts/
  │   └── create.mjs   # system prompt for create trigger
  └── README.md
  ```
- [ ] `pnpm add @anthropic-ai/claude-agent-sdk @anthropic-ai/sdk zod`
- [ ] tsconfig: target node20, esnext modules, strict
- [ ] Build script: copy `agent.mjs` (no transpile needed if pure ESM)

### 2. IPC protocol

- [ ] In `sidecar/ipc.mjs`:
  ```js
  // Read line-delimited JSON from stdin
  export async function* readMessages() {
    let buffer = ''
    for await (const chunk of process.stdin) {
      buffer += chunk
      let idx
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (line) yield JSON.parse(line)
      }
    }
  }

  export function send(msg) {
    process.stdout.write(JSON.stringify(msg) + '\n')
  }
  ```
- [ ] Mirror in Rust: `src-tauri/src/agent/ipc.rs` reads/writes line-delimited JSON.

### 3. Agent entrypoint

- [ ] `sidecar/agent.mjs`:
  ```js
  import { query } from '@anthropic-ai/claude-agent-sdk'
  import { readMessages, send } from './ipc.mjs'
  import { tools } from './tools.mjs'
  import { systemPrompt } from './prompts/create.mjs'

  const init = await readFirstMessage()  // { kind: 'init', trigger, repoId, model, context }
  if (init.kind !== 'init' || init.trigger !== 'create') {
    send({ kind: 'error', message: 'unsupported trigger' })
    process.exit(1)
  }

  const result = await query({
    prompt: buildInitialPrompt(init.context),
    options: {
      systemPrompt: systemPrompt(init.context),
      model: init.model,
      tools: tools(init.context),  // tools that delegate to Rust IPC
      onAssistantDelta: (text) => send({ kind: 'delta', text }),
      onToolCall: async (call) => {
        send({ kind: 'tool_call', id: call.id, name: call.name, args: call.args })
        const reply = await waitForToolResult(call.id)
        return reply
      },
    },
  })

  send({ kind: 'finished', result, model: init.model, /* token counts */ })
  ```

### 4. Tools (Rust-backed)

- [ ] Sidecar declares tool schemas in `sidecar/tools.mjs`. Each tool:
  - Has Zod schema for args (input validation)
  - On invocation, sends `{ kind: 'tool_call', id, name, args }` to Rust
  - Awaits `{ kind: 'tool_result', id, result }` reply
- [ ] Rust implementation:
  - `read_repo_files`: walkdir scoped to repo, glob match, return file contents
    (cap maxFiles=10, maxBytes=100000 per file)
  - `list_existing_items`: SELECT from items WHERE repo_id, optional filters
  - `run_git_log`: `git2::Revwalk` scoped to path, limit, since
  - `read_item`: SELECT items + comments by external_id
  - `propose_item`: special — Rust receives the proposal, sends to UI for approval, returns `{ ok: true }` or `{ ok: false, error }` after user action
  - `ask_user`: special — sends `{ kind: 'question', text }` to Rust, blocks until reply

### 5. Agent runs database

- [ ] Rust `src-tauri/src/agent/runs.rs`:
  - `pub async fn create_run(pool, repo_id, trigger, model, prompt) -> Uuid`
  - `pub async fn append_transcript(pool, run_id, message)` — accumulates JSON messages
  - `pub async fn finalize(pool, run_id, status, output, cost) -> ()`
- [ ] All writes update `agent_runs` table per [DATA_MODEL.md](../architecture/DATA_MODEL.md)

### 6. Agent pool (Rust)

- [ ] `src-tauri/src/agent/pool.rs`:
  - `pub struct AgentPool { active: HashMap<Uuid, AgentHandle> }`
  - `pub async fn spawn(run_id, init_msg, app_handle) -> Result<AgentHandle>`
    - Spawns `node sidecar/agent.mjs` via `tokio::process::Command`
    - Pipes stdin/stdout
    - Sends init message to stdin
    - Spawns task to read sidecar stdout → forward to Rust handlers
  - `pub async fn cancel(run_id) -> Result<()>` — kills the process
  - `pub async fn send_to_agent(run_id, msg)` — writes to stdin (user_response, tool_result)
- [ ] Concurrency limit: max 1 active agent run by default (configurable to 3 in settings)
- [ ] Queue excess requests with toast "agent busy"

### 7. Tauri commands for agent

- [ ] `src-tauri/src/ipc/agent.rs`:
  - `agent_invoke({ trigger, repoId, type, title, description? }) -> { runId }`
    - INSERT agent_run with status='running'
    - Resolve API key (env, ~/.claude, app settings)
    - Spawn sidecar with init message
    - Return runId immediately
  - `agent_respond({ runId, message })` — forwards to sidecar (user response to question)
  - `agent_cancel({ runId })` — kills sidecar, marks run as cancelled
  - `agent_get_run({ runId }) -> AgentRun` — get current state

### 8. Tool result routing

- [ ] When sidecar emits `{ kind: 'tool_call', id, name, args }`:
  - Rust executes the tool against repo/DB
  - Sends back `{ kind: 'tool_result', id, result }` via stdin
- [ ] Tool execution timeout: 30s per call (cancels if exceeded)

### 9. Streaming UI

- [ ] `src/components/modals/AgentRunModal.tsx`:
  - Header: "New {type} for {repo}" + initial title
  - Conversation log: messages from agent (deltas concatenated), tool calls (icon + summary), questions
  - Input box appears when `kind: 'question'` received → user types → `agent_respond`
  - "Cancel" button always available
  - "Save" button enabled when `finished` event received with proposed content
- [ ] Listens to Tauri events:
  - `agent:delta` → append to current assistant message
  - `agent:tool_call` → show "🔧 read_repo_files [pattern=Tooltip*]" (collapsible)
  - `agent:question` → show input box
  - `agent:finished` → show preview of proposed .md, enable "Save" button
  - `agent:error` → show error, disable inputs

### 10. Save flow after agent finish

- [ ] When user clicks "Save & commit" on preview:
  - Calls `create_item` with the proposed frontmatter + body
  - Phase 03 mutation flow takes over: write file + commit + emit events
  - Modal closes
  - Sound: `Glass.aiff` plays
  - Toast: "✅ IMP-32 created"
- [ ] If user clicks "Edit before save":
  - Preview becomes editable form
  - User can adjust before final save

### 11. Sounds

- [ ] `src-tauri/src/sounds/mod.rs`:
  - `pub fn play(kind: SoundKind) -> ()` — uses `afplay` shell command on macOS
  - Or Tauri's notification API with `sound` field
- [ ] Triggers:
  - `agent_invoke` → `Tink.aiff` (start)
  - `agent:finished` → `Glass.aiff` (success)
  - `agent:error` → `Funk.aiff` (failure)

### 12. API key resolution

- [ ] Order:
  1. `ANTHROPIC_API_KEY` env var
  2. Read from `~/.claude/auth.json` (Claude Code config)
  3. App settings (encrypted via Tauri secure storage)
- [ ] Settings → API Key panel:
  - Shows current source
  - "Test" button verifies key with cheap API call
  - Override field

## Files to create / modify

### New

```
sidecar/
├── package.json
├── tsconfig.json
├── agent.mjs
├── ipc.mjs
├── tools.mjs
└── prompts/
    └── create.mjs

src-tauri/src/
├── agent/
│   ├── mod.rs
│   ├── pool.rs
│   ├── ipc.rs
│   ├── tools.rs       # tool implementations
│   └── runs.rs
├── sounds/
│   └── mod.rs
└── ipc/agent.rs

src/components/
├── modals/AgentRunModal.tsx
├── agent/
│   ├── ConversationView.tsx
│   ├── ToolCallEntry.tsx
│   └── QuestionInput.tsx
└── settings/ApiKeyPanel.tsx

src/hooks/useAgentRun.ts
src/lib/sounds.ts
```

### Modified

```
src/components/modals/NewItemModal.tsx  # add "Use agent" toggle, integrates AgentRunModal
```

## Acceptance criteria

- [ ] User clicks "+ New" with "Use agent" → modal opens
- [ ] Sidecar spawns within 2s, status "Running..."
- [ ] Agent calls `list_existing_items` and `read_repo_files` (visible in conversation log)
- [ ] Agent asks max 2 clarifying questions (visible as input boxes)
- [ ] User responds; conversation continues
- [ ] Agent calls `propose_item`; preview shown
- [ ] "Save" → file written + commit + sound
- [ ] Cancel button mid-run kills sidecar, marks run as cancelled
- [ ] API errors (rate limit, network) show clear error in UI
- [ ] Agent run history persists in DB; viewable in Settings → Cost

## Validation use case

End-to-end test (manual):

1. Add `simulation-engine` repo
2. Click "+ New" → choose `civ-web` + `bug` + title "tooltip aparece com menu aberto"
3. Toggle "Use agent" on
4. Submit
5. Watch streaming: should see `read_repo_files`, maybe `list_existing_items`, possibly 1 question
6. Answer question (e.g., "só city panel")
7. See proposed bug-NN-tooltip-with-menu-open.md preview
8. Save → file written at correct path, auto-commit message includes "via agent"
9. Sound plays
10. Card appears in Todo column

## Notes

- Agent SDK em rápida evolução — abstrair via thin wrapper for futureproof
- Cost tracking: log to console + DB. UI shows monthly total.
- Logs em `~/Library/Logs/com.journeystudios.roadmap-manager/agent-{runId}.log`
- Privacy reminder: tool results sent to Anthropic API. Document in Settings → Privacy.
