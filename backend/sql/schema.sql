-- PANG3 최종 DB 스키마 (DBeaver / PostgreSQL)

CREATE TABLE IF NOT EXISTS task (
    task_id BIGSERIAL PRIMARY KEY,
    road_address VARCHAR(255),
    detail_address VARCHAR(255),
    lat FLOAT8,
    lng FLOAT8,
    task_category VARCHAR(255),
    task_status VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    work_date DATE,
    scheduled_date DATE
);

-- 기존 DB에도 안전하게 날짜 컬럼을 추가한다.
ALTER TABLE task ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE task ADD COLUMN IF NOT EXISTS work_date DATE;
ALTER TABLE task ADD COLUMN IF NOT EXISTS scheduled_date DATE;

-- 과거 데이터의 정확한 최초 등록일은 기존 스키마에 없었으므로,
-- 값이 없는 행은 마이그레이션 실행일을 기준으로 초기화한다.
UPDATE task
SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP);

-- 기존 work_date가 오늘 업무 재배치용으로 사용됐을 수 있으므로 먼저 보존한다.
UPDATE task
SET scheduled_date = COALESCE(scheduled_date, work_date, created_at::date, CURRENT_DATE);

-- work_date가 아직 없는 기존 행만 최초 등록일로 채운다.
UPDATE task
SET work_date = COALESCE(work_date, created_at::date, CURRENT_DATE);

CREATE TABLE IF NOT EXISTS task_progress (
    progress_id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL,
    latitude FLOAT8,
    longitude FLOAT8,
    location_map_image TEXT,
    field_photos JSONB,
    main_comment TEXT,
    field_memo TEXT,
    progress_status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ai_refined_content TEXT,
    report_file_path TEXT,
    CONSTRAINT fk_task_progress_task
        FOREIGN KEY (task_id) REFERENCES task(task_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_work_date ON task(work_date);
CREATE INDEX IF NOT EXISTS idx_task_scheduled_date ON task(scheduled_date);

CREATE INDEX IF NOT EXISTS idx_task_progress_task_created
    ON task_progress (task_id, created_at DESC);
