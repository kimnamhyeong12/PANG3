package com.fieldwork.service;

import com.fieldwork.entity.*;
import com.fieldwork.repository.*;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class GroupMemberRemovalTest {
    WorkGroupRepository groups = mock(WorkGroupRepository.class);
    GroupMemberRepository members = mock(GroupMemberRepository.class);
    GroupInvitationRepository invitations = mock(GroupInvitationRepository.class);
    LocationAssignmentRepository assignments = mock(LocationAssignmentRepository.class);
    UserRepository users = mock(UserRepository.class);
    TaskRepository tasks = mock(TaskRepository.class);
    TaskTransferRequestRepository transfers = mock(TaskTransferRequestRepository.class);
    GroupService service = new GroupService(groups, members, invitations, assignments, users, tasks,
            transfers, mock(PushNotificationService.class), mock(PasswordEncoder.class));
    User leader = new User(), target = new User();
    WorkGroup group = new WorkGroup();
    GroupMember membership = new GroupMember();

    @BeforeEach void setup() {
        leader.setUserId(1L); target.setUserId(2L);
        group.setGroupId(7L); group.setLeader(leader); group.setPersonal(false);
        membership.setGroup(group); membership.setUser(target); membership.setRole("MEMBER");
        when(groups.lockForJoin(7L)).thenReturn(Optional.of(group));
        when(users.findById(1L)).thenReturn(Optional.of(leader));
        when(users.findById(2L)).thenReturn(Optional.of(target));
        when(members.existsByGroupAndUser(group, leader)).thenReturn(true);
        when(members.findByGroupAndUser(group, target)).thenReturn(Optional.of(membership));
    }

    @Test void leaderRemovesMemberAndCleansPendingRequestsWithoutChangingWorkHistory() {
        var sent = new TaskTransferRequest(); var received = new TaskTransferRequest();
        var ownInvite = new GroupInvitation(); ownInvite.setInviter(target); ownInvite.setStatus("PENDING");
        var otherInvite = new GroupInvitation(); otherInvite.setInviter(leader); otherInvite.setStatus("PENDING");
        when(transfers.findByGroupAndSenderAndStatus(group, target, "PENDING")).thenReturn(List.of(sent));
        when(transfers.findByGroupAndRecipientAndStatus(group, target, "PENDING")).thenReturn(List.of(received));
        when(invitations.findByGroupAndStatus(group, "PENDING")).thenReturn(List.of(ownInvite, otherInvite));
        assertEquals(2L, service.removeMember(7L, 1L, 2L).get("removedUserId"));
        verify(members).delete(membership);
        assertEquals("REJECTED", sent.getStatus()); assertNotNull(sent.getRespondedAt());
        assertEquals("REJECTED", received.getStatus()); assertEquals("REJECTED", ownInvite.getStatus());
        assertEquals("PENDING", otherInvite.getStatus()); assertSame(leader, group.getLeader());
        verifyNoInteractions(tasks, assignments);
    }

    @Test void ordinaryMemberCannotRemoveAnotherMember() {
        var error = assertThrows(ResponseStatusException.class, () -> service.removeMember(7L, 2L, 1L));
        assertEquals(403, error.getStatusCode().value()); verify(members, never()).delete(any());
        verifyNoInteractions(transfers, invitations, tasks, assignments);
    }

    @Test void formerLeaderWithoutMembershipCannotRemoveMembers() {
        when(members.existsByGroupAndUser(group, leader)).thenReturn(false);
        assertThrows(ResponseStatusException.class, () -> service.removeMember(7L, 1L, 2L));
        verify(members, never()).delete(any());
    }

    @Test void leaderMustUseLeaveForSelf() {
        assertThrows(IllegalArgumentException.class, () -> service.removeMember(7L, 1L, 1L));
        verify(members, never()).delete(any()); verifyNoInteractions(transfers, invitations);
    }

    @Test void personalWorkspaceCannotBeModifiedByRemoval() {
        group.setPersonal(true);
        assertThrows(IllegalArgumentException.class, () -> service.removeMember(7L, 1L, 2L));
        verify(members, never()).delete(any());
    }

    @Test void nonmemberCannotBeRemovedOrHaveRequestsChanged() {
        when(members.findByGroupAndUser(group, target)).thenReturn(Optional.empty());
        assertThrows(RuntimeException.class, () -> service.removeMember(7L, 1L, 2L));
        verify(members, never()).delete(any()); verifyNoInteractions(transfers, invitations);
    }
}
