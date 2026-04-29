use std::path::Path;

use sqlx::SqlitePool;
use walkdir::WalkDir;

use crate::db::items;
use crate::error::AppResult;

pub async fn read_repo_files(
    repo_path: &str,
    pattern: &str,
    max_files: usize,
    max_bytes: usize,
) -> AppResult<Vec<(String, String)>> {
    let repo = Path::new(repo_path);
    let glob_pattern = glob::Pattern::new(pattern)
        .unwrap_or_else(|_| glob::Pattern::new("*").unwrap());

    let mut results = Vec::new();

    for entry in WalkDir::new(repo).max_depth(10).into_iter().flatten() {
        if results.len() >= max_files {
            break;
        }
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let rel = path.strip_prefix(repo).unwrap_or(path);
        if glob_pattern.matches_path(rel) {
            if let Ok(content) = std::fs::read_to_string(path) {
                let truncated = if content.len() > max_bytes {
                    content[..max_bytes].to_string()
                } else {
                    content
                };
                results.push((rel.to_string_lossy().to_string(), truncated));
            }
        }
    }

    Ok(results)
}

pub async fn list_existing_items(
    pool: &SqlitePool,
    repo_id: &str,
    item_type: Option<&str>,
    status: Option<&str>,
    limit: usize,
) -> AppResult<Vec<serde_json::Value>> {
    let filters = items::ItemFilters {
        status: status.map(String::from),
        priority: None,
        labels: None,
        item_type: item_type.map(String::from),
        search: None,
    };

    let all_items = items::list_by_repo(pool, repo_id, Some(&filters)).await?;
    let limited: Vec<_> = all_items.into_iter().take(limit).collect();

    Ok(limited
        .iter()
        .map(|i| {
            serde_json::json!({
                "id": i.external_id,
                "title": i.title,
                "status": i.status,
                "labels": serde_json::from_str::<Vec<String>>(&i.labels).unwrap_or_default()
            })
        })
        .collect())
}

pub fn run_git_log(
    repo_path: &str,
    _path: Option<&str>,
    limit: usize,
    since: Option<&str>,
) -> AppResult<Vec<serde_json::Value>> {
    let git_repo = git2::Repository::open(repo_path)?;
    let mut revwalk = git_repo.revwalk()?;
    revwalk.push_head()?;
    revwalk.set_sorting(git2::Sort::TIME)?;

    let mut results = Vec::new();

    for oid in revwalk.flatten() {
        if results.len() >= limit {
            break;
        }
        let commit = git_repo.find_commit(oid)?;
        let time = commit.time();
        let date = chrono::DateTime::from_timestamp(time.seconds(), 0)
            .map(|dt| dt.format("%Y-%m-%d").to_string())
            .unwrap_or_default();

        if let Some(since_date) = since {
            if date < since_date.to_string() {
                break;
            }
        }

        let message = commit.message().unwrap_or_default().to_string();
        let author = commit.author().name().unwrap_or_default().to_string();

        results.push(serde_json::json!({
            "sha": oid.to_string(),
            "date": date,
            "author": author,
            "message": message.lines().next().unwrap_or_default()
        }));
    }

    Ok(results)
}
