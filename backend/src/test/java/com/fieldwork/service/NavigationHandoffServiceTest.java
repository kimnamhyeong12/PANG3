package com.fieldwork.service;
import com.fieldwork.entity.*;
import com.fieldwork.repository.NavigationHandoffRepository;
import com.fieldwork.repository.UserRepository;
import com.fieldwork.repository.WorkGroupRepository;
import com.fieldwork.repository.GroupMemberRepository;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class NavigationHandoffServiceTest {
 @Mock NavigationHandoffRepository repository;
 @Mock TaskService tasks;
 @Mock UserRepository users;
 @Mock WorkGroupRepository groups;
 @Mock GroupMemberRepository members;
 NavigationHandoffService service;
 @BeforeEach void setup(){service=new NavigationHandoffService(repository,tasks,users,groups,members);}
 Task task(){var group=new WorkGroup();org.springframework.test.util.ReflectionTestUtils.setField(group,"groupId",2L);var task=new Task();task.setGroup(group);task.setLat(35.1);task.setLng(129.0);task.setTaskStatus("pending");return task;}
 NavigationHandoff request(){var r=new NavigationHandoff();r.userId=1L;r.groupId=2L;r.taskId=3L;r.mode="walk";r.requestId="request-a";r.expiresAt=Instant.now().plusSeconds(600);return r;}
 @Test void preservesModeAndExpiresInTenMinutes(){when(tasks.getById(3L)).thenReturn(task());when(repository.findById(1L)).thenReturn(Optional.empty());var result=service.create(1L,2L,3L,"walk");assertEquals("walk",result.get("mode"));assertEquals(2L,result.get("groupId"));assertTrue(((Instant)result.get("expiresAt")).isAfter(Instant.now().plusSeconds(590)));verify(tasks).requireEditor(3L,1L);verify(repository).saveAndFlush(any());}
 @Test void refusesOtherUsersTask(){doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN)).when(tasks).requireEditor(3L,1L);assertThrows(ResponseStatusException.class,()->service.create(1L,2L,3L,"car"));verifyNoInteractions(repository);}
 @Test void refusesWrongGroup(){when(tasks.getById(3L)).thenReturn(task());assertThrows(ResponseStatusException.class,()->service.create(1L,4L,3L,"walk"));verifyNoInteractions(repository);}
 @Test void refusesCompletedTask(){var task=task();task.setTaskStatus("complete");when(tasks.getById(3L)).thenReturn(task);assertThrows(ResponseStatusException.class,()->service.create(1L,2L,3L,"car"));verifyNoInteractions(repository);}
 @Test void refusesInvalidModeAndCoordinates(){assertThrows(ResponseStatusException.class,()->service.create(1L,2L,3L,"plane"));var task=task();task.setLat(Double.NaN);when(tasks.getById(3L)).thenReturn(task);assertThrows(ResponseStatusException.class,()->service.create(1L,2L,3L,"car"));verifyNoInteractions(repository);}
 @Test void expiredRequestIsNotReturned(){var request=request();request.expiresAt=Instant.now().minusSeconds(1);when(repository.findById(1L)).thenReturn(Optional.of(request));assertEquals(Map.of("pending",false),service.pending(1L));verify(repository).acknowledge(1L,"request-a");verifyNoInteractions(tasks);}
 @Test void changedAssigneeInvalidatesPendingRequest(){when(repository.findById(1L)).thenReturn(Optional.of(request()));doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN)).when(tasks).requireEditor(3L,1L);assertEquals(Map.of("pending",false),service.pending(1L));verify(repository).acknowledge(1L,"request-a");}
 @Test void acknowledgementIsScopedToUserAndRequest(){service.acknowledge(1L,"old-request");verify(repository).acknowledge(1L,"old-request");verify(repository,never()).deleteById(any());}
 User workplaceUser(){var u=new User();u.setWorkplaceLat(35.1);u.setWorkplaceLng(129.0);return u;}
 @Test void queuesOwnWorkplaceForAnotherDeviceWithoutBrowserCoordinates(){
  var user=workplaceUser();var group=new WorkGroup();when(users.findById(1L)).thenReturn(Optional.of(user));when(groups.findById(2L)).thenReturn(Optional.of(group));when(members.existsByGroupAndUser(group,user)).thenReturn(true);
  var result=service.create(1L,2L,null,"walk","workplace");
  assertEquals("workplace",result.get("destination"));assertEquals(0L,result.get("taskId"));assertEquals("walk",result.get("mode"));verifyNoInteractions(tasks);verify(repository).saveAndFlush(any());
 }
 @Test void workplaceCannotBeQueuedOutsideMembership(){
  var user=workplaceUser();var group=new WorkGroup();when(users.findById(1L)).thenReturn(Optional.of(user));when(groups.findById(2L)).thenReturn(Optional.of(group));
  assertThrows(ResponseStatusException.class,()->service.create(1L,2L,null,"car","workplace"));verifyNoInteractions(repository);
 }
 @Test void missingWorkplaceIsRejected(){
  var user=new User();var group=new WorkGroup();when(users.findById(1L)).thenReturn(Optional.of(user));when(groups.findById(2L)).thenReturn(Optional.of(group));when(members.existsByGroupAndUser(group,user)).thenReturn(true);
  assertThrows(ResponseStatusException.class,()->service.create(1L,2L,null,"car","workplace"));verifyNoInteractions(repository);
 }
 @Test void rejectsAmbiguousAndInvalidDestination(){
  assertThrows(ResponseStatusException.class,()->service.create(1L,2L,3L,"car","workplace"));
  assertThrows(ResponseStatusException.class,()->service.create(1L,2L,null,"car","elsewhere"));
  assertThrows(ResponseStatusException.class,()->service.create(1L,2L,0L,"car"));verifyNoInteractions(repository,tasks,users,groups,members);
 }
 @Test void phoneReadsPersistedWorkplaceRequestAndInvalidatesMissingWorkplace(){
  var r=request();r.taskId=0L;var user=workplaceUser();var group=new WorkGroup();
  when(repository.findById(1L)).thenReturn(Optional.of(r));when(users.findById(1L)).thenReturn(Optional.of(user));when(groups.findById(2L)).thenReturn(Optional.of(group));when(members.existsByGroupAndUser(group,user)).thenReturn(true);
  assertEquals("workplace",service.pending(1L).get("destination"));user.setWorkplaceLat(null);assertEquals(Map.of("pending",false),service.pending(1L));verify(repository).acknowledge(1L,"request-a");verifyNoInteractions(tasks);
 }
}
