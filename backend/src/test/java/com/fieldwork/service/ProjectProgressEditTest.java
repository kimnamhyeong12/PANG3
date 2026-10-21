package com.fieldwork.service;

import com.fieldwork.entity.Task;
import com.fieldwork.entity.TaskProgress;
import com.fieldwork.entity.User;
import com.fieldwork.entity.WorkGroup;
import com.fieldwork.repository.GroupMemberRepository;
import com.fieldwork.repository.TaskProgressRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 건별 보고서 편집 (D23·D27): 현재 담당자 + 리더만, 원본의 제목·본문·사진 설명만 바뀐다. */
class ProjectProgressEditTest {
    static final long ASSIGNEE = 1L, LEADER = 2L, OTHER = 3L;

    TaskProgressRepository repository = mock(TaskProgressRepository.class);
    TaskService taskService = mock(TaskService.class);
    ProjectService projectService = mock(ProjectService.class);
    GroupMemberRepository members = mock(GroupMemberRepository.class);
    ProgressReportEditService service = new ProgressReportEditService(repository, mock(TaskProgressService.class), taskService, projectService, members,
            mock(CompiledReportService.class));
    TaskProgress progress;

    @BeforeEach void setup() {
        WorkGroup group = new WorkGroup(); group.setGroupId(10L);
        Task task = new Task(); task.setTaskId(20L); task.setGroup(group);
        task.setRoadAddress("부산 사하구 하단동 492-1"); task.setTaskCategory("불법광고물");
        progress = new TaskProgress(); progress.setTask(task); progress.setMainComment("원본 본문");
        progress.setAiRefinedContent("AI 정리"); progress.setReportFilePath("/reports/old.hwpx");
        List<Map<String, Object>> photos = new ArrayList<>();
        photos.add(new HashMap<>(Map.of("path", "/up/20/a.jpg", "comment", "작업 전|현수막 2매")));
        photos.add(new HashMap<>(Map.of("path", "/up/20/b.jpg", "comment", "제거 완료")));
        progress.setFieldPhotos(photos);
        User assignee = new User(); assignee.setUserId(ASSIGNEE);
        when(taskService.currentAssignee(task)).thenReturn(assignee);
        when(members.existsByGroupAndUser(group, assignee)).thenReturn(true);
        when(projectService.isLeader(eq(group), anyLong())).thenAnswer(call -> call.getArgument(1).equals(LEADER));
        when(projectService.authorName(any(), any())).thenReturn("작성자");
        when(repository.findLocked(5L)).thenReturn(Optional.of(progress));
        when(repository.saveAndFlush(progress)).thenReturn(progress);
    }

    String revision() {
        when(repository.findById(5L)).thenReturn(Optional.of(progress));
        return (String) service.get(5L, ASSIGNEE).get("revision");
    }

    @Test void assigneeEditsTitleBodyAndCaptionsKeepingSlotPrefix() {
        Map<String, Object> body = new HashMap<>();
        body.put("expectedRevision", revision());
        body.put("reportName", "  하단동 현수막 정비 ");
        body.put("mainComment", "고친 본문");
        body.put("photoComments", Map.of("0", "현수막 3매", "1", "안내문 부착"));
        Map<String, Object> result = service.update(5L, ASSIGNEE, body);

        assertEquals("하단동 현수막 정비", progress.getReportName());
        assertEquals("고친 본문", progress.getMainComment());
        assertEquals("작업 전|현수막 3매", progress.getFieldPhotos().get(0).get("comment"));
        assertEquals("안내문 부착", progress.getFieldPhotos().get(1).get("comment"));
        assertEquals("/up/20/a.jpg", progress.getFieldPhotos().get(0).get("path"));
        assertNull(progress.getReportFilePath());
        assertNull(progress.getAiRefinedContent());
        assertEquals("위치도 및 현장사진(부산 사하구 하단동 492-1, 불법광고물)", result.get("autoTitle"));
        assertEquals(true, result.get("canEdit"));
    }

    @Test void leaderMayEditOthersMayNot() {
        String rev = revision();
        Map<String, Object> body = new HashMap<>(Map.of("expectedRevision", rev, "reportName", ""));
        service.update(5L, LEADER, body);
        assertNull(progress.getReportName());
        assertEquals("AI 정리", progress.getAiRefinedContent());
        ResponseStatusException denied = assertThrows(ResponseStatusException.class,
                () -> service.update(5L, OTHER, new HashMap<>(Map.of("expectedRevision", rev))));
        assertEquals(HttpStatus.FORBIDDEN.value(), denied.getStatusCode().value());
    }

    @Test void assigneeWhoLeftGroupMayNotEdit() {
        when(members.existsByGroupAndUser(any(), any())).thenReturn(false);
        Map<String, Object> body = new HashMap<>(Map.of("expectedRevision", revision(), "mainComment", "x"));
        assertEquals(HttpStatus.FORBIDDEN.value(), assertThrows(ResponseStatusException.class, () -> service.update(5L, ASSIGNEE, body)).getStatusCode().value());
        assertEquals("원본 본문", progress.getMainComment());
    }

    @Test void staleRevisionAndBadPhotoIndexAreRejected() {
        ResponseStatusException stale = assertThrows(ResponseStatusException.class,
                () -> service.update(5L, ASSIGNEE, new HashMap<>(Map.of("expectedRevision", "old", "mainComment", "x"))));
        assertEquals(HttpStatus.CONFLICT.value(), stale.getStatusCode().value());
        Map<String, Object> body = new HashMap<>(Map.of("expectedRevision", revision(), "photoComments", Map.of("9", "없는 사진")));
        ResponseStatusException bad = assertThrows(ResponseStatusException.class, () -> service.update(5L, ASSIGNEE, body));
        assertEquals(HttpStatus.BAD_REQUEST.value(), bad.getStatusCode().value());
        Map<String, Object> pipe = new HashMap<>(Map.of("expectedRevision", revision(), "photoComments", Map.of("1", "A|B")));
        assertEquals(HttpStatus.BAD_REQUEST.value(), assertThrows(ResponseStatusException.class, () -> service.update(5L, ASSIGNEE, pipe)).getStatusCode().value());
        verify(repository, never()).saveAndFlush(any());
        assertEquals("원본 본문", progress.getMainComment());
    }
}
