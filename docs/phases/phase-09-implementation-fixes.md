---
id: PHASE-09
title: Implementation fixes — close gaps from 2026-04-29 validation
type: spec
description: Wire watcher to repo lifecycle, spawn agent sidecar with stdio IPC, add agent_respond command, build agent UI modal, escape YAML, propagate auto-commit errors, granular watcher events.
status: ✅ shipped
created-date: 2026-04-29
completed-date: 2026-04-29
depends-on: [PHASE-01, PHASE-02, PHASE-03, PHASE-04, PHASE-05]
---

# Phase 09 — Implementation fixes

## Context

A implementação Cursor das phases 01-08 deixou gaps críticos identificados na
[validation report 2026-04-29](../validation/2026-04-29-validation-report.md).
Phases 01-02 fecham; 03-04 são parciais; 05-06 são stub-only (sidecar code existe
mas nunca é spawnado). Esta phase fecha esses gaps **sem refazer trabalho** das
outras.

## Goal

Após esta phase, o caso de uso "validation cruzada" da `ROADMAP.md` (criar bug
via agente, ele lê código, pergunta, gera, salva, commita, watcher detecta, kanban
mostra) precisa funcionar end-to-end.

## Fix list — priorized

### F1 — Wire watcher to repo lifecycle (Finding #1)

**Estimated**: 30min
**Severity**: 🔴 Critical
**Files**: `src-tauri/src/ipc/repos.rs`

`WatcherPool::add_repo()` existe mas nunca é chamado quando user adiciona um repo.
Sem isso, file watcher não roda — Phase 04 inteira é no-op.

**Fix**:

Em `add_repo` (após scanner concluir):

```rust
// after scanner completes successfully
let watcher: State<WatcherPool> = handle.state();
watcher
    .add_repo(&repo, pool.inner().clone(), handle.clone())
    .await
    .map_err(|e| format!("watcher attach failed: {}", e))?;
```

Em `remove_repo`:

```rust
let watcher: State<WatcherPool> = handle.state();
watcher.remove_repo(&id).await;
// then proceed with DB cascade delete
```

Também, na startup (`lib.rs::run` ou setup hook):

```rust
// after open_pool, attach watcher to all existing repos
let repos = db::repos::list(&pool).await?;
for repo in repos {
    let _ = watcher_pool.add_repo(&repo, pool.clone(), handle.clone()).await;
}
```

**Acceptance**:
- [ ] Add repo no UI → editar `.md` no Cursor → kanban refresca em <1s
- [ ] Remove repo → watcher para
- [ ] Reabrir o app → repos cadastrados continuam sendo watched

---

### F2 — Spawn sidecar de agente com stdio IPC (Finding #2)

**Estimated**: 3-4h
**Severity**: 🔴 Critical
**Files**: `src-tauri/src/agent/pool.rs`, `src-tauri/src/ipc/agent.rs`

`agent_invoke` apenas insere na tabela. Não spawna o sidecar. Precisamos
implementar full pipeline conforme `AGENT_INTEGRATION.md § Architecture — sidecar process`.

**Fix**: refatorar `agent/pool.rs` (~150 linhas):

