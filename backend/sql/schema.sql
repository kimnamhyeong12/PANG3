-- PANG3 최종 DB 스키마 (DBeaver / PostgreSQL)

CREATE TABLE IF NOT EXISTS task (
    task_id BIGSERIAL PRIMARY KEY,
    road_address VARCHAR(255),
    detail_address VARCHAR(255),
    lat FLOAT8,
    lng FLOAT8,
    task_category VARCHAR(255),
    task_status VARCHAR(255)
);

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

CREATE INDEX IF NOT EXISTS idx_task_progress_task_created
    ON task_progress (task_id, created_at DESC);
