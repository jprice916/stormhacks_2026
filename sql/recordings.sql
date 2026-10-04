-- TiDB starter schema for recording metadata.
-- Store media in object storage and keep its URI here; avoid large BLOBs in TiDB.
CREATE TABLE IF NOT EXISTS recordings (
    id BIGINT UNSIGNED NOT NULL AUTO_RANDOM,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    duration_seconds INT UNSIGNED NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size_bytes BIGINT UNSIGNED NOT NULL,
    storage_uri VARCHAR(2048) NOT NULL,
    PRIMARY KEY (id)
);
