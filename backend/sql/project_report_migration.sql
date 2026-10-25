-- 프로젝트 · 통합 보고서 테이블 (feature/project-report).
-- ※ 따로 실행할 필요 없음: 서버가 켜질 때 자동으로 적용된다
--   (backend/src/main/resources/db/project_report_schema.sql + config/ProjectReportSchema.java).
-- 서버를 켜기 전에 DB 관리자가 직접 넣고 싶을 때만 이 파일을 쓴다. 여러 번 실행해도 안전하다.
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
CREATE INDEX IF NOT EXISTS idx_compiled_reports_project ON compiled_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_compiled_reports_root ON compiled_reports(root_report_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_compiled_reports_root_version ON compiled_reports(root_report_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS ux_compiled_reports_one_draft ON compiled_reports(root_report_id) WHERE status = 'DRAFT';

-- 보고서 기록(task_progress)이 지워지면 통합 보고서 항목도 같이 지운다
CREATE TABLE IF NOT EXISTS compiled_report_items (
    item_id bigserial PRIMARY KEY,
    report_id bigint NOT NULL REFERENCES compiled_reports(report_id) ON DELETE CASCADE,
    progress_id bigint NOT NULL REFERENCES task_progress(progress_id) ON DELETE CASCADE,
    sort_order integer NOT NULL DEFAULT 0,
    override_comment text,
    override_title varchar(200),
    override_photo_comments jsonb,
    added_by_user_id bigint,
    added_at timestamp NOT NULL DEFAULT now(),
    CONSTRAINT uk_compiled_report_items_report_progress UNIQUE (report_id, progress_id)
);
CREATE INDEX IF NOT EXISTS idx_compiled_report_items_progress ON compiled_report_items(progress_id);

-- 한 업무를 여러 프로젝트에 담기. 업무(task)가 지워지면 연결도 지운다
CREATE TABLE IF NOT EXISTS project_tasks (
    project_task_id bigserial PRIMARY KEY,
    project_id bigint NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    task_id bigint NOT NULL REFERENCES task(task_id) ON DELETE CASCADE,
    linked_at timestamp NOT NULL DEFAULT now(),
    CONSTRAINT uk_project_tasks_project_task UNIQUE (project_id, task_id)
);
CREATE INDEX IF NOT EXISTS idx_project_tasks_task ON project_tasks(task_id);
COMMIT;

-- Persistent destinations survive repeated task creation and deletion.
CREATE TABLE IF NOT EXISTS project_places (
 place_id bigserial PRIMARY KEY,
 project_id bigint NOT NULL REFERENCES projects(project_id),
 name varchar(255), road_address varchar(255), lat double precision, lng double precision,
 category varchar(255), sido varchar(255), sigungu varchar(255), admin_dong varchar(255)
);
CREATE INDEX IF NOT EXISTS idx_project_places_project ON project_places(project_id);
ALTER TABLE task ADD COLUMN IF NOT EXISTS project_place_id bigint;
CREATE INDEX IF NOT EXISTS idx_task_project_place ON task(project_place_id);
