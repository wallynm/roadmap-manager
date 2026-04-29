use std::path::Path;

use crate::db::{items, notifications};
use crate::error::AppResult;
use crate::parser::{self, status::normalize_status};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug)]
pub enum ReconcileOutcome {
    NoOp,
    Updated(String),
    Created(String),
    Deleted(String),
}

pub async fn handle_fs_event(
    pool: &SqlitePool,
    repo_id: &str,
    repo_path: &Path,
    path: &Path,
    kind: &notify::EventKind,
) -> AppResult<ReconcileOutcome> {
    let rel_path = path
        .strip_prefix(repo_path)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string();

    match kind {
        notify::EventKind::Remove(_) => {
            if let Some(item) = items::get_by_path(pool, repo_id, &rel_path).await? {
                items::delete(pool, &item.id).await?;
                notifications::create(
                    pool,
                    "external_edit",
                    &format!("{} deleted from disk", item.external_id),
                    None,
                    None,
                )
                .await?;
                return Ok(ReconcileOutcome::Deleted(item.id));
            }
            Ok(ReconcileOutcome::NoOp)
        }
        _ => reconcile_external_edit(pool, repo_id, repo_path, path).await,
    }
}

pub async fn reconcile_external_edit(
    pool: &SqlitePool,
    repo_id: &str,
    repo_path: &Path,
    path: &Path,
) -> AppResult<ReconcileOutcome> {
    let content = match tokio::fs::read_to_string(path).await {
        Ok(c) => c,
        Err(_) => return Ok(ReconcileOutcome::NoOp),
    };

    let new_hash = parser::hash(&content);
    let rel_path = path
        .strip_prefix(repo_path)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string();

    let existing = items::get_by_path(pool, repo_id, &rel_path).await?;

    if let Some(ref item) = existing {
        if item.file_hash == new_hash {
            return Ok(ReconcileOutcome::NoOp);
        }
    }

    let parsed = match parser::parse(&content) {
        Ok(p) => p,
        Err(_) => return Ok(ReconcileOutcome::NoOp),
    };

    let external_id = parser::extract_string(&parsed.yaml, "id").unwrap_or_default();
    let title = parser::extract_string(&parsed.yaml, "title").unwrap_or_default();
    let status_raw =
        parser::extract_string(&parsed.yaml, "status").unwrap_or_else(|| "backlog".into());
    let status = normalize_status(&status_raw);
    let priority =
        parser::extract_string(&parsed.yaml, "priority").and_then(|p| parser::normalize_priority(&p));
    let labels = parser::extract_string_array(&parsed.yaml, "labels");
    let depends_on = parser::extract_string_array(&parsed.yaml, "depends-on");
    let created_date = parser::extract_string(&parsed.yaml, "created-date");
    let started_date = parser::extract_string(&parsed.yaml, "started-date");
    let completed_date = parser::extract_string(&parsed.yaml, "completed-date");
    let duplicate_of = parser::extract_string(&parsed.yaml, "duplicate-of");

    match existing {
        Some(mut item) => {
            item.title = title;
            item.body = parsed.body;
            item.frontmatter = parsed.raw_frontmatter;
            item.file_hash = new_hash;
            item.status = status.as_str().to_string();
            item.priority = priority;
            item.labels = serde_json::to_string(&labels).unwrap_or_default();
            item.depends_on = serde_json::to_string(&depends_on).unwrap_or_default();
            item.duplicate_of = duplicate_of;
            item.created_date = created_date;
            item.started_date = started_date;
            item.completed_date = completed_date;
            items::update(pool, &item).await?;

            notifications::create(
                pool,
                "external_edit",
                &format!("{} edited externally", item.external_id),
                Some(&format!("Status: {}", item.status)),
                Some(&item.id),
            )
            .await?;

            Ok(ReconcileOutcome::Updated(item.id))
        }
        None => {
            if external_id.is_empty() || title.is_empty() {
                return Ok(ReconcileOutcome::NoOp);
            }

            let item_type = parser::extract_string(&parsed.yaml, "type")
                .unwrap_or_else(|| "improvement".into());

            let scope = crate::scanner::derive_scope(&rel_path, "docs/");

            let item = items::Item {
                id: Uuid::new_v4().to_string(),
                repo_id: repo_id.to_string(),
                external_id: external_id.clone(),
                scope,
                item_type,
                title,
                file_path: rel_path,
                file_hash: new_hash,
                body: parsed.body,
                frontmatter: parsed.raw_frontmatter,
                status: status.as_str().to_string(),
                priority,
                labels: serde_json::to_string(&labels).unwrap_or_default(),
                depends_on: serde_json::to_string(&depends_on).unwrap_or_default(),
                duplicate_of,
                created_date,
                started_date,
                completed_date,
                updated_at: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string(),
            };

            let inserted = items::insert(pool, &item).await?;

            notifications::create(
                pool,
                "external_edit",
                &format!("{} imported from disk", external_id),
                None,
                Some(&inserted.id),
            )
            .await?;

            Ok(ReconcileOutcome::Created(inserted.id))
        }
    }
}
