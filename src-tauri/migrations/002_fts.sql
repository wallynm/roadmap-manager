CREATE VIRTUAL TABLE items_fts USING fts5(
    external_id,
    title,
    body,
    labels,
    content='items',
    content_rowid='rowid'
);

CREATE TRIGGER items_fts_insert AFTER INSERT ON items BEGIN
    INSERT INTO items_fts(rowid, external_id, title, body, labels)
    VALUES (new.rowid, new.external_id, new.title, new.body, new.labels);
END;

CREATE TRIGGER items_fts_delete AFTER DELETE ON items BEGIN
    INSERT INTO items_fts(items_fts, rowid, external_id, title, body, labels)
    VALUES ('delete', old.rowid, old.external_id, old.title, old.body, old.labels);
END;

CREATE TRIGGER items_fts_update AFTER UPDATE ON items BEGIN
    INSERT INTO items_fts(items_fts, rowid, external_id, title, body, labels)
    VALUES ('delete', old.rowid, old.external_id, old.title, old.body, old.labels);
    INSERT INTO items_fts(rowid, external_id, title, body, labels)
    VALUES (new.rowid, new.external_id, new.title, new.body, new.labels);
END;
