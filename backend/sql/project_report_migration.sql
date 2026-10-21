-- Project + compiled report (feature/project-report). Apply with a DB backup before deploying the matching server.
BEGIN;
CREATE TABLE IF NOT EXISTS projects (
    project_id bigserial PRIMARY KEY,
    group_id bigint NOT NULL REFERENCES work_groups(group_id),
    name varchar(100) NOT NULL,
    start_date date,
    end_date date,
    status varchar(20) NOT NULL DEFAULT 'ACTIVE',
    created_by_user_id bigint REFERENCES users(user_id),
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp
);
CREATE INDEX IF NOT EXISTS idx_projects_group ON projects(group_id);

ALTER TABLE task ADD COLUMN IF NOT EXISTS project_id bigint REFERENCES projects(project_id);
CREATE INDEX IF NOT EXISTS idx_task_project ON task(project_id);

CREATE TABLE IF NOT EXISTS compiled_reports (
    report_id bigserial PRIMARY KEY,
    project_id bigint NOT NULL REFERENCES projects(project_id),
    title varchar(200) NOT NULL,
    group_by varchar(20) NOT NULL DEFAULT 'adminDong',
    status varchar(20) NOT NULL DEFAULT 'DRAFT',
    version integer NOT NULL DEFAULT 1,
    root_report_id bigint,
    snapshot_json jsonb,
    created_by_user_id bigint REFERENCES users(user_id),
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp,
    finalized_at timestamp,
    finalized_by_user_id bigint REFERENCES users(user_id)
);
ALTER TABLE compiled_reports ADD COLUMN IF NOT EXISTS finalized_by_user_id bigint REFERENCES users(user_id);
CREATE INDEX IF NOT EXISTS idx_compiled_reports_project ON compiled_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_compiled_reports_root ON compiled_reports(root_report_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_compiled_reports_root_version ON compiled_reports(root_report_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS ux_compiled_reports_one_draft ON compiled_reports(root_report_id) WHERE status = 'DRAFT';

CREATE TABLE IF NOT EXISTS compiled_report_items (
    item_id bigserial PRIMARY KEY,
    report_id bigint NOT NULL REFERENCES compiled_reports(report_id) ON DELETE CASCADE,
    progress_id bigint NOT NULL REFERENCES task_progress(progress_id) ON DELETE CASCADE,
    sort_order integer NOT NULL DEFAULT 0,
    override_comment text,
    added_by_user_id bigint,
    added_at timestamp NOT NULL DEFAULT now(),
    CONSTRAINT uk_compiled_report_items_report_progress UNIQUE (report_id, progress_id)
);
CREATE INDEX IF NOT EXISTS idx_compiled_report_items_progress ON compiled_report_items(progress_id);
COMMIT;
