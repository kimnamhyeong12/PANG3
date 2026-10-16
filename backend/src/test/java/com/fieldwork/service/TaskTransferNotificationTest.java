package com.fieldwork.service;

import com.fieldwork.entity.*;
import com.fieldwork.repository.*;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

/** Standalone contract test: java -ea ...TaskTransferNotificationTest (no DB or push requests). */
public class TaskTransferNotificationTest {
    @org.junit.jupiter.api.Test
    void notificationContract() {
        main(new String[0]);
    }
    public static void main(String[] args) {
        TaskTransferRequestRepository requests = mock(TaskTransferRequestRepository.class);
        TaskRepository tasks = mock(TaskRepository.class);
        UserRepository users = mock(UserRepository.class);
        WorkGroupRepository groups = mock(WorkGroupRepository.class);
        GroupMemberRepository members = mock(GroupMemberRepository.class);
        TaskService taskService = mock(TaskService.class);
        PushNotificationService push = mock(PushNotificationService.class);
        LocationAssignmentRepository assignments = mock(LocationAssignmentRepository.class);
        TaskTransferService service = new TaskTransferService(requests, tasks, users, groups, members,
                taskService, assignments, push);
        WorkGroup group = mock(WorkGroup.class);
        User sender = mock(User.class), recipient = mock(User.class);
        when(group.getGroupId()).thenReturn(10L);
        when(sender.getUserId()).thenReturn(3L);
        when(sender.getName()).thenReturn("보낸 사람");
        when(recipient.getUserId()).thenReturn(2L);
        when(recipient.getName()).thenReturn("받는 사람");
        when(groups.findById(10L)).thenReturn(Optional.of(group));
        when(users.findById(3L)).thenReturn(Optional.of(sender));
        when(users.findById(2L)).thenReturn(Optional.of(recipient));
        when(members.existsByGroupAndUser(eq(group), any(User.class))).thenReturn(true);
        Task task = mock(Task.class);
        when(task.getTaskStatus()).thenReturn("pending");
        when(tasks.findByIdForUpdate(20L)).thenReturn(Optional.of(task));
        when(taskService.currentAssignee(task)).thenReturn(sender);
        when(taskService.getGroupLocations(10L, 3L)).thenReturn(List.of(
                Map.of("assigneeUserId", 3L, "taskId", 20L, "status", "pending")));
        when(requests.findByGroupAndSenderAndStatus(group, sender, "PENDING")).thenReturn(List.of());
        when(requests.save(any())).thenAnswer(invocation -> {
            TaskTransferRequest request = invocation.getArgument(0);
            var id = TaskTransferRequest.class.getDeclaredField("id");
            id.setAccessible(true);
            id.set(request, 30L);
            return request;
        });
        Map<String, Object> created = service.create(10L, 3L, 2L, List.of(20L), null, null, null);
        assert created.get("id").equals(30L);
        verify(push).sendToUserAfterCommit(eq(2L), anyString(), contains("1건"), eq(Map.of(
                "type", "TASK_TRANSFER_REQUESTED", "groupId", 10L, "requestId", 30L, "status", "PENDING")));
        verify(push, never()).sendToUserAfterCommit(eq(3L), anyString(), anyString(), anyMap());
        var captor = org.mockito.ArgumentCaptor.forClass(TaskTransferRequest.class);
        verify(requests).save(captor.capture());
        TaskTransferRequest request = captor.getValue();
        when(requests.findByIdForUpdate(30L)).thenReturn(Optional.of(request));
        service.respond(10L, 30L, 2L, false);
        verify(push).sendToUserAfterCommit(eq(3L), anyString(), contains("거절"), eq(Map.of(
                "type", "TASK_TRANSFER_RESPONDED", "groupId", 10L, "requestId", 30L, "status", "REJECTED")));
        clearInvocations(push);
        service.respond(10L, 30L, 2L, false);
        verifyNoInteractions(push); // Retrying the response must not send duplicate notifications.
        request.setStatus("PENDING");
        when(assignments.findByGroupAndTask(group, task)).thenReturn(Optional.empty());
        service.respond(10L, 30L, 2L, true);
        verify(task).setCurrentAssignee(recipient);
        verify(push).sendToUserAfterCommit(eq(3L), anyString(), contains("수락"), eq(Map.of(
                "type", "TASK_TRANSFER_RESPONDED", "groupId", 10L, "requestId", 30L, "status", "ACCEPTED")));
        System.out.println("Task transfer notifications: recipient, accept, reject, duplicate response passed");
    }
}
