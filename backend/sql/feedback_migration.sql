-- Run after taking a database backup when deploying the feedback branch.
-- Hibernate ddl-auto=update creates these columns/tables in the current deployment;
-- this script also backfills the current owner of older visits.

ALTER TABLE task ADD COLUMN IF NOT EXISTS current_assignee_user_id BIGINT;
ALTER TABLE task_progress ADD COLUMN IF NOT EXISTS performed_by_user_id BIGINT;
ALTER TABLE task_progress ADD COLUMN IF NOT EXISTS location_address VARCHAR(255);

-- An existing team assignment takes precedence over the original creator.
UPDATE task AS t
SET current_assignee_user_id = COALESCE(
    (SELECT a.assignee_id
     FROM task_assignments AS a
     JOIN work_groups AS g ON g.group_id = a.group_id
     WHERE a.task_id = t.task_id AND g.is_personal = FALSE
     ORDER BY a.assigned_at DESC, a.assignment_id DESC
     LIMIT 1),
    (SELECT a.assignee_id
     FROM task_assignments AS a
     WHERE a.task_id = t.task_id
     ORDER BY a.assigned_at DESC, a.assignment_id DESC
     LIMIT 1),
    t.created_by_user_id
)
WHERE t.current_assignee_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_task_current_assignee ON task(current_assignee_user_id);

CREATE TABLE IF NOT EXISTS task_transfer_requests (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES work_groups(group_id),
    sender_user_id BIGINT NOT NULL REFERENCES users(user_id),
    recipient_user_id BIGINT NOT NULL REFERENCES users(user_id),
    status VARCHAR(255) NOT NULL,
    requested_at TIMESTAMP NOT NULL,
    responded_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_transfer_items (
    request_id BIGINT NOT NULL REFERENCES task_transfer_requests(id),
    task_id BIGINT NOT NULL REFERENCES task(task_id),
    PRIMARY KEY (request_id, task_id)
);

-- Review these visits individually. They have no assignment or creator to infer an owner from.
SELECT task_id, detail_address, road_address, group_id
FROM task
WHERE current_assignee_user_id IS NULL
ORDER BY task_id;
