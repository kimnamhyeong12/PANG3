package com.fieldwork.service;
import com.fieldwork.entity.*;
import com.fieldwork.repository.*;
import java.util.*;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(classes=ProjectReportServiceTest.TestConfig.class,properties={
 "spring.config.location=classpath:/auth-test.properties", "kakao.rest-api-key=", "KAKAO_REST_API_KEY=",
 "spring.datasource.url=jdbc:h2:mem:projectplaces;MODE=PostgreSQL;DB_CLOSE_DELAY=-1","fieldwork.report-map.enabled=false"})
@Import({TaskService.class,ProjectPlaceService.class}) @Transactional
class ProjectPlaceWorkflowTest {
 @MockitoBean GroupService groupService;
 @MockitoBean PushNotificationService notifications;
 @Autowired ProjectService projects; @Autowired ProjectPlaceService places; @Autowired TaskService taskService;
 @Autowired UserRepository users; @Autowired WorkGroupRepository groups; @Autowired GroupMemberRepository members;
 @Autowired TaskRepository tasks; @Autowired TaskProgressRepository records; @Autowired ProjectPlaceRepository destinations;
 @Autowired CompiledReportService reports;
 User leader,member,outsider; WorkGroup group; Long projectId;
 User user(){User u=new User();u.setLoginId(UUID.randomUUID().toString());u.setPassword("test");u.setName("팀원");u.setRole("USER");return users.saveAndFlush(u);}
 @BeforeEach void setup(){leader=user();member=user();outsider=user();group=new WorkGroup();group.setName("팀");group.setLeader(leader);group.setPersonal(false);groups.saveAndFlush(group);
  for(User u:List.of(leader,member)){GroupMember m=new GroupMember();m.setGroup(group);m.setUser(u);m.setRole(u==leader?"LEADER":"MEMBER");members.saveAndFlush(m);}
  projectId=((Number)projects.create(group.getGroupId(),member.getUserId(),new HashMap<>(Map.of("name","공원"))).get("projectId")).longValue(); }
 Map<String,Object> registerBody(){return new HashMap<>(Map.of("userId",member.getUserId(),"groupId",group.getGroupId(),"projectId",projectId,"detailAddress","A공원","roadAddress","부산 사하구","lat",35.1,"lng",128.9,"task","점검"));}
 Long id(Map<String,Object> row){return ((Number)row.get("taskId")).longValue();}
 @Test void repeatCreatesFreshTasksAndKeepsSavedDestination(){
  Map<String,Object> first=taskService.createFromFrontendBody(registerBody());Long taskId=id(first);Long placeId=((Number)first.get("projectPlaceId")).longValue();
  assertEquals(List.of(projectId),first.get("projectIds"));assertEquals(1,places.list(projectId,member.getUserId()).size());
  var skipped=places.register(projectId,member.getUserId(),Map.of("placeIds",List.of(placeId)));assertEquals(List.of(placeId),skipped.get("skipped"));
  taskService.updateStatus(taskId,"complete");
  var result=places.register(projectId,member.getUserId(),Map.of("placeIds",List.of(placeId)));
  var created=(List<?>)result.get("created");assertEquals(1,created.size());Map<?,?> fresh=(Map<?,?>)created.get(0);
  assertNotEquals(taskId,fresh.get("taskId"));assertEquals("pending",fresh.get("status"));assertNull(fresh.get("completedAt"));
  assertTrue(records.findByTask_TaskIdInOrderByCreatedAtDesc(List.of(((Number)fresh.get("taskId")).longValue())).isEmpty());
  assertEquals("complete",tasks.findById(taskId).orElseThrow().getTaskStatus());
  assertEquals(1,destinations.findByProject_ProjectIdOrderByPlaceId(projectId).size());
 }
 @Test void deletingTaskDoesNotDeleteSavedPlace(){var first=taskService.createFromFrontendBody(registerBody());taskService.deletePendingTask(id(first));tasks.flush();assertEquals(1,places.list(projectId,member.getUserId()).size());}
 @Test void outsideMembersAndForeignProjectCannotRegister(){
  var first=taskService.createFromFrontendBody(registerBody());Long placeId=((Number)first.get("projectPlaceId")).longValue();
  assertThrows(org.springframework.web.server.ResponseStatusException.class,()->places.list(projectId,outsider.getUserId()));
  assertThrows(org.springframework.web.server.ResponseStatusException.class,()->places.register(projectId,outsider.getUserId(),Map.of("placeIds",List.of(placeId))));
 }
 @Test void foreignProjectCannotBeAttachedAtRegistration(){
  WorkGroup other=new WorkGroup();other.setName("다른 팀");other.setLeader(member);other.setPersonal(false);groups.saveAndFlush(other);
  Long foreign=((Number)projects.create(other.getGroupId(),member.getUserId(),new HashMap<>(Map.of("name","다른 공원"))).get("projectId")).longValue();
  var body=registerBody();body.put("projectId",foreign);
  assertThrows(IllegalArgumentException.class,()->taskService.createFromFrontendBody(body));
 }
 @Test void linkingReportsDoesNotSaveDestinationAndSupportsCombinedReport(){
  var body=registerBody();body.remove("projectId");Task t=tasks.findById(id(taskService.createFromFrontendBody(body))).orElseThrow();taskService.updateStatus(t.getTaskId(),"complete");
  TaskProgress record=new TaskProgress();record.setTask(t);record.setProgressStatus("complete");record.setPerformedByUserId(member.getUserId());record=records.saveAndFlush(record);
  places.linkReports(projectId,member.getUserId(),Map.of("progressIds",List.of(record.getProgressId())));
  places.linkReports(projectId,member.getUserId(),Map.of("progressIds",List.of(record.getProgressId())));
  assertEquals(1,projects.tasks(projectId,member.getUserId()).size());assertTrue(places.list(projectId,member.getUserId()).isEmpty());
  Long reportId=((Number)reports.create(projectId,member.getUserId(),new HashMap<>(Map.of("title","결과"))).get("reportId")).longValue();
  assertEquals(List.of(record.getProgressId()),reports.addItems(reportId,member.getUserId(),List.of(record.getProgressId())).get("added"));
 }
 @Test void completedTaskCanBeReopenedExplicitly(){Long id=id(taskService.createFromFrontendBody(registerBody()));taskService.updateStatus(id,"complete");assertNotNull(tasks.findById(id).orElseThrow().getCompletedAt());taskService.updateStatus(id,"pending");assertEquals("pending",tasks.findById(id).orElseThrow().getTaskStatus());assertNull(tasks.findById(id).orElseThrow().getCompletedAt());}
}
