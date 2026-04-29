use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Item {
    pub id: String,
    pub repo_id: String,
    pub external_id: String,
    pub scope: String,
    #[sqlx(rename = "type")]
    #[serde(rename = "type")]
    pub item_type: String,
    pub title: String,
    pub file_path: String,
    pub file_hash: String,
    pub body: String,
    pub frontmatter: String,
    pub status: String,
    pub priority: Option<String>,
    pub labels: String,
    pub depends_on: String,
    pub relates_to: String,
    pub duplicate_of: Option<String>,
    pub created_date: Option<String>,
    pub started_date: Option<String>,
    pub completed_date: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct ItemFilters {
    pub status: Option<String>,
    pub priority: Option<String>,
    pub labels: Option<Vec<String>>,
    pub item_type: Option<String>,
    pub search: Option<String>,
    pub scope: Option<String>,
}

pub async fn list_by_repo(
    pool: &SqlitePool,
    repo_id: &str,
    filters: Option<&ItemFilters>,
) -> AppResult<Vec<Item>> {
    let mut query = String::from("SELECT * FROM items WHERE repo_id = ?");
    let mut binds: Vec<String> = vec![repo_id.to_string()];

    if let Some(f) = filters {
        if let Some(status) = &f.status {
            query.push_str(" AND status = ?");
            binds.push(status.clone());
        }
        if let Some(priority) = &f.priority {
            query.push_str(" AND priority = ?");
            binds.push(priority.clone());
        }
        if let Some(item_type) = &f.item_type {
            query.push_str(" AND type = ?");
            binds.push(item_type.clone());
        }
        if let Some(scope) = &f.scope {
            query.push_str(" AND scope = ?");
            binds.push(scope.clone());
        }
    }

    query.push_str(" ORDER BY CASE status WHEN 'in_progress' THEN 1 WHEN 'todo' THEN 2 WHEN 'backlog' THEN 3 WHEN 'done' THEN 4 WHEN 'canceled' THEN 5 WHEN 'duplicate' THEN 6 END, created_date ASC");

    let mut q = sqlx::query_as::<_, Item>(&query);
    for b in &binds {
        q = q.bind(b);
    }

    let items = q.fetch_all(pool).await?;
    Ok(items)
}

pub async fn search(pool: &SqlitePool, repo_id: &str, query: &str) -> AppResult<Vec<Item>> {
    let fts_query = format!("{}*", query.replace('"', ""));
    let items = sqlx::query_as::<_, Item>(
        "SELECT items.* FROM items JOIN items_fts ON items.rowid = items_fts.rowid WHERE items.repo_id = ? AND items_fts MATCH ? ORDER BY rank LIMIT 50"
    )
    .bind(repo_id)
    .bind(&fts_query)
    .fetch_all(pool)
    .await?;
    Ok(items)
}

pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<Item> {
    sqlx::query_as::<_, Item>("SELECT * FROM items WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Item {id} not found")))
}

pub async fn get_by_external_id(
    pool: &SqlitePool,
    repo_id: &str,
    external_id: &str,
) -> AppResult<Option<Item>> {
    let item = sqlx::query_as::<_, Item>(
        "SELECT * FROM items WHERE repo_id = ? AND external_id = ?",
    )
    .bind(repo_id)
    .bind(external_id)
    .fetch_optional(pool)
    .await?;
    Ok(item)
}

pub async fn get_by_path(
    pool: &SqlitePool,
    repo_id: &str,
    file_path: &str,
) -> AppResult<Option<Item>> {
    let item = sqlx::query_as::<_, Item>(
        "SELECT * FROM items WHERE repo_id = ? AND file_path = ?",
    )
    .bind(repo_id)
    .bind(file_path)
    .fetch_optional(pool)
    .await?;
    Ok(item)
}

pub async fn insert(pool: &SqlitePool, item: &Item) -> AppResult<Item> {
    sqlx::query(
        "INSERT INTO items (id, repo_id, external_id, scope, type, title, file_path, file_hash, body, frontmatter, status, priority, labels, depends_on, relates_to, duplicate_of, created_date, started_date, completed_date, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&item.id)
    .bind(&item.repo_id)
    .bind(&item.external_id)
    .bind(&item.scope)
    .bind(&item.item_type)
    .bind(&item.title)
    .bind(&item.file_path)
    .bind(&item.file_hash)
    .bind(&item.body)
    .bind(&item.frontmatter)
    .bind(&item.status)
    .bind(&item.priority)
    .bind(&item.labels)
    .bind(&item.depends_on)
    .bind(&item.relates_to)
    .bind(&item.duplicate_of)
    .bind(&item.created_date)
    .bind(&item.started_date)
    .bind(&item.completed_date)
    .bind(&item.updated_at)
    .execute(pool)
    .await?;

    get(pool, &item.id).await
}

pub async fn update(pool: &SqlitePool, item: &Item) -> AppResult<Item> {
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    sqlx::query(
        "UPDATE items SET title=?, body=?, frontmatter=?, file_hash=?, status=?, priority=?, labels=?, depends_on=?, relates_to=?, duplicate_of=?, started_date=?, completed_date=?, updated_at=? WHERE id=?"
    )
    .bind(&item.title)
    .bind(&item.body)
    .bind(&item.frontmatter)
    .bind(&item.file_hash)
    .bind(&item.status)
    .bind(&item.priority)
    .bind(&item.labels)
    .bind(&item.depends_on)
    .bind(&item.relates_to)
    .bind(&item.duplicate_of)
    .bind(&item.started_date)
    .bind(&item.completed_date)
    .bind(&now)
    .bind(&item.id)
    .execute(pool)
    .await?;

    get(pool, &item.id).await
}

pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM items WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete_by_path(pool: &SqlitePool, repo_id: &str, file_path: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM items WHERE repo_id = ? AND file_path = ?")
        .bind(repo_id)
        .bind(file_path)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn count_by_repo(pool: &SqlitePool, repo_id: &str) -> AppResult<i64> {
    let row: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM items WHERE repo_id = ? AND status NOT IN ('canceled', 'duplicate')",
    )
    .bind(repo_id)
    .fetch_one(pool)
    .await?;
    Ok(row.0)
}

pub async fn next_external_id(
    pool: &SqlitePool,
    repo_id: &str,
    id_prefix: &str,
    id_padding: u32,
) -> AppResult<String> {
    let pattern = format!("{}-%", id_prefix);
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT external_id FROM items WHERE repo_id = ? AND external_id LIKE ? ORDER BY external_id DESC LIMIT 1"
    )
    .bind(repo_id)
    .bind(&pattern)
    .fetch_optional(pool)
    .await?;

    let next_num = match row {
        Some((last_id,)) => {
            let num_str = last_id.strip_prefix(&format!("{}-", id_prefix)).unwrap_or("0");
            num_str.parse::<u32>().unwrap_or(0) + 1
        }
        None => 1,
    };

    Ok(format!("{}-{:0>width$}", id_prefix, next_num, width = id_padding as usize))
}
