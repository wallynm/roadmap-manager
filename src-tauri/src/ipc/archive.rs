use sqlx::SqlitePool;
use std::path::Path;
use tauri::State;

use crate::archive;
use crate::db::{items, repos};
use crate::scanner::RepoConfig;

#[tauri::command]
pub async fn archive_dry_run(
    pool: State<'_, SqlitePool>,
    repo_id: String,
) -> Result<archive::ArchiveDryRun, String> {
    let repo = repos::get(&pool, &repo_id)
        .await
        .map_err(|e| e.to_string())?;
    let config: RepoConfig =
        serde_json::from_str(&repo.config).map_err(|e| e.to_string())?;
    let all_items = items::list_by_repo(&pool, &repo_id, None)
        .await
        .map_err(|e| e.to_string())?;

    let repo_path = Path::new(&repo.path);
    Ok(archive::find_candidates(repo_path, &config, &all_items))
}

#[tauri::command]
pub async fn archive_execute(
    pool: State<'_, SqlitePool>,
    repo_id: String,
) -> Result<archive::ArchiveReport, String> {
    let repo = repos::get(&pool, &repo_id)
        .await
        .map_err(|e| e.to_string())?;
    let config: RepoConfig =
        serde_json::from_str(&repo.config).map_err(|e| e.to_string())?;
    let all_items = items::list_by_repo(&pool, &repo_id, None)
        .await
        .map_err(|e| e.to_string())?;

    let repo_path = Path::new(&repo.path);
    let dry_run = archive::find_candidates(repo_path, &config, &all_items);

    if dry_run.candidates.is_empty() {
        return Ok(archive::ArchiveReport {
            moved: 0,
            refs_updated: 0,
            files: Vec::new(),
        });
    }

    let report = archive::execute_archive(repo_path, &dry_run.candidates);

    if report.moved > 0 {
        crate::vcs::batch_commit(
            &repo,
            &report.files,
            &format!(
                "chore(roadmap): archive {} shipped items + update cross-refs",
                report.moved
            ),
        )
        .map_err(|e| format!("auto-commit failed: {}", e))?;

        crate::scanner::scan_repo(&pool, &repo_id)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(report)
}
