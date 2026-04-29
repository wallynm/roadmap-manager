use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;

use serde_json::Value;
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::Mutex;

use crate::agent::tools;
use crate::db::repos;

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
    pub fn new(sidecar_path: PathBuf, max_concurrent: usize) -> Self {
        Self {
            active: Arc::new(Mutex::new(HashMap::new())),
            sidecar_path,
            max_concurrent,
        }
    }

    pub async fn spawn(
        &self,
        run_id: String,
        init_msg: Value,
        repo_id: String,
        pool: SqlitePool,
        app: AppHandle,
    ) -> Result<(), String> {
        {
            let active = self.active.lock().await;
            if active.len() >= self.max_concurrent {
                return Err("Agent pool at capacity".into());
            }
        }

        let api_key = resolve_api_key()?;
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

        {
            let mut w = stdin.lock().await;
            let line = serde_json::to_string(&init_msg).unwrap();
            w.write_all(line.as_bytes())
                .await
                .map_err(|e| e.to_string())?;
            w.write_all(b"\n").await.map_err(|e| e.to_string())?;
            w.flush().await.map_err(|e| e.to_string())?;
        }

        let app_clone = app.clone();
        let pool_clone = pool.clone();
        let run_id_clone = run_id.clone();
        let active_clone = self.active.clone();
        let stdin_clone = stdin.clone();
        let repo_id_clone = repo_id.clone();

        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            let mut transcript: Vec<Value> = Vec::new();

            while let Ok(Some(line)) = lines.next_line().await {
                if line.trim().is_empty() {
                    continue;
                }
                let msg: Value = match serde_json::from_str(&line) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                let kind = msg.get("kind").and_then(|v| v.as_str()).unwrap_or("");
                transcript.push(msg.clone());

                match kind {
                    "delta" => {
                        let _ = app_clone.emit("agent:delta", &msg);
                    }
                    "question" => {
                        let _ = app_clone.emit("agent:question", &msg);
                    }
                    "tool_call" => {
                        let _ = app_clone.emit("agent:tool_call", &msg);

                        let tool_result = handle_tool_call(
                            &pool_clone,
                            &repo_id_clone,
                            &msg,
                        )
                        .await;

                        let call_id = msg
                            .get("id")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();

                        let reply = serde_json::json!({
                            "kind": "tool_result",
                            "id": call_id,
                            "result": tool_result,
                        });

                        let mut w = stdin_clone.lock().await;
                        let reply_line = serde_json::to_string(&reply).unwrap();
                        let _ = w.write_all(reply_line.as_bytes()).await;
                        let _ = w.write_all(b"\n").await;
                        let _ = w.flush().await;
                    }
                    "finished" => {
                        update_run_status(
                            &pool_clone,
                            &run_id_clone,
                            "succeeded",
                            msg.get("result"),
                            msg.get("costUsd").and_then(|v| v.as_f64()),
                        )
                        .await;
                        let _ = app_clone.emit("agent:finished", &msg);
                        active_clone.lock().await.remove(&run_id_clone);
                        crate::sounds::play(crate::sounds::SoundKind::AgentFinished);
                        break;
                    }
                    "error" => {
                        update_run_status(
                            &pool_clone,
                            &run_id_clone,
                            "failed",
                            None,
                            None,
                        )
                        .await;
                        let _ = app_clone.emit("agent:error", &msg);
                        active_clone.lock().await.remove(&run_id_clone);
                        crate::sounds::play(crate::sounds::SoundKind::AgentError);
                        break;
                    }
                    _ => {}
                }
            }

            let _ = sqlx::query("UPDATE agent_runs SET transcript = ? WHERE id = ?")
                .bind(serde_json::to_string(&transcript).unwrap_or_default())
                .bind(&run_id_clone)
                .execute(&pool_clone)
                .await;
        });

        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                tracing::warn!(target: "agent.sidecar", "{}", line);
            }
        });

        let handle_record = AgentHandle {
            run_id: run_id.clone(),
            stdin: stdin.clone(),
            child: Arc::new(Mutex::new(child)),
        };
        self.active.lock().await.insert(run_id.clone(), handle_record);

        crate::sounds::play(crate::sounds::SoundKind::AgentStart);

        Ok(())
    }

    pub async fn send_message(&self, run_id: &str, msg: Value) -> Result<(), String> {
        let active = self.active.lock().await;
        let handle = active.get(run_id).ok_or("run not found")?;
        let mut stdin = handle.stdin.lock().await;
        let line = serde_json::to_string(&msg).map_err(|e| e.to_string())?;
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
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

fn resolve_api_key() -> Result<String, String> {
    if let Ok(key) = std::env::var("ANTHROPIC_API_KEY") {
        if !key.is_empty() {
            return Ok(key);
        }
    }

    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let auth_path = home.join(".claude").join("auth.json");
    if auth_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&auth_path) {
            if let Ok(json) = serde_json::from_str::<Value>(&content) {
                if let Some(key) = json.get("apiKey").and_then(|v| v.as_str()) {
                    if !key.is_empty() {
                        return Ok(key.to_string());
                    }
                }
            }
        }
    }

    Err("ANTHROPIC_API_KEY not found. Set the env var or configure in ~/.claude/auth.json".into())
}

