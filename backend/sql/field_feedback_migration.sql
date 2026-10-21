-- Run before deploying the report name / completion time release.
ALTER TABLE task_progress ADD COLUMN IF NOT EXISTS report_name VARCHAR(120);
ALTER TABLE task_progress ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
-- Preserve the known time only for the latest completed record of a completed task.
UPDATE task_progress p SET completed_at = t.completed_at
FROM task t WHERE p.task_id = t.task_id AND p.completed_at IS NULL
  AND p.progress_status = 'complete' AND t.task_status = 'complete'
  AND p.progress_id = (SELECT p2.progress_id FROM task_progress p2 WHERE p2.task_id = t.task_id ORDER BY p2.created_at DESC, p2.progress_id DESC LIMIT 1);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_login_enabled BOOLEAN DEFAULT TRUE;
CREATE TABLE IF NOT EXISTS social_identities (
    id BIGSERIAL PRIMARY KEY,
    provider VARCHAR(16) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(user_id),
    UNIQUE (provider, subject),
    UNIQUE (user_id, provider)
);
