CREATE TABLE repos (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    path        TEXT NOT NULL UNIQUE,
    config      TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    last_scan   TEXT
);

CREATE TABLE items (
    id              TEXT PRIMARY KEY,
    repo_id         TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    external_id     TEXT NOT NULL,
    scope           TEXT NOT NULL DEFAULT '',
    type            TEXT NOT NULL,
    title           TEXT NOT NULL,
    file_path       TEXT NOT NULL,
    file_hash       TEXT NOT NULL,
    body            TEXT NOT NULL,
    frontmatter     TEXT NOT NULL,
    status          TEXT NOT NULL,
    priority        TEXT,
    labels          TEXT NOT NULL DEFAULT '[]',
    depends_on      TEXT NOT NULL DEFAULT '[]',
    duplicate_of    TEXT,
    created_date    TEXT,
    started_date    TEXT,
    completed_date  TEXT,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(repo_id, scope, external_id),
    UNIQUE(repo_id, file_path)
);

CREATE INDEX idx_items_repo_status ON items(repo_id, status);
CREATE INDEX idx_items_scope ON items(repo_id, scope);
CREATE INDEX idx_items_priority ON items(priority);

CREATE TABLE comments (
    id          TEXT PRIMARY KEY,
    item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    author      TEXT NOT NULL,
    is_agent    INTEGER NOT NULL DEFAULT 0,
    body        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_comments_item ON comments(item_id, created_at);

CREATE TABLE agent_runs (
    id           TEXT PRIMARY KEY,
    repo_id      TEXT REFERENCES repos(id) ON DELETE SET NULL,
    item_id      TEXT REFERENCES items(id) ON DELETE SET NULL,
    trigger_type TEXT NOT NULL,
    model        TEXT NOT NULL,
    status       TEXT NOT NULL,
    prompt       TEXT NOT NULL,
    transcript   TEXT,
    output       TEXT,
    error        TEXT,
    duration_ms  INTEGER,
    cost_usd     REAL,
    started_at   TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at  TEXT
);

CREATE INDEX idx_agent_runs_item ON agent_runs(item_id);
CREATE INDEX idx_agent_runs_status ON agent_runs(status);

CREATE TABLE app_state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE notifications (
    id          TEXT PRIMARY KEY,
    kind        TEXT NOT NULL,
    title       TEXT NOT NULL,
    body        TEXT,
    item_id     TEXT REFERENCES items(id) ON DELETE CASCADE,
    read        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_notifications_unread ON notifications(read, created_at) WHERE read = 0;

CREATE TABLE views (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    repo_id     TEXT REFERENCES repos(id) ON DELETE CASCADE,
    filters     TEXT NOT NULL,
    sort        TEXT NOT NULL DEFAULT '[]',
    layout      TEXT NOT NULL DEFAULT 'kanban',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