```rust
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;

use serde_json::Value;
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{mpsc, Mutex};

pub struct AgentHandle {
    pub run_id: String,
    pub stdin: Arc<Mutex<ChildStdin>>,
    pub child: Arc<Mutex<Child>>,
}

pub struct AgentPool {
    active: Arc<Mutex<HashMap<String, AgentHandle>>>,
    sidecar_path: PathBuf,
    max_concurrent: usize,
}

impl AgentPool {
    pub fn new(sidecar_path: PathBuf, max_concurrent: usize) -> Self { ... }

    pub async fn spawn(
        &self,
        run_id: String,
        init_msg: Value,
        pool: SqlitePool,
        app: AppHandle,
    ) -> Result<(), String> {
        // 1. Cap check
        {
            let active = self.active.lock().await;
            if active.len() >= self.max_concurrent {
                return Err("Agent pool at capacity".into());
            }
        }

        // 2. Spawn `node sidecar/agent.mjs`
        let api_key = resolve_api_key()?; // env / ~/.claude / settings
        let mut child = Command::new("node")
            .arg(&self.sidecar_path)
            .env("ANTHROPIC_API_KEY", api_key)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("spawn failed: {}", e))?;

        let stdin = child.stdin.take().ok_or("no stdin")?;
        let stdout = child.stdout.take().ok_or("no stdout")?;
        let stderr = child.stderr.take().ok_or("no stderr")?;

        let stdin = Arc::new(Mutex::new(stdin));

        // 3. Write init message
        {
            let mut w = stdin.lock().await;
            let line = serde_json::to_string(&init_msg).unwrap();
            w.write_all(line.as_bytes()).await.map_err(|e| e.to_string())?;
            w.write_all(b"\n").await.map_err(|e| e.to_string())?;
            w.flush().await.map_err(|e| e.to_string())?;
        }

        // 4. Spawn task to read stdout → emit Tauri events
        let app_clone = app.clone();
        let pool_clone = pool.clone();
        let run_id_clone = run_id.clone();
        let active_clone = self.active.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            let mut transcript: Vec<Value> = Vec::new();

            while let Ok(Some(line)) = lines.next_line().await {
                if line.trim().is_empty() { continue; }
                let msg: Value = match serde_json::from_str(&line) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                let kind = msg.get("kind").and_then(|v| v.as_str()).unwrap_or("");
                transcript.push(msg.clone());

                match kind {
                    "delta" | "tool_call" | "question" => {
                        let _ = app_clone.emit(&format!("agent:{}", kind), msg);
                    }
                    "tool_result" => {
                        // Execute tool against repo + DB, send back via stdin
                        // (handled below in tool_call branch)
                    }
                    "finished" => {
                        update_run_status(
                            &pool_clone,
                            &run_id_clone,
                            "succeeded",
                            msg.get("result"),
                            msg.get("costUsd").and_then(|v| v.as_f64()),
                        ).await;
                        let _ = app_clone.emit("agent:finished", msg);
                        active_clone.lock().await.remove(&run_id_clone);
                        // Play sound
                        crate::sounds::play(crate::sounds::SoundKind::AgentFinished);
                        break;
                    }
                    "error" => {
                        update_run_status(&pool_clone, &run_id_clone, "failed", None, None).await;
                        let _ = app_clone.emit("agent:error", msg);
                        active_clone.lock().await.remove(&run_id_clone);
                        crate::sounds::play(crate::sounds::SoundKind::AgentError);
                        break;
                    }
                    _ => {}
                }
            }

            // Persist full transcript
            let _ = sqlx::query("UPDATE agent_runs SET transcript = ? WHERE id = ?")
                .bind(serde_json::to_string(&transcript).unwrap())
                .bind(&run_id_clone)
                .execute(&pool_clone)
                .await;
        });

        // 5. Spawn stderr reader → log only
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                tracing::warn!(target: "agent.sidecar", "{}", line);
            }
        });

        // 6. Insert handle into active map
        let handle_record = AgentHandle {
            run_id: run_id.clone(),
            stdin: stdin.clone(),
            child: Arc::new(Mutex::new(child)),
        };
        self.active.lock().await.insert(run_id.clone(), handle_record);

        // Play start sound
        crate::sounds::play(crate::sounds::SoundKind::AgentStart);

        Ok(())
    }

    pub async fn send_message(&self, run_id: &str, msg: Value) -> Result<(), String> {
        let active = self.active.lock().await;
        let handle = active.get(run_id).ok_or("run not found")?;
        let mut stdin = handle.stdin.lock().await;
        let line = serde_json::to_string(&msg).map_err(|e| e.to_string())?;
        stdin.write_all(line.as_bytes()).await.map_err(|e| e.to_string())?;
        stdin.write_all(b"\n").await.map_err(|e| e.to_string())?;
        stdin.flush().await.map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn cancel(&self, run_id: &str) -> Result<(), String> {
        let mut active = self.active.lock().await;
        if let Some(handle) = active.remove(run_id) {
            let mut child = handle.child.lock().await;
            let _ = child.kill().await;
        }
        Ok(())
    }

    pub async fn active_count(&self) -> usize {
        self.active.lock().await.len()
    }
}
```

