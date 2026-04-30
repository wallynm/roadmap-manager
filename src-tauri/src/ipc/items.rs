use std::path::PathBuf;

use serde::Deserialize;
use sqlx::SqlitePool;
use tauri::State;
use uuid::Uuid;

use crate::db::{items, repos};
use crate::parser::{self, status::normalize_status};
use crate::scanner::RepoConfig;
use crate::vcs;
use crate::writer::{self, slug};

#[derive(Debug, Deserialize)]
pub struct ItemFilters {
    pub status: Option<String>,
    pub priority: Option<String>,
    pub labels: Option<Vec<String>>,
    pub item_type: Option<String>,
    pub search: Option<String>,
    pub scope: Option<String>,
}

#[tauri::command]
pub async fn list_items(
    pool: State<'_, SqlitePool>,
    repo_id: String,
    filters: Option<ItemFilters>,
) -> Result<Vec<items::Item>, String> {
    if let Some(ref f) = filters {
        if let Some(ref search) = f.search {
            if !search.is_empty() {
                return items::search(&pool, &repo_id, search)
                    .await
                    .map_err(|e| e.to_string());
            }
        }
    }

    let db_filters = filters.map(|f| crate::db::items::ItemFilters {
        status: f.status,
        priority: f.priority,
        labels: f.labels,
        item_type: f.item_type,
        search: f.search,
        scope: f.scope,
    });

    items::list_by_repo(&pool, &repo_id, db_filters.as_ref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_item(pool: State<'_, SqlitePool>, id: String) -> Result<items::Item, String> {
    items::get(&pool, &id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_item(
    pool: State<'_, SqlitePool>,
    repo_id: String,
    item_type: String,
    title: String,
    body: String,
    priority: Option<String>,
    labels: Option<Vec<String>>,
) -> Result<items::Item, String> {
    let repo = repos::get(&pool, &repo_id)
        .await
        .map_err(|e| e.to_string())?;
    let config: RepoConfig =
        serde_json::from_str(&repo.config).map_err(|e| e.to_string())?;

    let template = config
        .templates
        .get(&item_type)
        .ok_or_else(|| format!("Unknown type: {}", item_type))?;

    let external_id =
        writer::ids::next_external_id(&pool, &repo_id, &template.id_prefix, template.id_padding)
            .await
            .map_err(|e| e.to_string())?;

    let slug_str = slug::slugify(&title);
    let file_name = format!(
        "{}-{}-{}.md",
        template.file_prefix,
        external_id.split('-').last().unwrap_or("01"),
        slug_str
    );
    let file_path = format!("{}/{}", template.dir, file_name);
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();

    let item_labels = labels.unwrap_or_default();
    let item_priority = priority.or_else(|| {
        template
            .defaults
            .get("priority")
            .and_then(|v| v.as_str())
            .map(String::from)
    });

    let scope = crate::scanner::derive_scope(&file_path, &template.dir);
    let item = items::Item {
        id: Uuid::new_v4().to_string(),
        repo_id: repo_id.clone(),
        external_id: external_id.clone(),
        scope,
        item_type: item_type.clone(),
        title: title.clone(),
        file_path: file_path.clone(),
        file_hash: String::new(),
        body: body.clone(),
        frontmatter: String::new(),
        status: "todo".to_string(),
        priority: item_priority,
        labels: serde_json::to_string(&item_labels).unwrap_or_default(),
        depends_on: "[]".to_string(),
        relates_to: "[]".to_string(),
        duplicate_of: None,
        created_date: Some(today.clone()),
        started_date: None,
        completed_date: None,
        updated_at: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string(),
    };

    let content = writer::render(&item, template);
    let file_hash = writer::compute_hash(&content);

    let abs_path = PathBuf::from(&repo.path).join(&file_path);
    if let Some(parent) = abs_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| e.to_string())?;
    }

    writer::write_atomic(&abs_path, &content)
        .await
        .map_err(|e| e.to_string())?;

    let mut item_with_hash = item;
    item_with_hash.file_hash = file_hash;
    item_with_hash.frontmatter = content
        .split("---")
        .nth(1)
        .unwrap_or_default()
        .trim()
        .to_string();

    let inserted = items::insert(&pool, &item_with_hash)
        .await
        .map_err(|e| e.to_string())?;

    vcs::auto_commit(&repo, &abs_path, &inserted, "created", None)
        .map_err(|e| format!("auto-commit failed: {}", e))?;

    Ok(inserted)
}

#[tauri::command]
pub async fn start_item(pool: State<'_, SqlitePool>, id: String) -> Result<items::Item, String> {
    let mut item = items::get(&pool, &id).await.map_err(|e| e.to_string())?;
    let current_status = normalize_status(&item.status);
    let target = parser::status::ItemStatus::InProgress;

    if !current_status.can_transition_to(&target) {
        return Err(format!(
            "Cannot transition from {} to in_progress",
            item.status
        ));
    }

    item.status = "in_progress".to_string();
    if item.started_date.is_none() {
        item.started_date = Some(chrono::Utc::now().format("%Y-%m-%d").to_string());
    }

    let repo = repos::get(&pool, &item.repo_id)
        .await
        .map_err(|e| e.to_string())?;
    let config: RepoConfig =
        serde_json::from_str(&repo.config).map_err(|e| e.to_string())?;
    let template = config.templates.get(&item.item_type).ok_or("Unknown type")?;

    let content = writer::render(&item, template);
    item.file_hash = writer::compute_hash(&content);
    item.frontmatter = content.split("---").nth(1).unwrap_or_default().trim().to_string();

    let abs_path = PathBuf::from(&repo.path).join(&item.file_path);
    writer::write_atomic(&abs_path, &content)
        .await
        .map_err(|e| e.to_string())?;

    let updated = items::update(&pool, &item)
        .await
        .map_err(|e| e.to_string())?;

    vcs::auto_commit(&repo, &abs_path, &updated, "started", None)
        .map_err(|e| format!("auto-commit failed: {}", e))?;

    let _ = crate::roadmap::regenerate(pool.inner(), &updated.repo_id).await;

    Ok(updated)
}

#[tauri::command]
pub async fn complete_item(
    pool: State<'_, SqlitePool>,
    id: String,
    note: Option<String>,
) -> Result<items::Item, String> {
    let mut item = items::get(&pool, &id).await.map_err(|e| e.to_string())?;
    let current_status = normalize_status(&item.status);
    let target = parser::status::ItemStatus::Done;

    if !current_status.can_transition_to(&target) {
        return Err(format!("Cannot transition from {} to done", item.status));
    }

    item.status = "done".to_string();
    item.completed_date = Some(chrono::Utc::now().format("%Y-%m-%d").to_string());

    if let Some(ref n) = note {
        let date = chrono::Utc::now().format("%Y-%m-%d").to_string();
        item.body
            .push_str(&format!("\n\n## Resolução ({})\n\n{}\n", date, n));
    }

    let repo = repos::get(&pool, &item.repo_id)
        .await
        .map_err(|e| e.to_string())?;
    let config: RepoConfig =
        serde_json::from_str(&repo.config).map_err(|e| e.to_string())?;
    let template = config.templates.get(&item.item_type).ok_or("Unknown type")?;

    let content = writer::render(&item, template);
    item.file_hash = writer::compute_hash(&content);
    item.frontmatter = content.split("---").nth(1).unwrap_or_default().trim().to_string();

    let abs_path = PathBuf::from(&repo.path).join(&item.file_path);
    writer::write_atomic(&abs_path, &content)
        .await
        .map_err(|e| e.to_string())?;

    let updated = items::update(&pool, &item)
        .await
        .map_err(|e| e.to_string())?;

    vcs::auto_commit(&repo, &abs_path, &updated, "resolvido", note.as_deref())
        .map_err(|e| format!("auto-commit failed: {}", e))?;

    let _ = crate::roadmap::regenerate(pool.inner(), &updated.repo_id).await;

    Ok(updated)
}

#[tauri::command]
pub async fn cancel_item(
    pool: State<'_, SqlitePool>,
    id: String,
    reason: Option<String>,
) -> Result<items::Item, String> {
    let mut item = items::get(&pool, &id).await.map_err(|e| e.to_string())?;
    let current_status = normalize_status(&item.status);
    let target = parser::status::ItemStatus::Canceled;

    if !current_status.can_transition_to(&target) {
        return Err(format!(
            "Cannot transition from {} to canceled",
            item.status
        ));
    }

    item.status = "canceled".to_string();
    item.completed_date = Some(chrono::Utc::now().format("%Y-%m-%d").to_string());

    if let Some(ref r) = reason {
        let date = chrono::Utc::now().format("%Y-%m-%d").to_string();
        item.body
            .push_str(&format!("\n\n## Cancelamento ({})\n\n{}\n", date, r));
    }

    let repo = repos::get(&pool, &item.repo_id)
        .await
        .map_err(|e| e.to_string())?;
    let config: RepoConfig =
        serde_json::from_str(&repo.config).map_err(|e| e.to_string())?;
    let template = config.templates.get(&item.item_type).ok_or("Unknown type")?;

    let content = writer::render(&item, template);
    item.file_hash = writer::compute_hash(&content);
    item.frontmatter = content.split("---").nth(1).unwrap_or_default().trim().to_string();

    let abs_path = PathBuf::from(&repo.path).join(&item.file_path);
    writer::write_atomic(&abs_path, &content)
        .await
        .map_err(|e| e.to_string())?;

    let updated = items::update(&pool, &item)
        .await
        .map_err(|e| e.to_string())?;

    vcs::auto_commit(&repo, &abs_path, &updated, "cancelado", reason.as_deref())
        .map_err(|e| format!("auto-commit failed: {}", e))?;

    let _ = crate::roadmap::regenerate(pool.inner(), &updated.repo_id).await;

    Ok(updated)
}

#[tauri::command]
pub async fn mark_duplicate(
    pool: State<'_, SqlitePool>,
    id: String,
    original_id: String,
) -> Result<items::Item, String> {
    let mut item = items::get(&pool, &id).await.map_err(|e| e.to_string())?;
    let current_status = normalize_status(&item.status);
    let target = parser::status::ItemStatus::Duplicate;

    if !current_status.can_transition_to(&target) {
        return Err(format!(
            "Cannot transition from {} to duplicate",
            item.status
        ));
    }

    items::get_by_external_id(&pool, &item.repo_id, &original_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Original item {} not found", original_id))?;

    item.status = "duplicate".to_string();
    item.duplicate_of = Some(original_id.clone());
    item.completed_date = Some(chrono::Utc::now().format("%Y-%m-%d").to_string());
    item.body
        .push_str(&format!("\n\n## Duplicate of\n\n{}\n", original_id));

    let repo = repos::get(&pool, &item.repo_id)
        .await
        .map_err(|e| e.to_string())?;
    let config: RepoConfig =
        serde_json::from_str(&repo.config).map_err(|e| e.to_string())?;
    let template = config.templates.get(&item.item_type).ok_or("Unknown type")?;

    let content = writer::render(&item, template);
    item.file_hash = writer::compute_hash(&content);
    item.frontmatter = content.split("---").nth(1).unwrap_or_default().trim().to_string();

    let abs_path = PathBuf::from(&repo.path).join(&item.file_path);
    writer::write_atomic(&abs_path, &content)
        .await
        .map_err(|e| e.to_string())?;

    let updated = items::update(&pool, &item)
        .await
        .map_err(|e| e.to_string())?;

    vcs::auto_commit(
        &repo,
        &abs_path,
        &updated,
        "marcado como duplicado",
        None,
    )
    .map_err(|e| format!("auto-commit failed: {}", e))?;

    let _ = crate::roadmap::regenerate(pool.inner(), &updated.repo_id).await;

    Ok(updated)
}

#[tauri::command]
pub async fn plan_item(pool: State<'_, SqlitePool>, id: String) -> Result<items::Item, String> {
    let mut item = items::get(&pool, &id).await.map_err(|e| e.to_string())?;
    let current_status = normalize_status(&item.status);
    let target = parser::status::ItemStatus::Todo;

    if !current_status.can_transition_to(&target) {
        return Err(format!("Cannot transition from {} to todo", item.status));
    }

    let date = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let section = if item.status == "canceled" {
        format!("\n\n## Re-ativado ({})\n", date)
    } else {
        format!("\n\n## Re-aberto ({})\n", date)
    };

    item.status = "todo".to_string();
    item.completed_date = None;
    item.duplicate_of = None;
    item.body.push_str(&section);

    let repo = repos::get(&pool, &item.repo_id)
        .await
        .map_err(|e| e.to_string())?;
    let config: RepoConfig =
        serde_json::from_str(&repo.config).map_err(|e| e.to_string())?;
    let template = config.templates.get(&item.item_type).ok_or("Unknown type")?;

    let content = writer::render(&item, template);
    item.file_hash = writer::compute_hash(&content);
    item.frontmatter = content.split("---").nth(1).unwrap_or_default().trim().to_string();

    let abs_path = PathBuf::from(&repo.path).join(&item.file_path);
    writer::write_atomic(&abs_path, &content)
        .await
        .map_err(|e| e.to_string())?;

    let updated = items::update(&pool, &item)
        .await
        .map_err(|e| e.to_string())?;

    vcs::auto_commit(&repo, &abs_path, &updated, "replanned", None)
        .map_err(|e| format!("auto-commit failed: {}", e))?;

    let _ = crate::roadmap::regenerate(pool.inner(), &updated.repo_id).await;

    Ok(updated)
}

#[tauri::command]
pub async fn update_item(
    pool: State<'_, SqlitePool>,
    id: String,
    status: Option<String>,
    priority: Option<String>,
    labels: Option<Vec<String>>,
    title: Option<String>,
    body: Option<String>,
) -> Result<items::Item, String> {
    let mut item = items::get(&pool, &id).await.map_err(|e| e.to_string())?;

    if let Some(new_status) = &status {
        let current = normalize_status(&item.status);
        let target = normalize_status(new_status);
        if !current.can_transition_to(&target) {
            return Err(format!(
                "Cannot transition from {} to {}",
                item.status, new_status
            ));
        }
        item.status = target.as_str().to_string();
        if target == parser::status::ItemStatus::InProgress && item.started_date.is_none() {
            item.started_date = Some(chrono::Utc::now().format("%Y-%m-%d").to_string());
        }
        if target == parser::status::ItemStatus::Done
            || target == parser::status::ItemStatus::Canceled
        {
            item.completed_date = Some(chrono::Utc::now().format("%Y-%m-%d").to_string());
        }
    }
    if let Some(p) = priority {
        item.priority = Some(p);
    }
    if let Some(l) = labels {
        item.labels = serde_json::to_string(&l).unwrap_or_default();
    }
    if let Some(t) = title {
        item.title = t;
    }
    if let Some(b) = body {
        item.body = b;
    }

    let repo = repos::get(&pool, &item.repo_id)
        .await
        .map_err(|e| e.to_string())?;
    let config: RepoConfig =
        serde_json::from_str(&repo.config).map_err(|e| e.to_string())?;
    let template = config.templates.get(&item.item_type).ok_or("Unknown type")?;

    let content = writer::render(&item, template);
    item.file_hash = writer::compute_hash(&content);
    item.frontmatter = content.split("---").nth(1).unwrap_or_default().trim().to_string();

    let abs_path = PathBuf::from(&repo.path).join(&item.file_path);
    writer::write_atomic(&abs_path, &content)
        .await
        .map_err(|e| e.to_string())?;

    let updated = items::update(&pool, &item)
        .await
        .map_err(|e| e.to_string())?;

    let verb = normalize_status(&updated.status).status_verb();
    vcs::auto_commit(&repo, &abs_path, &updated, verb, None)
        .map_err(|e| format!("auto-commit failed: {}", e))?;

    let _ = crate::roadmap::regenerate(pool.inner(), &updated.repo_id).await;

    Ok(updated)
}

#[tauri::command]
pub async fn add_dependency(
    pool: State<'_, SqlitePool>,
    id: String,
    blocker_id: String,
) -> Result<items::Item, String> {
    let mut item = items::get(&pool, &id).await.map_err(|e| e.to_string())?;

    items::get_by_external_id(&pool, &item.repo_id, &blocker_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Blocker {} not found in this repo", blocker_id))?;

    let mut deps: Vec<String> = serde_json::from_str(&item.depends_on).unwrap_or_default();
    if !deps.contains(&blocker_id) {
        deps.push(blocker_id.clone());
    }
    item.depends_on = serde_json::to_string(&deps).unwrap_or_default();

    let repo = repos::get(&pool, &item.repo_id)
        .await
        .map_err(|e| e.to_string())?;
    let config: RepoConfig =
        serde_json::from_str(&repo.config).map_err(|e| e.to_string())?;
    let template = config.templates.get(&item.item_type).ok_or("Unknown type")?;

    let content = writer::render(&item, template);
    item.file_hash = writer::compute_hash(&content);
    item.frontmatter = content.split("---").nth(1).unwrap_or_default().trim().to_string();

    let abs_path = PathBuf::from(&repo.path).join(&item.file_path);
    writer::write_atomic(&abs_path, &content)
        .await
        .map_err(|e| e.to_string())?;

    let updated = items::update(&pool, &item)
        .await
        .map_err(|e| e.to_string())?;

    vcs::auto_commit(&repo, &abs_path, &updated, "dependency added", None)
        .map_err(|e| format!("auto-commit failed: {}", e))?;

    Ok(updated)
}

#[tauri::command]
pub async fn remove_dependency(
    pool: State<'_, SqlitePool>,
    id: String,
    blocker_id: String,
) -> Result<items::Item, String> {
    let mut item = items::get(&pool, &id).await.map_err(|e| e.to_string())?;

    let mut deps: Vec<String> = serde_json::from_str(&item.depends_on).unwrap_or_default();
    deps.retain(|d| d != &blocker_id);
    item.depends_on = serde_json::to_string(&deps).unwrap_or_default();

    let repo = repos::get(&pool, &item.repo_id)
        .await
        .map_err(|e| e.to_string())?;
    let config: RepoConfig =
        serde_json::from_str(&repo.config).map_err(|e| e.to_string())?;
    let template = config.templates.get(&item.item_type).ok_or("Unknown type")?;

    let content = writer::render(&item, template);
    item.file_hash = writer::compute_hash(&content);
    item.frontmatter = content.split("---").nth(1).unwrap_or_default().trim().to_string();

    let abs_path = PathBuf::from(&repo.path).join(&item.file_path);
    writer::write_atomic(&abs_path, &content)
        .await
        .map_err(|e| e.to_string())?;

    let updated = items::update(&pool, &item)
        .await
        .map_err(|e| e.to_string())?;

    vcs::auto_commit(&repo, &abs_path, &updated, "dependency removed", None)
        .map_err(|e| format!("auto-commit failed: {}", e))?;

    Ok(updated)
}

#[tauri::command]
pub async fn add_relation(
    pool: State<'_, SqlitePool>,
    id: String,
    related_id: String,
) -> Result<items::Item, String> {
    let mut item = items::get(&pool, &id).await.map_err(|e| e.to_string())?;
    let mut target = items::get_by_external_id(&pool, &item.repo_id, &related_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Related item {} not found in this repo", related_id))?;

    let repo = repos::get(&pool, &item.repo_id)
        .await
        .map_err(|e| e.to_string())?;
    let config: RepoConfig =
        serde_json::from_str(&repo.config).map_err(|e| e.to_string())?;

    let mut rels: Vec<String> = serde_json::from_str(&item.relates_to).unwrap_or_default();
    if !rels.contains(&related_id) {
        rels.push(related_id.clone());
    }
    item.relates_to = serde_json::to_string(&rels).unwrap_or_default();

    let template = config.templates.get(&item.item_type).ok_or("Unknown type")?;
    let content = writer::render(&item, template);
    item.file_hash = writer::compute_hash(&content);
    item.frontmatter = content.split("---").nth(1).unwrap_or_default().trim().to_string();

    let abs_path = PathBuf::from(&repo.path).join(&item.file_path);
    writer::write_atomic(&abs_path, &content)
        .await
        .map_err(|e| e.to_string())?;
    let updated = items::update(&pool, &item).await.map_err(|e| e.to_string())?;
    vcs::auto_commit(&repo, &abs_path, &updated, "relation added", None)
        .map_err(|e| format!("auto-commit failed: {}", e))?;

    let mut reverse_rels: Vec<String> =
        serde_json::from_str(&target.relates_to).unwrap_or_default();
    if !reverse_rels.contains(&item.external_id) {
        reverse_rels.push(item.external_id.clone());
        target.relates_to = serde_json::to_string(&reverse_rels).unwrap_or_default();

        let target_template = config.templates.get(&target.item_type).ok_or("Unknown type")?;
        let target_content = writer::render(&target, target_template);
        target.file_hash = writer::compute_hash(&target_content);
        target.frontmatter = target_content.split("---").nth(1).unwrap_or_default().trim().to_string();

        let target_abs = PathBuf::from(&repo.path).join(&target.file_path);
        writer::write_atomic(&target_abs, &target_content)
            .await
            .map_err(|e| e.to_string())?;
        items::update(&pool, &target).await.map_err(|e| e.to_string())?;
        vcs::auto_commit(&repo, &target_abs, &target, "reverse relation added", None)
            .map_err(|e| format!("auto-commit failed: {}", e))?;
    }

    Ok(updated)
}

#[tauri::command]
pub async fn remove_relation(
    pool: State<'_, SqlitePool>,
    id: String,
    related_id: String,
) -> Result<items::Item, String> {
    let mut item = items::get(&pool, &id).await.map_err(|e| e.to_string())?;

    let repo = repos::get(&pool, &item.repo_id)
        .await
        .map_err(|e| e.to_string())?;
    let config: RepoConfig =
        serde_json::from_str(&repo.config).map_err(|e| e.to_string())?;

    let mut rels: Vec<String> = serde_json::from_str(&item.relates_to).unwrap_or_default();
    rels.retain(|r| r != &related_id);
    item.relates_to = serde_json::to_string(&rels).unwrap_or_default();

    let template = config.templates.get(&item.item_type).ok_or("Unknown type")?;
    let content = writer::render(&item, template);
    item.file_hash = writer::compute_hash(&content);
    item.frontmatter = content.split("---").nth(1).unwrap_or_default().trim().to_string();

    let abs_path = PathBuf::from(&repo.path).join(&item.file_path);
    writer::write_atomic(&abs_path, &content)
        .await
        .map_err(|e| e.to_string())?;
    let updated = items::update(&pool, &item).await.map_err(|e| e.to_string())?;
    vcs::auto_commit(&repo, &abs_path, &updated, "relation removed", None)
        .map_err(|e| format!("auto-commit failed: {}", e))?;

    if let Ok(Some(mut target)) =
        items::get_by_external_id(&pool, &item.repo_id, &related_id).await
    {
        let mut reverse_rels: Vec<String> =
            serde_json::from_str(&target.relates_to).unwrap_or_default();
        if reverse_rels.contains(&item.external_id) {
            reverse_rels.retain(|r| r != &item.external_id);
            target.relates_to = serde_json::to_string(&reverse_rels).unwrap_or_default();

            let target_template = config.templates.get(&target.item_type).ok_or("Unknown type")?;
            let target_content = writer::render(&target, target_template);
            target.file_hash = writer::compute_hash(&target_content);
            target.frontmatter = target_content.split("---").nth(1).unwrap_or_default().trim().to_string();

            let target_abs = PathBuf::from(&repo.path).join(&target.file_path);
            writer::write_atomic(&target_abs, &target_content)
                .await
                .map_err(|e| e.to_string())?;
            items::update(&pool, &target).await.map_err(|e| e.to_string())?;
            vcs::auto_commit(&repo, &target_abs, &target, "reverse relation removed", None)
                .map_err(|e| format!("auto-commit failed: {}", e))?;
        }
    }

    Ok(updated)
}

fn find_comment_block(body: &str, author: &str, created_at: &str) -> Option<(usize, usize)> {
    let needle = format!("\n## comment: {} - {}", author, created_at);
    let lower_body = body.to_lowercase();
    let lower_needle = needle.to_lowercase();

    let block_start = lower_body.find(&lower_needle)?;

    // Find the next comment block after this one
    let search_from = block_start + 1;
    let next_comment_needle = "\n## comment:";
    let lower_after = &lower_body[search_from..];
    let block_end = lower_after
        .find(next_comment_needle)
        .map(|offset| search_from + offset)
        .unwrap_or(body.len());

    Some((block_start, block_end))
}

#[tauri::command]
pub async fn delete_comment(
    pool: State<'_, SqlitePool>,
    item_id: String,
    author: String,
    created_at: String,
) -> Result<items::Item, String> {
    let mut item = items::get(&pool, &item_id)
        .await
        .map_err(|e| e.to_string())?;

    let (start, end) = find_comment_block(&item.body, &author, &created_at)
        .ok_or_else(|| format!("Comment by '{}' at '{}' not found", author, created_at))?;

    let new_body = format!("{}{}", item.body[..start].trim_end(), &item.body[end..]);
    item.body = new_body;

    let repo = repos::get(&pool, &item.repo_id)
        .await
        .map_err(|e| e.to_string())?;
    let config: RepoConfig =
        serde_json::from_str(&repo.config).map_err(|e| e.to_string())?;
    let template = config.templates.get(&item.item_type).ok_or("Unknown type")?;

    let content = writer::render(&item, template);
    item.file_hash = writer::compute_hash(&content);
    item.frontmatter = content.split("---").nth(1).unwrap_or_default().trim().to_string();

    let abs_path = PathBuf::from(&repo.path).join(&item.file_path);
    writer::write_atomic(&abs_path, &content)
        .await
        .map_err(|e| e.to_string())?;

    let updated = items::update(&pool, &item)
        .await
        .map_err(|e| e.to_string())?;

    vcs::auto_commit(&repo, &abs_path, &updated, "comment deleted", None)
        .map_err(|e| format!("auto-commit failed: {}", e))?;

    Ok(updated)
}

#[tauri::command]
pub async fn edit_comment(
    pool: State<'_, SqlitePool>,
    item_id: String,
    author: String,
    created_at: String,
    new_body: String,
) -> Result<items::Item, String> {
    let mut item = items::get(&pool, &item_id)
        .await
        .map_err(|e| e.to_string())?;

    let (start, end) = find_comment_block(&item.body, &author, &created_at)
        .ok_or_else(|| format!("Comment by '{}' at '{}' not found", author, created_at))?;

    let header = format!("\n## comment: {} - {}", author, created_at);
    let updated_body = format!(
        "{}{}\n\n{}\n{}",
        &item.body[..start],
        header,
        new_body,
        &item.body[end..]
    );
    item.body = updated_body;

    let repo = repos::get(&pool, &item.repo_id)
        .await
        .map_err(|e| e.to_string())?;
    let config: RepoConfig =
        serde_json::from_str(&repo.config).map_err(|e| e.to_string())?;
    let template = config.templates.get(&item.item_type).ok_or("Unknown type")?;

    let content = writer::render(&item, template);
    item.file_hash = writer::compute_hash(&content);
    item.frontmatter = content.split("---").nth(1).unwrap_or_default().trim().to_string();

    let abs_path = PathBuf::from(&repo.path).join(&item.file_path);
    writer::write_atomic(&abs_path, &content)
        .await
        .map_err(|e| e.to_string())?;

    let updated = items::update(&pool, &item)
        .await
        .map_err(|e| e.to_string())?;

    vcs::auto_commit(&repo, &abs_path, &updated, "comment edited", None)
        .map_err(|e| format!("auto-commit failed: {}", e))?;

    Ok(updated)
}

#[tauri::command]
pub async fn add_comment(
    pool: State<'_, SqlitePool>,
    item_id: String,
    body: String,
    author: Option<String>,
) -> Result<items::Item, String> {
    let mut item = items::get(&pool, &item_id)
        .await
        .map_err(|e| e.to_string())?;

    let repo = repos::get(&pool, &item.repo_id)
        .await
        .map_err(|e| e.to_string())?;

    let author_name = author.unwrap_or_else(|| {
        git2::Repository::open(&repo.path)
            .ok()
            .and_then(|r| r.config().ok())
            .and_then(|c| c.get_string("user.name").ok())
            .unwrap_or_else(|| "unknown".to_string())
    });
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M").to_string();

    item.body.push_str(&format!("\n\n## comment: {} - {}\n\n{}\n", author_name, now, body));

    let config: RepoConfig =
        serde_json::from_str(&repo.config).map_err(|e| e.to_string())?;
    let template = config.templates.get(&item.item_type).ok_or("Unknown type")?;

    let content = writer::render(&item, template);
    item.file_hash = writer::compute_hash(&content);
    item.frontmatter = content.split("---").nth(1).unwrap_or_default().trim().to_string();

    let abs_path = PathBuf::from(&repo.path).join(&item.file_path);
    writer::write_atomic(&abs_path, &content)
        .await
        .map_err(|e| e.to_string())?;

    let updated = items::update(&pool, &item)
        .await
        .map_err(|e| e.to_string())?;

    vcs::auto_commit(&repo, &abs_path, &updated, "commented", None)
        .map_err(|e| format!("auto-commit failed: {}", e))?;

    Ok(updated)
}

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct Comment {
    pub id: String,
    pub item_id: String,
    pub author: String,
    pub is_agent: i32,
    pub body: String,
    pub created_at: String,
}

#[tauri::command]
pub async fn get_notifications(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<crate::db::notifications::Notification>, String> {
    crate::db::notifications::list_all(&pool, 100)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mark_notification_read(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<(), String> {
    crate::db::notifications::mark_read(&pool, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mark_all_notifications_read(pool: State<'_, SqlitePool>) -> Result<(), String> {
    crate::db::notifications::mark_all_read(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_unread_count(pool: State<'_, SqlitePool>) -> Result<i64, String> {
    crate::db::notifications::unread_count(&pool)
        .await
        .map_err(|e| e.to_string())
}
