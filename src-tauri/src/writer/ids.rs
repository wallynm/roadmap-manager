use sqlx::SqlitePool;

use crate::db::items;
use crate::error::AppResult;

pub async fn next_external_id(
    pool: &SqlitePool,
    repo_id: &str,
    id_prefix: &str,
    id_padding: u32,
) -> AppResult<String> {
    items::next_external_id(pool, repo_id, id_prefix, id_padding).await
}
