use sqlx::SqlitePool;
use tauri::{AppHandle, State};

use crate::db::repos;
use crate::scanner::{self, ScanReport};
use crate::watcher::WatcherPool;

#[tauri::command]
pub async fn list_repos(pool: State<'_, SqlitePool>) -> Result<Vec<repos::Repo>, String> {
    repos::list(&pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_repo(
    pool: State<'_, SqlitePool>,
    watcher: State<'_, WatcherPool>,
    handle: AppHandle,
    name: String,
    path: String,
    config: Option<String>,
) -> Result<(repos::Repo, ScanReport), String> {
    let repo_path = std::path::Path::new(&path);
    if !repo_path.exists() {
        return Err("Path does not exist".into());
    }
    if !repo_path.join(".git").exists() {
        return Err("Not a git repository".into());
    }

    let cfg = config.unwrap_or_else(|| {
        serde_json::to_string(&scanner::default_config()).unwrap_or_default()
    });

    let repo = repos::add(&pool, &name, &path, &cfg)
        .await
        .map_err(|e| e.to_string())?;

    let report = scanner::scan_repo(&pool, &repo.id)
        .await
        .map_err(|e| e.to_string())?;

    let repo = repos::get(&pool, &repo.id)
        .await
        .map_err(|e| e.to_string())?;

    watcher
        .add_repo(&repo, pool.inner().clone(), handle.clone())
        .await
        .map_err(|e| format!("watcher attach failed: {}", e))?;

    Ok((repo, report))
}

#[tauri::command]
pub async fn remove_repo(
    pool: State<'_, SqlitePool>,
    watcher: State<'_, WatcherPool>,
    id: String,
) -> Result<(), String> {
    watcher.remove_repo(&id).await;
    repos::remove(&pool, &id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rescan_repo(pool: State<'_, SqlitePool>, repo_id: String) -> Result<ScanReport, String> {
    scanner::scan_repo(&pool, &repo_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_repo(pool: State<'_, SqlitePool>, id: String) -> Result<repos::Repo, String> {
    repos::get(&pool, &id).await.map_err(|e| e.to_string())
}