Atualizar `agent_invoke` em `ipc/agent.rs` para chamar `pool.spawn()` após
INSERT na tabela. Tool calls do sidecar devem ser routed via Rust (executar tool,
write `tool_result` back para stdin).

**Acceptance**:
- [ ] `agent_invoke` spawna `node sidecar/agent.mjs` (visível em `ps -ef` durante run)
- [ ] Streaming `delta` events chegam na UI em tempo real
- [ ] `tool_call` events disparam execução em Rust + reply via stdin
- [ ] `finished` event termina run, atualiza DB com cost, dispara som
- [ ] `cancel` mata processo, marca run como cancelled
- [ ] Concurrent runs respeitam `max_concurrent` limit

---

### F3 — Add `agent_respond` Tauri command (Finding #3)

**Estimated**: 30min
**Severity**: 🔴 Critical
**Files**: `src-tauri/src/ipc/agent.rs`, `src-tauri/src/lib.rs`

UI precisa de canal para enviar resposta do user a `ask_user` do agente.

**Fix**: adicionar em `ipc/agent.rs`:

```rust
#[tauri::command]
pub async fn agent_respond(
    pool: State<'_, AgentPool>,
    run_id: String,
    message: String,
) -> Result<(), String> {
    let msg = serde_json::json!({
        "kind": "user_response",
        "text": message,
    });
    pool.send_message(&run_id, msg).await
}
```

Registrar em `lib.rs::invoke_handler!`:
```rust
ipc::agent::agent_respond,
```

**Acceptance**:
- [ ] UI consegue chamar `agent_respond({ runId, message })` quando agente faz `ask_user`
- [ ] Sidecar recebe via stdin e o loop continua

---

### F4 — Build agent UI: NewItemModal toggle + AgentRunModal (Finding #4)

**Estimated**: 2h
**Severity**: 🔴 Critical
**Files**: `src/components/modals/NewItemModal.tsx`,
**Novos**: `src/components/modals/AgentRunModal.tsx`,
`src/components/agent/AgentConversation.tsx`,
`src/components/agent/AgentQuestionInput.tsx`,
`src/hooks/useAgentRun.ts`

**Fix**:

NewItemModal ganha toggle "Use agent":

```tsx
const [useAgent, setUseAgent] = useState(false)

// In handleSubmit:
if (useAgent) {
  const runId = await invoke<string>('agent_invoke', {
    trigger: 'create',
    repoId, itemType, title, description: body
  })
  setActiveRunId(runId)
  // Modal switches to AgentRunModal view
} else {
  // existing createItem.mutate flow
}
```

`AgentRunModal.tsx`: subscribes a `agent:delta`, `agent:tool_call`, `agent:question`,
`agent:finished` events via Tauri `listen`. Renders conversation as list:
- delta → assistant message bubble (streaming)
- tool_call → 🔧 collapsed entry with tool name + args
- question → input box that calls `agent_respond`
- finished → preview com `{frontmatter, body}` + botões "Save & commit" / "Edit before save" / "Cancel"

`useAgentRun(runId)` hook encapsula listeners + state machine.

**Acceptance**:
- [ ] Click "+ New" + toggle "Use agent" + submit → AgentRunModal abre
- [ ] Streaming visible em tempo real
- [ ] Question prompt aparece, user responde, conversa continua
- [ ] Preview aparece quando agente termina
- [ ] "Save" cria item via `create_item` (reusa Phase 03 flow)
- [ ] "Cancel" mata run via `agent_cancel`

---

### F5 — YAML escape no writer (Finding #5)

**Estimated**: 30min
**Severity**: 🟡 Important
**Files**: `src-tauri/src/writer/mod.rs`

