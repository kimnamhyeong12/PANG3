package com.fieldwork.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * work_date / scheduled_date 기능 도입 전에 생성된 기존 task 행을 자동 보정한다.
 *
 * 운영 환경은 SPRING_JPA_HIBERNATE_DDL_AUTO=update 이므로,
 * Hibernate가 컬럼을 생성한 뒤 이 Runner가 NULL 값을 한 번 보정한다.
 *
 * 새로 생성되는 Task는 Task.@PrePersist에서 실제 등록일이 들어가므로
 * 이후에는 이 UPDATE의 대상이 되지 않는다.
 */
@Component
public class TaskWorkDateBackfill implements ApplicationRunner {

    private final JdbcTemplate jdbcTemplate;

    public TaskWorkDateBackfill(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        jdbcTemplate.update("""
            UPDATE task
               SET created_at = CURRENT_TIMESTAMP
             WHERE created_at IS NULL
            """);

        jdbcTemplate.update("""
            UPDATE task
               SET work_date = created_at::date
             WHERE work_date IS NULL
            """);

        jdbcTemplate.update("""
            UPDATE task
               SET scheduled_date = work_date
             WHERE scheduled_date IS NULL
            """);
    }
}
