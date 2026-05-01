use sqlx::SqlitePool;
use std::path::Path;
use tauri::{Emitter, State};

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
    handle: tauri::AppHandle,
    repo_id: String,
) -> Result<validator::fix::FixReport, String> {
    let repo = repos::get(&pool, &repo_id)
        .await
        .map_err(|e| e.to_string())?;

    let config: RepoConfig =
        serde_json::from_str(&repo.config).map_err(|e| e.to_string())?;

    let repo_path_str = repo.path.clone();
    let report = {
        let p = Path::new(&repo_path_str);
        validator::validate(p, &config)
    };

    if report.issues.is_empty() {
        return Ok(validator::fix::FixReport {
            fixed: 0,
            skipped: 0,
            files: Vec::new(),
        });
    }

    let total = report.issues.len() as u32;
    let _ = handle.emit("fix:start", serde_json::json!({ "total": total }));

    // Process files one at a time on a blocking thread. After each emit, sleep
    // so the WKWebView run loop can deliver the IPC message to JS before the
    // next file is processed — this makes progress real, not a batched replay.
    // Cap total extra time at ~2 s regardless of file count.
    let delay_ms = (2_000_u64 / (total as u64).max(1)).clamp(16, 80);
    let config_clone = config.clone();
    let issues_clone = report.issues.clone();
    let handle_clone = handle.clone();

    let fix_report = tokio::task::spawn_blocking(move || {
        let path = Path::new(&repo_path_str);
        validator::fix::fix_issues(
            path,
            &config_clone,
            &issues_clone,
            |done, total, file, fixed| {
                let _ = handle_clone.emit(
                    "fix:progress",
                    serde_json::json!({
                        "done": done,
                        "total": total,
                        "file": file,
                        "fixed": fixed,
                    }),
                );
                // Give the WebView time to deliver this event before continuing
                std::thread::sleep(std::time::Duration::from_millis(delay_ms));
            },
        )
    })
    .await
    .map_err(|e| e.to_string())?;

    if !fix_report.files.is_empty() {
        // Commit is best-effort: a dirty tree or missing git identity should not
        // block the rescan that follows. Log but do not propagate commit errors.
        if let Err(e) = crate::vcs::batch_commit(
            &repo,
            &fix_report.files,
            &format!(
                "chore(roadmap): backfill frontmatter for {} files",
                fix_report.fixed
            ),
        ) {
            eprintln!("fix_repo: auto-commit skipped — {}", e);
        }

        crate::scanner::scan_repo(&pool, &repo_id)
            .await
            .map_err(|e| e.to_string())?;
    }

    let _ = handle.emit("fix:done", &fix_report);

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
