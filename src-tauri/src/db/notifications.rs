use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Notification {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub body: Option<String>,
    pub item_id: Option<String>,
    pub read: i32,
    pub created_at: String,
}

pub async fn list_unread(pool: &SqlitePool) -> AppResult<Vec<Notification>> {
    let notifs = sqlx::query_as::<_, Notification>(
        "SELECT * FROM notifications WHERE read = 0 ORDER BY created_at DESC LIMIT 100",
    )
    .fetch_all(pool)
    .await?;
    Ok(notifs)
}

pub async fn list_all(pool: &SqlitePool, limit: i64) -> AppResult<Vec<Notification>> {
    let notifs = sqlx::query_as::<_, Notification>(
        "SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(notifs)
}

pub async fn create(
    pool: &SqlitePool,
    kind: &str,
    title: &str,
    body: Option<&str>,
    item_id: Option<&str>,
) -> AppResult<Notification> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO notifications (id, kind, title, body, item_id) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(kind)
    .bind(title)
    .bind(body)
    .bind(item_id)
    .execute(pool)
    .await?;

    let notif = sqlx::query_as::<_, Notification>("SELECT * FROM notifications WHERE id = ?")
        .bind(&id)
        .fetch_one(pool)
        .await?;
    Ok(notif)
}

pub async fn mark_read(pool: &SqlitePool, id: &str) -> AppResult<()> {
    sqlx::query("UPDATE notifications SET read = 1 WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn mark_all_read(pool: &SqlitePool) -> AppResult<()> {
    sqlx::query("UPDATE notifications SET read = 1 WHERE read = 0")
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn unread_count(pool: &SqlitePool) -> AppResult<i64> {
    let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM notifications WHERE read = 0")
        .fetch_one(pool)
        .await?;
    Ok(row.0)
}