Title contendo `:`, `[`, `{`, `>`, `|`, `"` quebra YAML round-trip. Portar
`yaml_value()` do `fix-frontmatter.mjs`.

**Fix**: adicionar helper em `writer/mod.rs`:

```rust
fn yaml_value(v: &str) -> String {
    if v.is_empty() {
        return v.to_string();
    }
    // Quote if contains chars that need it
    let needs_quote = v.contains(": ")
        || v.starts_with(|c: char| matches!(c, '[' | '{' | '>' | '|' | '!' | '&' | '*' | '\''))
        || v.contains('"')
        || v.contains('\\');
    if needs_quote {
        let escaped = v.replace('\\', "\\\\").replace('"', "\\\"");
        format!("\"{}\"", escaped)
    } else {
        v.to_string()
    }
}
```

Aplicar em `render()`:
```rust
fm_lines.push(format!("{}: {}", field, yaml_value(&v)));
```

**Não** aplicar em `[]` arrays (`labels`, `depends-on`) — esses já são literal.

**Acceptance**:
- [ ] Item com title `Foo: bar [BUG]` round-trips parse → write → parse OK
- [ ] Comparar bytes: `parse(content) → render → parse → render` produz mesmos bytes (idempotência)
- [ ] Adicionar test em `parser/mod.rs` (ou criar `writer/tests.rs`):
  ```rust
  #[test]
  fn yaml_escape_roundtrip() {
      let item = Item { title: "Foo: bar [crash]".into(), ... };
      let rendered = render(&item, &template);
      let parsed = parse(&rendered).unwrap();
      assert_eq!(parsed.yaml.get("title").and_then(|v| v.as_str()), Some("Foo: bar [crash]"));
  }
  ```

---

### F6 — Propagar erros de auto-commit (Finding #6)

**Estimated**: 15min
**Severity**: 🟡 Important
**Files**: `src-tauri/src/ipc/items.rs` (várias linhas)

Linhas como `let _ = vcs::auto_commit(...)` engolem erros silenciosamente. Trocar
por propagação.

**Fix**: substituir todas as ocorrências de `let _ = vcs::auto_commit(...)` por:

```rust
vcs::auto_commit(&repo, &abs_path, &updated, "resolvido", note.as_deref())
    .map_err(|e| format!("auto-commit failed: {}", e))?;
```

Linhas afetadas (a partir do grep):
- `complete_item:241`
- `cancel_item:292`
- `mark_duplicate:?`
- `start_item:?`
- `update_item:?`
- `plan_item:?`
- `create_item:?` (após write atomic)
- `add_dependency:?`
- `remove_dependency:?`
- `add_comment:?`

**Considerar**: ao propagar, o write do .md já aconteceu mas o commit falhou.
Estado fica: arquivo escrito, DB atualizado, sem commit. Para idempotência:

Opção (a) — aceitar esse estado: user vê toast vermelho com causa, commita manualmente.
Opção (b) — rollback: se commit falha, restaurar arquivo original via git checkout.

Recomendação: opção (a). Mais simples, e user normalmente quer ver o que aconteceu.
Toast deve sugerir "Commit manualmente or undo via git checkout HEAD <file>".

**Acceptance**:
- [ ] Forçar branch policy violation → toast vermelho com causa em vez de silent success
- [ ] Forçar pre-commit hook fail → toast com hook output
- [ ] DB e arquivo refletem mudança mesmo quando commit falha (eventual user resolve)

---

### F7 — Granular watcher events (Finding #7)

**Estimated**: 30min
**Severity**: 🟡 Important
**Files**: `src-tauri/src/watcher/mod.rs`, `src-tauri/src/sync/mod.rs`,
**Frontend**: hooks que escutam `items:refresh`

Watcher só emite `items:refresh` (genérico). Spec define eventos específicos:
`item:created`, `item:updated`, `item:deleted`, `item:external_edit`.

**Fix**: em `watcher/mod.rs`, capturar `ReconcileOutcome` e emitir:

