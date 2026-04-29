use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::agent::pool::AgentPool;
use crate::db::repos;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct AgentRun {
    pub id: String,
    pub repo_id: Option<String>,
    pub item_id: Option<String>,
    pub trigger_type: String,
    pub model: String,
    pub status: String,
    pub prompt: String,
    pub transcript: Option<String>,
    pub output: Option<String>,
    pub error: Option<String>,
    pub duration_ms: Option<i64>,
    pub cost_usd: Option<f64>,
    pub started_at: String,
    pub finished_at: Option<String>,
}

#[tauri::command]
pub async fn agent_invoke(
    pool: State<'_, SqlitePool>,
    agent_pool: State<'_, AgentPool>,
    handle: AppHandle,
    trigger: String,
    repo_id: String,
    item_type: Option<String>,
    title: Option<String>,
    description: Option<String>,
    item_id: Option<String>,
) -> Result<String, String> {
    let run_id = Uuid::new_v4().to_string();
    let model = "claude-sonnet-4-6".to_string();
    let prompt = title
        .clone()
        .unwrap_or_else(|| description.clone().unwrap_or_default());

    sqlx::query(
        "INSERT INTO agent_runs (id, repo_id, item_id, trigger_type, model, status, prompt) VALUES (?, ?, ?, ?, ?, 'running', ?)",
    )
    .bind(&run_id)
    .bind(&repo_id)
    .bind(&item_id)
    .bind(&trigger)
    .bind(&model)
    .bind(&prompt)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let repo = repos::get(pool.inner(), &repo_id)
        .await
        .map_err(|e| e.to_string())?;

    let context = serde_json::json!({
        "repoPath": repo.path,
        "repoName": repo.name,
        "type": item_type.unwrap_or_else(|| "improvement".into()),
        "title": title.unwrap_or_default(),
        "description": description.unwrap_or_default(),
        "itemId": item_id,
    });

    let init_msg = serde_json::json!({
        "kind": "init",
        "trigger": trigger,
        "repoId": repo_id,
        "model": model,
        "context": context,
    });

    agent_pool
        .spawn(
            run_id.clone(),
            init_msg,
            repo_id.clone(),
            pool.inner().clone(),
            handle,
        )
        .await?;

    Ok(run_id)
}

#[tauri::command]
pub async fn agent_respond(
    agent_pool: State<'_, AgentPool>,
    run_id: String,
    message: String,
) -> Result<(), String> {
    let msg = serde_json::json!({
        "kind": "user_response",
        "text": message,
    });
    agent_pool.send_message(&run_id, msg).await
}

#[tauri::command]
pub async fn agent_get_run(
    pool: State<'_, SqlitePool>,
    run_id: String,
) -> Result<AgentRun, String> {
    sqlx::query_as::<_, AgentRun>("SELECT * FROM agent_runs WHERE id = ?")
        .bind(&run_id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Agent run not found".to_string())
}

#[tauri::command]
pub async fn agent_cancel(
    pool: State<'_, SqlitePool>,
    agent_pool: State<'_, AgentPool>,
    run_id: String,
) -> Result<(), String> {
    agent_pool.cancel(&run_id).await?;
    let now = chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S")
        .to_string();
    sqlx::query("UPDATE agent_runs SET status = 'cancelled', finished_at = ? WHERE id = ?")
        .bind(&now)
        .bind(&run_id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn agent_list_runs(
    pool: State<'_, SqlitePool>,
    repo_id: Option<String>,
) -> Result<Vec<AgentRun>, String> {
    let runs = if let Some(rid) = repo_id {
        sqlx::query_as::<_, AgentRun>(
            "SELECT * FROM agent_runs WHERE repo_id = ? ORDER BY started_at DESC LIMIT 50",
        )
        .bind(&rid)
        .fetch_all(pool.inner())
        .await
    } else {
        sqlx::query_as::<_, AgentRun>(
            "SELECT * FROM agent_runs ORDER BY started_at DESC LIMIT 50",
        )
        .fetch_all(pool.inner())
        .await
    };
    runs.map_err(|e| e.to_string())
}
