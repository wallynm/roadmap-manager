use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Repo {
    pub id: String,
    pub name: String,
    pub path: String,
    pub config: String,
    pub created_at: String,
    pub last_scan: Option<String>,
}

pub async fn list(pool: &SqlitePool) -> AppResult<Vec<Repo>> {
    let repos = sqlx::query_as::<_, Repo>("SELECT * FROM repos ORDER BY name")
        .fetch_all(pool)
        .await?;
    Ok(repos)
}

pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<Repo> {
    sqlx::query_as::<_, Repo>("SELECT * FROM repos WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Repo {id} not found")))
}

pub async fn add(pool: &SqlitePool, name: &str, path: &str, config: &str) -> AppResult<Repo> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();

    sqlx::query(
        "INSERT INTO repos (id, name, path, config, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(name)
    .bind(path)
    .bind(config)
    .bind(&now)
    .execute(pool)
    .await?;

    get(pool, &id).await
}

pub async fn remove(pool: &SqlitePool, id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM repos WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn set_last_scan(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    sqlx::query("UPDATE repos SET last_scan = ? WHERE id = ?")
        .bind(&now)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}