async fn update_run_status(
    pool: &SqlitePool,
    run_id: &str,
    status: &str,
    output: Option<&Value>,
    cost: Option<f64>,
) {
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    let output_str = output.map(|v| serde_json::to_string(v).unwrap_or_default());
    let _ = sqlx::query(
        "UPDATE agent_runs SET status = ?, output = ?, cost_usd = ?, finished_at = ? WHERE id = ?",
    )
    .bind(status)
    .bind(output_str)
    .bind(cost)
    .bind(&now)
    .bind(run_id)
    .execute(pool)
    .await;
}

async fn handle_tool_call(
    pool: &SqlitePool,
    repo_id: &str,
    msg: &Value,
) -> Value {
    let name = msg.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let args = msg.get("args").cloned().unwrap_or(Value::Object(Default::default()));

    let repo = match repos::get(pool, repo_id).await {
        Ok(r) => r,
        Err(e) => return serde_json::json!({ "error": e.to_string() }),
    };

    match name {
        "read_repo_files" => {
            let pattern = args.get("pattern").and_then(|v| v.as_str()).unwrap_or("*");
            let max_files = args.get("maxFiles").and_then(|v| v.as_u64()).unwrap_or(10) as usize;
            match tools::read_repo_files(&repo.path, pattern, max_files, 100_000).await {
                Ok(files) => {
                    let result: Vec<Value> = files
                        .into_iter()
                        .map(|(path, content)| serde_json::json!({ "path": path, "content": content }))
                        .collect();
                    serde_json::json!(result)
                }
                Err(e) => serde_json::json!({ "error": e.to_string() }),
            }
        }
        "list_existing_items" => {
            let item_type = args.get("type").and_then(|v| v.as_str());
            let status = args.get("status").and_then(|v| v.as_str());
            let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(50) as usize;
            match tools::list_existing_items(pool, repo_id, item_type, status, limit).await {
                Ok(items) => serde_json::json!(items),
                Err(e) => serde_json::json!({ "error": e.to_string() }),
            }
        }
        "run_git_log" => {
            let path = args.get("path").and_then(|v| v.as_str());
            let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(10) as usize;
            let since = args.get("sinceDate").and_then(|v| v.as_str());
            match tools::run_git_log(&repo.path, path, limit, since) {
                Ok(logs) => serde_json::json!(logs),
                Err(e) => serde_json::json!({ "error": e.to_string() }),
            }
        }
        "read_item" => {
            let eid = args.get("externalId").and_then(|v| v.as_str()).unwrap_or("");
            match crate::db::items::get_by_external_id(pool, repo_id, eid).await {
                Ok(Some(item)) => serde_json::json!({
                    "id": item.external_id,
                    "title": item.title,
                    "body": item.body,
                    "frontmatter": item.frontmatter,
                    "status": item.status,
                }),
                Ok(None) => serde_json::json!({ "error": format!("Item {} not found", eid) }),
                Err(e) => serde_json::json!({ "error": e.to_string() }),
            }
        }
        _ => serde_json::json!({ "error": format!("Unknown tool: {}", name) }),
    }
}
