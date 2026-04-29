use serde::Serialize;
use sqlx::SqlitePool;
use tauri::{AppHandle, State};

use crate::db::repos;
use crate::scanner::{self, ScanReport};
use crate::watcher::WatcherPool;

#[derive(Serialize)]
pub struct RoadmapResult {
    pub content: String,
    pub exists: bool,
    pub path: String,
}

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

#[tauri::command]
pub async fn update_repo(
    pool: State<'_, SqlitePool>,
    id: String,
    name: String,
    config: String,
) -> Result<repos::Repo, String> {
    repos::update_repo(&pool, &id, &name, &config)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_roadmap(pool: State<'_, SqlitePool>, repo_id: String) -> Result<RoadmapResult, String> {
    let repo = repos::get(&pool, &repo_id).await.map_err(|e| e.to_string())?;
    let roadmap_path = std::path::Path::new(&repo.path).join("ROADMAP.md");
    let path_str = roadmap_path.to_string_lossy().to_string();

    if roadmap_path.exists() {
        let content = std::fs::read_to_string(&roadmap_path).map_err(|e| e.to_string())?;
        Ok(RoadmapResult { content, exists: true, path: path_str })
    } else {
        Ok(RoadmapResult { content: String::new(), exists: false, path: path_str })
    }
}

#[tauri::command]
pub async fn regenerate_roadmap(pool: State<'_, SqlitePool>, repo_id: String) -> Result<RoadmapResult, String> {
    crate::roadmap::regenerate(&pool, &repo_id)
        .await
        .map_err(|e| e.to_string())?;

    let repo = repos::get(&pool, &repo_id).await.map_err(|e| e.to_string())?;
    let roadmap_path = std::path::Path::new(&repo.path).join("ROADMAP.md");
    let path_str = roadmap_path.to_string_lossy().to_string();
    let content = std::fs::read_to_string(&roadmap_path).map_err(|e| e.to_string())?;

    Ok(RoadmapResult { content, exists: true, path: path_str })
}

#[tauri::command]
pub async fn regenerate_indexes(
    pool: State<'_, SqlitePool>,
    repo_id: String,
) -> Result<u32, String> {
    crate::roadmap::regenerate_indexes(&pool, &repo_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_checkbox_count(
    pool: State<'_, SqlitePool>,
    repo_id: String,
) -> Result<crate::parser::checkboxes::CheckboxCount, String> {
    let repo = repos::get(&pool, &repo_id)
        .await
        .map_err(|e| e.to_string())?;
    let roadmap_path = std::path::Path::new(&repo.path).join("ROADMAP.md");

    if !roadmap_path.exists() {
        return Ok(crate::parser::checkboxes::CheckboxCount {
            pending: 0,
            completed: 0,
            unchecked_items: Vec::new(),
        });
    }

    let content = std::fs::read_to_string(&roadmap_path).map_err(|e| e.to_string())?;
    Ok(crate::parser::checkboxes::count_checkboxes(&content))
}

#[tauri::command]
pub async fn get_sub_roadmaps(
    pool: State<'_, SqlitePool>,
    repo_id: String,
) -> Result<Vec<crate::parser::checkboxes::SubRoadmapStatus>, String> {
    let repo = repos::get(&pool, &repo_id)
        .await
        .map_err(|e| e.to_string())?;
    let config: crate::scanner::RepoConfig =
        serde_json::from_str(&repo.config).map_err(|e| e.to_string())?;

    let globs: Vec<String> = config
        .templates
        .values()
        .filter_map(|t| {
            t.defaults
                .get("subRoadmapGlobs")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect::<Vec<_>>()
                })
        })
        .flatten()
        .collect();

    if globs.is_empty() {
        return Ok(Vec::new());
    }

    let repo_path = std::path::Path::new(&repo.path);
    Ok(crate::parser::checkboxes::classify_sub_roadmaps(
        repo_path, &globs,
    ))
}
