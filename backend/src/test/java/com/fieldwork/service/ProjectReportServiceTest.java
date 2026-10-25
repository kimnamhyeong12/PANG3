package com.fieldwork.service;

import com.fieldwork.config.FieldworkProperties;
import com.fieldwork.controller.CompiledReportController;
import com.fieldwork.controller.ProjectController;
import com.fieldwork.controller.ProjectExceptionHandler;
import com.fieldwork.entity.GroupMember;
import com.fieldwork.entity.Task;
import com.fieldwork.entity.TaskProgress;
import com.fieldwork.entity.User;
import com.fieldwork.entity.WorkGroup;
import com.fieldwork.repository.GroupMemberRepository;
import com.fieldwork.repository.TaskProgressRepository;
import com.fieldwork.repository.TaskRepository;
import com.fieldwork.repository.UserRepository;
import com.fieldwork.repository.WorkGroupRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(classes = ProjectReportServiceTest.TestConfig.class, properties = {
        "spring.config.location=classpath:/auth-test.properties", "kakao.rest-api-key=", "KAKAO_REST_API_KEY=",
        "spring.datasource.url=jdbc:h2:mem:projectreport;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "fieldwork.report-map.enabled=false"})
@Transactional
class ProjectReportServiceTest {
    @Configuration @EnableAutoConfiguration @EntityScan("com.fieldwork.entity") @EnableJpaRepositories("com.fieldwork.repository")
    @Import({ProjectService.class, CompiledReportService.class, ReportHtmlRenderer.class, StaticMapService.class, AdminDongService.class, CompiledReportHwpxService.class, ReportWorkGate.class, FieldworkProperties.class,
            ProjectController.class, CompiledReportController.class, ProjectExceptionHandler.class})
    static class TestConfig {}

    @Autowired ProjectService projects;
    @Autowired CompiledReportService reports;
    @Autowired UserRepository users;
    @Autowired WorkGroupRepository groups;
    @Autowired GroupMemberRepository members;
    @Autowired TaskRepository tasks;
    @Autowired TaskProgressRepository progressRepository;
    @Autowired ReportHtmlRenderer renderer;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired EntityManager em;

    User leader, member, outsider;
    WorkGroup group;
    Long projectId;

    @BeforeEach void setup() {
        leader = user("리더"); member = user("멤버"); outsider = user("외부인");
        group = group(false, leader, member);
        projectId = id(projects.create(group.getGroupId(), leader.getUserId(), new HashMap<>(Map.of(
                "name", "2026 불법광고물 정비", "startDate", "2026-01-01", "endDate", "2026-12-31"))), "projectId");
    }

    User user(String name) {
        User u = new User(); u.setLoginId("p" + UUID.randomUUID().toString().replace("-", ""));
        u.setPassword("test"); u.setName(name); u.setRole("USER"); return users.saveAndFlush(u);
    }
    WorkGroup group(boolean personal, User lead, User... others) {
        WorkGroup g = new WorkGroup(); g.setName("사하구 환경위생과"); g.setLeader(lead); g.setPersonal(personal); groups.saveAndFlush(g);
        GroupMember m = new GroupMember(); m.setGroup(g); m.setUser(lead); m.setRole("LEADER"); members.saveAndFlush(m);
        for (User u : others) { GroupMember o = new GroupMember(); o.setGroup(g); o.setUser(u); o.setRole("MEMBER"); members.saveAndFlush(o); }
        return g;
    }
    Task task(WorkGroup g, String dong, LocalDateTime completedAt) {
        Task t = new Task(); t.setGroup(g); t.setCreatedBy(leader); t.setTaskStatus("complete");
        t.setRoadAddress("부산 사하구 " + (dong == null ? "" : dong)); t.setAdminDong(dong); t.setTaskCategory("불법광고물");
        t.setCompletedAt(completedAt); t.setLat(35.1); t.setLng(128.9);
        return tasks.saveAndFlush(t);
    }
    TaskProgress progress(Task t, String status, String comment) {
        TaskProgress p = new TaskProgress(); p.setTask(t); p.setProgressStatus(status); p.setMainComment(comment);
        p.setPerformedByUserId(member.getUserId());
        p.setFieldPhotos(List.of(Map.of("path", "/nowhere/photo0.jpg", "type", "before", "comment", "작업 전|현수막")));
        return progressRepository.saveAndFlush(p);
    }
    void link(Task... list) {
        projects.linkTasks(projectId, leader.getUserId(), java.util.Arrays.stream(list).map(Task::getTaskId).toList());
    }
    Long newReport(String groupBy) {
        return id(reports.create(projectId, leader.getUserId(), new HashMap<>(Map.of("title", "상반기 결과보고", "groupBy", groupBy))), "reportId");
    }
    static Long id(Map<String, Object> map, String key) { return ((Number) map.get(key)).longValue(); }
    static void assertStatus(HttpStatus status, org.junit.jupiter.api.function.Executable call) {
        assertEquals(status.value(), assertThrows(ResponseStatusException.class, call).getStatusCode().value());
    }
    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> list(Object value) { return (List<Map<String, Object>>) value; }

    @Test void nonMemberIsForbidden() {
        Task t = task(group, "하단동", LocalDateTime.of(2026, 5, 1, 10, 0)); link(t);
        TaskProgress p = progress(t, "complete", "원본");
        Long reportId = newReport("adminDong");
        Long out = outsider.getUserId();
        assertStatus(HttpStatus.FORBIDDEN, () -> projects.list(group.getGroupId(), out));
        assertStatus(HttpStatus.FORBIDDEN, () -> projects.get(projectId, out));
        assertStatus(HttpStatus.FORBIDDEN, () -> projects.items(projectId, out, null, null, null, null));
        assertStatus(HttpStatus.FORBIDDEN, () -> reports.getJson(reportId, out));
        assertStatus(HttpStatus.FORBIDDEN, () -> reports.versions(reportId, out));
        assertStatus(HttpStatus.FORBIDDEN, () -> reports.addItems(reportId, out, List.of(p.getProgressId())));
        assertEquals(1, projects.list(group.getGroupId(), member.getUserId()).size());
    }

    @Test void taskContextListsDraftReportsForProjectTask() {
        Task linked = task(group, "하단동", null); link(linked);
        Task loose = task(group, "괴정동", null);
        Long reportId = newReport("adminDong");
        Map<String, Object> context = projects.taskContext(linked.getTaskId(), member.getUserId());
        assertEquals(projectId, ((Number) context.get("projectId")).longValue());
        List<Map<String, Object>> drafts = list(context.get("draftReports"));
        assertEquals(1, drafts.size());
        assertEquals(reportId, id(drafts.get(0), "reportId"));
        assertEquals(0L, ((Number) drafts.get(0).get("itemCount")).longValue());
        assertEquals(null, projects.taskContext(loose.getTaskId(), member.getUserId()).get("projectId"));
        assertStatus(HttpStatus.FORBIDDEN, () -> projects.taskContext(linked.getTaskId(), outsider.getUserId()));
        assertStatus(HttpStatus.NOT_FOUND, () -> projects.taskContext(-1L, member.getUserId()));
    }

    @Test void membersManageProjectsAndPersonalGroupIsRejected() {
        Map<String, Object> body = new HashMap<>(Map.of("name", "멤버 프로젝트"));
        assertEquals("공원", projects.create(group.getGroupId(), member.getUserId(), new HashMap<>(Map.of("name","공원"))).get("name"));
        assertEquals(body.get("name"), projects.update(projectId, member.getUserId(), body).get("name"));
        assertEquals("x", reports.create(projectId, member.getUserId(), new HashMap<>(Map.of("title", "x"))).get("title"));
        Task t = task(group, "하단동", null);
        assertTrue(projects.linkTasks(projectId, member.getUserId(), List.of(t.getTaskId())).containsKey("linked"));
        WorkGroup personal = group(true, leader);
        assertStatus(HttpStatus.BAD_REQUEST, () -> projects.create(personal.getGroupId(), leader.getUserId(), body));
        WorkGroup other = group(false, leader);
        Task foreign = task(other, "괴정동", null);
        assertStatus(HttpStatus.BAD_REQUEST, () -> projects.linkTasks(projectId, leader.getUserId(), List.of(foreign.getTaskId())));
        assertEquals("ARCHIVED", projects.update(projectId, leader.getUserId(), new HashMap<>(Map.of("status", "archived"))).get("status"));
    }

    @Test void addItemsDedupesAndReportsSkipReasons() {
        Task t1 = task(group, "하단동", LocalDateTime.of(2026, 5, 1, 10, 0));
        Task t2 = task(group, "하단동", null); t2.setTaskStatus("working"); tasks.saveAndFlush(t2);
        Task outside = task(group, "괴정동", LocalDateTime.of(2026, 5, 2, 10, 0));
        link(t1, t2);
        TaskProgress done = progress(t1, "complete", "완료");
        TaskProgress working = progress(t2, "working", "작업 중");
        TaskProgress foreign = progress(outside, "complete", "다른 프로젝트");
        Long reportId = newReport("adminDong");

        Map<String, Object> result = reports.addItems(reportId, member.getUserId(),
                List.of(done.getProgressId(), done.getProgressId(), working.getProgressId(), foreign.getProgressId(), 99999999L));
        assertEquals(List.of(done.getProgressId()), result.get("added"));
        Map<Long, Object> reasons = new HashMap<>();
        list(result.get("skipped")).forEach(s -> reasons.put(((Number) s.get("progressId")).longValue(), s.get("reason")));
        assertEquals("NOT_COMPLETED", reasons.get(working.getProgressId()));
        assertEquals("NOT_IN_PROJECT", reasons.get(foreign.getProgressId()));
        assertEquals("NOT_FOUND", reasons.get(99999999L));

        Map<String, Object> again = reports.addItems(reportId, member.getUserId(), List.of(done.getProgressId()));
        assertEquals(List.of(), again.get("added"));
        assertEquals("ALREADY_IN_REPORT", list(again.get("skipped")).get(0).get("reason"));

        List<Map<String, Object>> items = list(projects.items(projectId, member.getUserId(), null, null, null, null).get("items"));
        assertEquals(1, items.size());
        assertEquals(List.of(reportId), items.get(0).get("inReportIds"));
        assertEquals(1, ((Number) reports.list(projectId, member.getUserId()).get(0).get("itemCount")).intValue());
        assertStatus(HttpStatus.FORBIDDEN, () -> reports.removeItem(reportId, done.getProgressId(), outsider.getUserId()));
        reports.removeItem(reportId, done.getProgressId(), leader.getUserId());
        assertEquals(0, list(reports.getJson(reportId, member.getUserId()).get("sections")).size());
    }

    @Test void overrideNeverChangesOriginalProgress() {
        Task t = task(group, "하단동", LocalDateTime.of(2026, 5, 1, 10, 0)); link(t);
        TaskProgress p = progress(t, "complete", "현수막 3개 뗌.");
        Long reportId = newReport("adminDong");
        reports.addItems(reportId, member.getUserId(), List.of(p.getProgressId()));
        Map<String, Object> body = new HashMap<>(); body.put("overrideComment", "전봇대 불법 현수막 3매를 제거함.");
        assertStatus(HttpStatus.FORBIDDEN, () -> reports.updateItem(reportId, p.getProgressId(), outsider.getUserId(), body));
        reports.updateItem(reportId, p.getProgressId(), leader.getUserId(), body);
        em.flush(); em.clear();

        assertEquals("현수막 3개 뗌.", progressRepository.findById(p.getProgressId()).orElseThrow().getMainComment());
        Map<String, Object> item = list(list(reports.getJson(reportId, member.getUserId()).get("sections")).get(0).get("items")).get(0);
        assertEquals("전봇대 불법 현수막 3매를 제거함.", item.get("comment"));
        assertEquals(true, item.get("commentOverridden"));
        assertEquals("현수막 3개 뗌.", item.get("originalComment"));
        assertEquals("작업 전", list(item.get("photos")).get(0).get("slot"));

        Map<String, Object> revert = new HashMap<>(); revert.put("overrideComment", null);
        reports.updateItem(reportId, p.getProgressId(), leader.getUserId(), revert);
        item = list(list(reports.getJson(reportId, member.getUserId()).get("sections")).get(0).get("items")).get(0);
        assertEquals("현수막 3개 뗌.", item.get("comment"));
        assertEquals(false, item.get("commentOverridden"));
    }

    @Test void groupBySplitsSectionsAndFiltersWork() {
        Task a = task(group, "하단동", LocalDateTime.of(2026, 5, 1, 10, 0));
        Task b = task(group, "괴정동", LocalDateTime.of(2025, 11, 3, 9, 0));
        Task c = task(group, null, LocalDateTime.of(2026, 2, 7, 9, 0));
        link(a, b, c);
        List<Long> ids = List.of(progress(a, "complete", "a").getProgressId(),
                progress(b, "complete", "b").getProgressId(), progress(c, "complete", "c").getProgressId());
        Long reportId = newReport("adminDong");
        reports.addItems(reportId, member.getUserId(), ids);

        Map<String, Object> json = reports.getJson(reportId, member.getUserId());
        assertEquals(1, json.get("schemaVersion"));
        assertEquals(List.of("괴정동", "하단동", "(미지정)"),
                list(json.get("sections")).stream().map(s -> s.get("label")).toList());
        @SuppressWarnings("unchecked") Map<String, Object> summary = (Map<String, Object>) json.get("summary");
        assertEquals(3, summary.get("totalCount"));
        assertEquals(Map.of("from", "2025-11-03", "to", "2026-05-01"), summary.get("period"));

        reports.update(reportId, leader.getUserId(), new HashMap<>(Map.of("groupBy", "year")));
        json = reports.getJson(reportId, member.getUserId());
        assertEquals(List.of("2025", "2026"), list(json.get("sections")).stream().map(s -> s.get("label")).toList());
        assertEquals(2, list(json.get("sections")).get(1).get("count"));
        assertStatus(HttpStatus.BAD_REQUEST, () -> reports.update(reportId, leader.getUserId(), new HashMap<>(Map.of("groupBy", "color"))));

        Map<String, Object> filtered = projects.items(projectId, member.getUserId(), 2026, null, null, null);
        assertEquals(2, list(filtered.get("items")).size());
        assertEquals(1, list(projects.items(projectId, member.getUserId(), null, "(미지정)", null, null).get("items")).size());
        @SuppressWarnings("unchecked") Map<String, Object> filters = (Map<String, Object>) filtered.get("filters");
        assertEquals(List.of(2025, 2026), filters.get("years"));
    }

    @Test void htmlContainsTitleAndEscapesUserText() {
        Task t = task(group, "하단동", LocalDateTime.of(2026, 5, 1, 10, 0)); link(t);
        TaskProgress p = progress(t, "complete", "<script>alert(1)</script> 제거 완료");
        Long reportId = newReport("adminDong");
        reports.addItems(reportId, member.getUserId(), List.of(p.getProgressId()));
        String html = renderer.render(reports.getJson(reportId, member.getUserId()));
        assertTrue(html.startsWith("<!DOCTYPE html>"));
        assertTrue(html.contains("상반기 결과보고"));
        assertTrue(html.contains("&lt;script&gt;alert(1)&lt;/script&gt; 제거 완료"));
        assertFalse(html.contains("<script>alert(1)"));
        assertTrue(html.contains("id=\"report-map\""));
        assertTrue(html.contains("id=\"report-markers\""));
        assertTrue(html.contains("@media print"));
        assertTrue(html.contains("<tr data-n=\"1\""));      // 표 행 → 카드 이동
        assertTrue(html.contains("id=\"rp-lightbox\""));     // 사진 크게 보기
        assertFalse(html.contains("report-static-map\"><img")); // 지도 타일 끔(테스트) → 정적 위치도 없음, 표만
    }

    @SuppressWarnings("unchecked")
    static List<Object> commentsOf(Map<String, Object> json) {
        return list(json.get("sections")).stream()
                .flatMap(sec -> list(sec.get("items")).stream()).map(i -> i.get("comment")).toList();
    }

    @Test void taskLeavingProjectDropsOutOfDraftsButLinkingElsewhereKeepsItAndExpiredRecordsAreHidden() {
        Task a = task(group, "하단동", LocalDateTime.of(2026, 5, 1, 10, 0));
        Task b = task(group, "괴정동", LocalDateTime.of(2026, 5, 2, 10, 0));
        Task c = task(group, "괴정동", LocalDateTime.of(2026, 5, 3, 10, 0));
        link(a, b, c);
        TaskProgress pa = progress(a, "complete", "a"), pb = progress(b, "complete", "b"), pc = progress(c, "complete", "c");
        Long reportId = newReport("adminDong");
        reports.addItems(reportId, member.getUserId(), List.of(pa.getProgressId(), pb.getProgressId(), pc.getProgressId()));

        projects.unlinkTask(projectId, a.getTaskId(), leader.getUserId());
        Long other = id(projects.create(group.getGroupId(), leader.getUserId(), new HashMap<>(Map.of("name", "다른 사업"))), "projectId");
        projects.linkTasks(other, leader.getUserId(), List.of(b.getTaskId()));
        jdbc.update("update task_progress set created_at = ? where progress_id = ?",
                LocalDateTime.now().minusYears(2), pc.getProgressId());
        em.flush(); em.clear();

        // D28: 다른 프로젝트에 담아도 원래 프로젝트·초안에서 빠지지 않는다
        assertEquals(List.of("b"), commentsOf(reports.getJson(reportId, member.getUserId())));
        assertEquals(2, ((Number) reports.list(projectId, leader.getUserId()).get(0).get("itemCount")).intValue());
        assertEquals(1, list(projects.items(other, member.getUserId(), null, null, null, null).get("items")).size());
        assertEquals(2, list(projects.taskContext(b.getTaskId(), member.getUserId()).get("projects")).size());
        // 여러 건 해제: 연결 안 된 id 는 건너뜀, 초안에서도 빠짐
        assertEquals(List.of(b.getTaskId()), projects.unlinkTasks(projectId, leader.getUserId(), List.of(a.getTaskId(), b.getTaskId())).get("unlinked"));
        assertEquals(List.of(), commentsOf(reports.getJson(reportId, member.getUserId())));
        assertEquals(1, projects.tasks(other, member.getUserId()).size());
        assertStatus(HttpStatus.FORBIDDEN, () -> projects.unlinkTasks(other, outsider.getUserId(), List.of(b.getTaskId())));
        assertEquals("EXPIRED", list(reports.addItems(reportId, member.getUserId(), List.of(pc.getProgressId())).get("skipped")).get(0).get("reason"));
    }

    @Test void finalizedReportIsFrozenAndRenderedFromSnapshot() {
        Task t = task(group, "하단동", LocalDateTime.of(2026, 5, 1, 10, 0)); link(t);
        TaskProgress p = progress(t, "complete", "원본 문구");
        Task t2 = task(group, "하단동", LocalDateTime.of(2026, 5, 2, 10, 0)); link(t2);
        TaskProgress p2 = progress(t2, "complete", "두 번째");
        Long reportId = newReport("adminDong");
        reports.addItems(reportId, member.getUserId(), List.of(p.getProgressId()));
        assertStatus(HttpStatus.FORBIDDEN, () -> reports.finalizeReport(reportId, outsider.getUserId()));
        assertEquals("FINAL", reports.finalizeReport(reportId, leader.getUserId()).get("status"));

        Map<String, Object> body = new HashMap<>(Map.of("title", "바뀐 제목"));
        assertStatus(HttpStatus.CONFLICT, () -> reports.update(reportId, leader.getUserId(), body));
        assertStatus(HttpStatus.CONFLICT, () -> reports.addItems(reportId, member.getUserId(), List.of(p2.getProgressId())));
        assertStatus(HttpStatus.CONFLICT, () -> reports.updateItem(reportId, p.getProgressId(), leader.getUserId(), new HashMap<>(Map.of("sortOrder", 3))));
        assertStatus(HttpStatus.CONFLICT, () -> reports.removeItem(reportId, p.getProgressId(), leader.getUserId()));
        assertStatus(HttpStatus.CONFLICT, () -> reports.finalizeReport(reportId, leader.getUserId()));

        TaskProgress changed = progressRepository.findById(p.getProgressId()).orElseThrow();
        changed.setMainComment("나중에 바뀐 원본"); progressRepository.saveAndFlush(changed);
        em.clear();
        Map<String, Object> json = reports.getJson(reportId, member.getUserId());
        assertEquals(List.of("원본 문구"), commentsOf(json));
        @SuppressWarnings("unchecked") Map<String, Object> meta = (Map<String, Object>) json.get("report");
        assertEquals("FINAL", meta.get("status"));
        assertTrue(renderer.render(json).contains("원본 문구"));
    }

    @Test void reviseCopiesItemsAndOverridesIntoNextVersion() {
        Task t = task(group, "하단동", LocalDateTime.of(2026, 5, 1, 10, 0));
        Task gone = task(group, "괴정동", LocalDateTime.of(2026, 5, 2, 10, 0));
        link(t, gone);
        TaskProgress p = progress(t, "complete", "원본"), pg = progress(gone, "complete", "곧 빠짐");
        Long v1 = newReport("adminDong");
        reports.addItems(v1, member.getUserId(), List.of(p.getProgressId(), pg.getProgressId()));
        reports.updateItem(v1, p.getProgressId(), leader.getUserId(), new HashMap<>(Map.of("overrideComment", "보고서용 문구", "sortOrder", 5)));
        assertStatus(HttpStatus.CONFLICT, () -> reports.revise(v1, leader.getUserId()));
        reports.finalizeReport(v1, leader.getUserId());
        projects.unlinkTask(projectId, gone.getTaskId(), leader.getUserId());

        assertStatus(HttpStatus.FORBIDDEN, () -> reports.revise(v1, outsider.getUserId()));
        Map<String, Object> v2 = reports.revise(v1, leader.getUserId());
        assertEquals(2, v2.get("version"));
        assertEquals("DRAFT", v2.get("status"));
        assertEquals(v1, ((Number) v2.get("rootReportId")).longValue());
        assertEquals(List.of(pg.getProgressId()), v2.get("skipped"));
        Long v2Id = id(v2, "reportId");
        Map<String, Object> item = list(list(reports.getJson(v2Id, member.getUserId()).get("sections")).get(0).get("items")).get(0);
        assertEquals("보고서용 문구", item.get("comment"));
        assertEquals(5, item.get("sortOrder"));
        assertStatus(HttpStatus.CONFLICT, () -> reports.revise(v1, leader.getUserId()));

        List<Map<String, Object>> versions = reports.versions(v2Id, member.getUserId());
        assertEquals(List.of(2, 1), versions.stream().map(v -> v.get("version")).toList());
        assertEquals("리더", versions.get(1).get("finalizedBy"));
        assertEquals(null, versions.get(0).get("finalizedAt"));
    }

    @Test void cardTitleAndPhotoCaptionsAreOverriddenOnlyInReport() {
        Task t = task(group, "하단동", LocalDateTime.of(2026, 5, 1, 10, 0)); link(t);
        TaskProgress p = progress(t, "complete", "원본");
        Long reportId = newReport("adminDong");
        reports.addItems(reportId, member.getUserId(), List.of(p.getProgressId()));
        Map<String, Object> item = list(list(reports.getJson(reportId, leader.getUserId()).get("sections")).get(0).get("items")).get(0);
        assertEquals("위치도 및 현장사진(부산 사하구 하단동, 불법광고물)", item.get("title"));
        assertEquals(false, item.get("titleOverridden"));

        Map<String, Object> change = new HashMap<>();
        change.put("overrideTitle", "하단동 현수막 정비");
        change.put("overridePhotoComments", Map.of("0", "보고서용 설명"));
        assertStatus(HttpStatus.FORBIDDEN, () -> reports.updateItem(reportId, p.getProgressId(), outsider.getUserId(), change));
        reports.updateItem(reportId, p.getProgressId(), leader.getUserId(), change);
        item = list(list(reports.getJson(reportId, leader.getUserId()).get("sections")).get(0).get("items")).get(0);
        assertEquals("하단동 현수막 정비", item.get("title"));
        Map<String, Object> photo = list(item.get("photos")).get(0);
        assertEquals("보고서용 설명", photo.get("comment"));
        assertEquals("현수막", photo.get("originalComment"));
        assertEquals(true, photo.get("commentOverridden"));
        assertEquals("작업 전|현수막", progressRepository.findById(p.getProgressId()).orElseThrow().getFieldPhotos().get(0).get("comment"));
        String html = renderer.render(reports.getJson(reportId, leader.getUserId()));
        assertTrue(html.contains("하단동 현수막 정비"));
        assertFalse(html.contains("보고서용 설명")); // 사진 파일이 없으면 사진·설명은 HTML에서 빠진다
        assertTrue(html.contains("id=\"item-1\""));

        assertStatus(HttpStatus.BAD_REQUEST, () -> reports.updateItem(reportId, p.getProgressId(), leader.getUserId(),
                new HashMap<>(Map.of("overridePhotoComments", Map.of("3", "없는 사진")))));
        // 앱에서 앞에 사진이 끼어들어도 보고서용 설명은 원래 사진을 따라간다 (키 = path)
        TaskProgress reloaded = progressRepository.findById(p.getProgressId()).orElseThrow();
        reloaded.setFieldPhotos(List.of(Map.of("path", "/nowhere/new.jpg", "type", "before", "comment", "새 사진"),
                Map.of("path", "/nowhere/photo0.jpg", "type", "after", "comment", "작업 후|현수막")));
        progressRepository.saveAndFlush(reloaded);
        List<Map<String, Object>> moved = list(list(list(reports.getJson(reportId, leader.getUserId()).get("sections")).get(0).get("items")).get(0).get("photos"));
        assertEquals("새 사진", moved.get(0).get("comment"));
        assertEquals("보고서용 설명", moved.get(1).get("comment"));
        assertEquals(1, moved.get(1).get("index"));
        Map<String, Object> revert = new HashMap<>();
        revert.put("overrideTitle", "");
        revert.put("overridePhotoComments", Map.of("1", ""));
        reports.updateItem(reportId, p.getProgressId(), leader.getUserId(), revert);
        item = list(list(reports.getJson(reportId, leader.getUserId()).get("sections")).get(0).get("items")).get(0);
        assertEquals("현수막", list(item.get("photos")).get(1).get("comment"));
        assertEquals(false, item.get("titleOverridden"));
    }
}
