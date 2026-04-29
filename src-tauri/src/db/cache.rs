use sqlx::SqlitePool;

pub async fn get(pool: &SqlitePool, repo_id: &str, key: &str) -> Result<Option<String>, sqlx::Error> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT value FROM kv_cache WHERE repo_id = ? AND key = ?"
    )
    .bind(repo_id)
    .bind(key)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|(v,)| v))
}

pub async fn upsert(pool: &SqlitePool, repo_id: &str, key: &str, value: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO kv_cache (repo_id, key, value, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT (repo_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .bind(repo_id)
    .bind(key)
    .bind(value)
    .execute(pool)
    .await?;

    Ok(())
}
