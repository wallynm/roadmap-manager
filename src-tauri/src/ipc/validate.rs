use sqlx::SqlitePool;
use std::path::Path;
use tauri::State;

use crate::db::{items, repos};
use crate::scanner::RepoConfig;
use crate::validator;

#[tauri::command]
pub async fn validate_repo(
    pool: State<'_, SqlitePool>,
    repo_id: String,
) -> Result<validator::ValidationReport, String> {
    let repo = repos::get(&pool, &repo_id)
        .await
        .map_err(|e| e.to_string())?;

    let config: RepoConfig =
        serde_json::from_str(&repo.config).map_err(|e| e.to_string())?;

    let repo_path = Path::new(&repo.path);
    Ok(validator::validate(repo_path, &config))
}

#[tauri::command]
pub async fn fix_repo(
    pool: State<'_, SqlitePool>,
    repo_id: String,
) -> Result<validator::fix::FixReport, String> {
    let repo = repos::get(&pool, &repo_id)
        .await
        .map_err(|e| e.to_string())?;

    let config: RepoConfig =
        serde_json::from_str(&repo.config).map_err(|e| e.to_string())?;

    let repo_path = Path::new(&repo.path);
    let report = validator::validate(repo_path, &config);

    if report.issues.is_empty() {
        return Ok(validator::fix::FixReport {
            fixed: 0,
            skipped: 0,
            files: Vec::new(),
        });
    }

    let fix_report = validator::fix::fix_issues(repo_path, &config, &report.issues);

    if !fix_report.files.is_empty() {
        crate::vcs::batch_commit(
            &repo,
            &fix_report.files,
            &format!(
                "chore(roadmap): backfill frontmatter for {} files",
                fix_report.fixed
            ),
        )
        .map_err(|e| format!("auto-commit failed: {}", e))?;

        crate::scanner::scan_repo(&pool, &repo_id)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(fix_report)
}

#[tauri::command]
pub async fn deps_check(
    pool: State<'_, SqlitePool>,
    repo_id: String,
) -> Result<validator::deps::DepAnalysis, String> {
    let all_items = items::list_by_repo(&pool, &repo_id, None)
        .await
        .map_err(|e| e.to_string())?;
    Ok(validator::deps::analyze(&all_items))
}

const IMPACT_CACHE_KEY: &str = "impact_ranking";

#[tauri::command]
pub async fn impact_ranking(
    pool: State<'_, SqlitePool>,
    repo_id: String,
) -> Result<Vec<validator::impact::RankedItem>, String> {
    let all_items = items::list_by_repo(&pool, &repo_id, None)
        .await
        .map_err(|e| e.to_string())?;

    let ranking = validator::impact::rank_by_impact(&all_items);

    if let Ok(json) = serde_json::to_string(&ranking) {
        crate::db::cache::upsert(&pool, &repo_id, IMPACT_CACHE_KEY, &json)
            .await
            .ok();
    }

    Ok(ranking)
}

#[tauri::command]
pub async fn get_impact_cache(
    pool: State<'_, SqlitePool>,
    repo_id: String,
) -> Result<Option<Vec<validator::impact::RankedItem>>, String> {
    let raw = crate::db::cache::get(&pool, &repo_id, IMPACT_CACHE_KEY)
        .await
        .map_err(|e| e.to_string())?;

    match raw {
        None => Ok(None),
        Some(json) => {
            let ranking = serde_json::from_str(&json).map_err(|e| e.to_string())?;
            Ok(Some(ranking))
        }
    }
}

#[tauri::command]
pub async fn stale_items(
    pool: State<'_, SqlitePool>,
    repo_id: String,
    stale_days: u32,
) -> Result<Vec<crate::db::items::Item>, String> {
    let all_items = items::list_by_repo(&pool, &repo_id, None)
        .await
        .map_err(|e| e.to_string())?;

    let cutoff = chrono::Utc::now() - chrono::Duration::days(stale_days as i64);
    let cutoff_str = cutoff.format("%Y-%m-%d").to_string();

    let stale: Vec<_> = all_items
        .into_iter()
        .filter(|item| {
            item.status == "in_progress"
                && item
                    .started_date
                    .as_ref()
                    .map(|d| d.as_str() < cutoff_str.as_str())
                    .unwrap_or(false)
        })
        .collect();

    Ok(stale)
}
