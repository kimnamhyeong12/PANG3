-- Optional manual migration when Hibernate schema update is disabled.
-- Scalar, owner/workspace-scoped recommendation snapshots; no provider credentials or route geometry.
CREATE TABLE IF NOT EXISTS visit_duration_snapshot (
    id VARCHAR(64) PRIMARY KEY,
    owner_id BIGINT NOT NULL,
    touched_at BIGINT NOT NULL,
    payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visit_duration_owner
    ON visit_duration_snapshot (owner_id, touched_at);
