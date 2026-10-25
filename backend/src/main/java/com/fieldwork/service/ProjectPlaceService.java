package com.fieldwork.service;
import com.fieldwork.entity.*;
import com.fieldwork.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Service
public class ProjectPlaceService {
 private final ProjectService projects;
 private final ProjectRepository projectRepository;
 private final ProjectPlaceRepository places;
 private final TaskRepository tasks;
 private final TaskProgressRepository progress;
 private final TaskService taskService;
 public ProjectPlaceService(ProjectService projects, ProjectRepository projectRepository, ProjectPlaceRepository places,
      TaskRepository tasks, TaskProgressRepository progress, TaskService taskService) {
  this.projects=projects; this.projectRepository=projectRepository; this.places=places; this.tasks=tasks; this.progress=progress; this.taskService=taskService;
 }
 @Transactional(readOnly=true)
 public List<Map<String,Object>> list(Long id, Long userId) {
  Project project=projects.loadProject(id); projects.requireMember(project.getGroup(),userId);
  return places.findByProject_ProjectIdOrderByPlaceId(id).stream().map(p -> {
   Map<String,Object> row=new LinkedHashMap<>(); row.put("placeId",p.getPlaceId()); row.put("projectId",id); row.put("name",p.getName());
   row.put("detailAddress",p.getName()); row.put("roadAddress",p.getRoadAddress()); row.put("lat",p.getLat()); row.put("lng",p.getLng()); row.put("category",p.getCategory());
   row.put("activeTaskCount",tasks.findByProjectPlaceId(p.getPlaceId()).stream().filter(t -> !complete(t)).count()); return row;
  }).toList();
 }
 private boolean complete(Task t) { return Set.of("complete","completed","done").contains(Objects.toString(t.getTaskStatus(),"").toLowerCase()); }
 @Transactional
 public Map<String,Object> register(Long id, Long userId, Map<String,Object> body) {
  Project project=projects.loadProject(id); projects.requireMember(project.getGroup(),userId);
  if (!"ACTIVE".equals(project.getStatus())) throw new ResponseStatusException(HttpStatus.CONFLICT,"보관된 프로젝트입니다.");
  projectRepository.lockById(id).orElseThrow();
  List<ProjectPlace> all=places.lockProjectPlaces(id);
  List<Long> ids=ProjectService.parseIds(body.get("placeIds"),"placeIds");
  if (ids.isEmpty() || ids.size()>1000) throw new IllegalArgumentException("방문지를 1~1000개 선택해주세요.");
  Map<Long,ProjectPlace> byId=new HashMap<>(); all.forEach(p -> byId.put(p.getPlaceId(),p));
  if (!byId.keySet().containsAll(ids)) throw new IllegalArgumentException("프로젝트에 없는 방문지가 포함돼 있습니다.");
  List<Map<String,Object>> created=new ArrayList<>(); List<Long> skipped=new ArrayList<>();
  for (Long placeId:ids) {
   ProjectPlace p=byId.get(placeId);
   if (!Boolean.TRUE.equals(body.get("allowActive")) && tasks.findByProjectPlaceId(placeId).stream().anyMatch(t -> !complete(t))) { skipped.add(placeId); continue; }
   Map<String,Object> input=new HashMap<>(); input.put("projectId",id); input.put("projectPlaceId",placeId); input.put("groupId",project.getGroup().getGroupId()); input.put("userId",userId);
   input.put("detailAddress",p.getName()); input.put("roadAddress",p.getRoadAddress()); input.put("lat",p.getLat()); input.put("lng",p.getLng()); input.put("task",p.getCategory());
   input.put("sido",p.getSido()); input.put("sigungu",p.getSigungu()); input.put("adminDong",p.getAdminDong()); input.put("status","pending");
   created.add(taskService.createFromFrontendBody(input));
  }
  return Map.of("created",created,"skipped",skipped);
 }
 @Transactional
 public Map<String,Object> linkReports(Long id, Long userId, Map<String,Object> body) {
  Project project=projects.loadProject(id); projects.requireMember(project.getGroup(),userId);
  List<Long> ids=ProjectService.parseIds(body.get("progressIds"),"progressIds");
  if (ids.isEmpty() || ids.size()>1000) throw new IllegalArgumentException("연결할 보고서를 선택해주세요.");
  List<Long> taskIds=new ArrayList<>();
  for (Long recordId:ids) {
   TaskProgress record=progress.findById(recordId).orElseThrow(() -> new IllegalArgumentException("보고서를 찾을 수 없습니다."));
   Task task=record.getTask();
   if (task.getGroup()==null || !project.getGroup().getGroupId().equals(task.getGroup().getGroupId())) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"같은 그룹의 보고서만 연결할 수 있습니다.");
   ReportRetentionService.requireAvailable(record);
   taskIds.add(task.getTaskId());
  }
  projects.linkTasks(id,userId,taskIds.stream().distinct().toList());
  return Map.of("linked",ids);
 }
}
