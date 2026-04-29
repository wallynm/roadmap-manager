CREATE TABLE kv_cache (
    repo_id    TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (repo_id, key)
);