```rust
match crate::sync::handle_fs_event(&pool, &rid, &rpath, path, &event.kind).await {
    Ok(crate::sync::ReconcileOutcome::Created(id)) => {
        if let Ok(Some(item)) = crate::db::items::get(&pool, &id).await {
            let _ = app.emit("item:created", &item);
        }
    }
    Ok(crate::sync::ReconcileOutcome::Updated(id)) => {
        if let Ok(Some(item)) = crate::db::items::get(&pool, &id).await {
            let _ = app.emit("item:external_edit", &item);
        }
    }
    Ok(crate::sync::ReconcileOutcome::Deleted(id)) => {
        let _ = app.emit("item:deleted", serde_json::json!({ "id": id }));
    }
    Ok(crate::sync::ReconcileOutcome::NoOp) => {} // hash match — silent
    Err(e) => {
        tracing::warn!("reconcile error: {}", e);
    }
}
```

**Frontend**: hooks usam `listen('item:created'|'item:updated'|'item:deleted'|'item:external_edit', ...)`
e fazem `queryClient.invalidateQueries(['items', repoId])` ou updates surgical.

**Acceptance**:
- [ ] Editar `.md` no Cursor → UI recebe `item:external_edit` → notification aparece
- [ ] Criar `.md` novo no editor → `item:created` → card surge no kanban
- [ ] Delete via `rm` → `item:deleted` → card desaparece

---

### F8 — Sidecar SDK choice (Finding #9, decisão)

**Estimated**: decision only — pode ser deferred
**Severity**: 🟢 Drift acceptable
**Files**: `sidecar/package.json`, `sidecar/agent.mjs`

Hoje usa `@anthropic-ai/sdk` (raw) e implementa o tool loop manualmente. Spec previa
`@anthropic-ai/claude-agent-sdk` que provê o loop built-in.

**Decisão necessária**: manter raw SDK ou migrar?

- Manter: zero re-trabalho, mas perde features (built-in abort signals, streaming
  helpers, prompt caching automático)
- Migrar: ~1-2h de re-escrita do `agent.mjs`, ganha features e alinhamento com spec

**Recomendação**: manter raw por enquanto (loop manual está OK). Migrar quando F2
estiver shipped e tivermos uso real pra validar se as features extras importam.

**Acceptance**: documentar decisão como ADR-009 (manter raw OR migrar).

---

### F9 — Setup de hot-reload pra desenvolvimento (não-bloqueante)

**Estimated**: 30min
**Severity**: 🟢 DX
**Files**: `tauri.conf.json`, scripts em `package.json`

Garantir que `pnpm tauri dev` faz hot-reload do React + restart do Rust em mudanças.

---

## Prerequisites verificados

- ✅ App compila sem erros (cargo check + tsc)
- ✅ Schema SQLite presente e bate com spec
- ✅ Mutations Phase 03 funcionais para o caminho feliz

## Acceptance criteria — Phase 09 complete

- [x] F1 — F4 todos shipped (caso de uso "validation cruzada" funciona end-to-end)
- [x] F5, F6, F7 todos shipped (qualidade)
- [x] F8 decidido (ADR-009 escrita)
- [ ] Validation report 2026-04-29 lido por humano e re-rodado: zero findings 🔴 Critical, ≤2 findings 🟡 Important
- [ ] Manual smoke test:
  1. Adicionar `simulation-engine` como repo
  2. Editar `imp-XX.md` no Cursor → kanban refresca em <1s
  3. Click "+ New" + "Use agent" + título "tooltip não some" → agente conversa, propõe, usuário aprova
  4. Save → arquivo escrito, commit feito, kanban mostra
  5. Drag pra "In Progress" → file gets `started_date`, commit feito
  6. Click Complete → file gets `## Resolução`, commit feito
  7. Tudo isso sem console errors, com sons certos

## Out of scope (continua em phases originais)

- Phase 07 (migrations) — finding #8, fica em phase-07
- Phase 08 (polish) — finding #10, fica em phase-08
- Performance tuning além do baseline
- Code signing / notarization
