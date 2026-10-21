package com.fieldwork.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.boot.autoconfigure.orm.jpa.EntityManagerFactoryDependsOnPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;

/**
 * 프로젝트 · 통합 보고서 테이블을 서버가 켜질 때 자동으로 만든다 (DB 관리자가 따로 SQL 을 돌릴 필요 없음).
 *
 * 운영은 SPRING_JPA_HIBERNATE_DDL_AUTO=update 라 Hibernate 도 테이블을 만들지만,
 * 부분 유니크 인덱스(초안 하나만)와 ON DELETE CASCADE 는 만들지 못한다.
 * 그래서 Hibernate 보다 먼저 db/project_report_schema.sql 을 실행한다.
 *
 * - PostgreSQL 에서만 실행 (로컬 H2 테스트는 Hibernate 가 만든다)
 * - 기본 테이블(users·work_groups·task·task_progress)이 아직 없으면(새 DB) 건너뛴다. 다음 재시작 때 적용된다
 * - 모든 문장이 IF NOT EXISTS 라 매번 켜질 때 실행해도 기존 데이터·회원은 그대로다
 */
@Configuration
public class ProjectReportSchema {
    private static final Logger log = LoggerFactory.getLogger(ProjectReportSchema.class);
    private static final String[] BASE_TABLES = {"users", "work_groups", "task", "task_progress"};

    @Bean
    public InitializingBean projectReportSchemaMigration(DataSource dataSource) {
        return () -> apply(dataSource);
    }

    /** JPA(Hibernate) 가 뜨기 전에 위 마이그레이션이 먼저 끝나도록 순서를 건다. */
    @Bean
    public static EntityManagerFactoryDependsOnPostProcessor projectReportSchemaFirst() {
        return new EntityManagerFactoryDependsOnPostProcessor("projectReportSchemaMigration");
    }

    static void apply(DataSource dataSource) throws Exception {
        try (Connection connection = dataSource.getConnection()) {
            if (!"PostgreSQL".equalsIgnoreCase(connection.getMetaData().getDatabaseProductName())) return;
            for (String table : BASE_TABLES) {
                if (!exists(connection, table)) {
                    log.info("프로젝트 보고서 테이블 준비 건너뜀: 기본 테이블 {} 이 아직 없음 (새 DB)", table);
                    return;
                }
            }
            boolean autoCommit = connection.getAutoCommit();
            connection.setAutoCommit(false);
            try {
                ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/project_report_schema.sql"));
                connection.commit();
                log.info("프로젝트 보고서 테이블 준비 완료");
            } catch (Exception ex) {
                connection.rollback();
                throw ex;
            } finally {
                connection.setAutoCommit(autoCommit);
            }
        }
    }

    private static boolean exists(Connection connection, String table) throws Exception {
        try (Statement statement = connection.createStatement();
             ResultSet rows = statement.executeQuery("SELECT to_regclass('public." + table + "') IS NOT NULL")) {
            return rows.next() && rows.getBoolean(1);
        }
    }
}
