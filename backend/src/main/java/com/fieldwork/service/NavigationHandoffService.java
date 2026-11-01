package com.fieldwork.service;
import com.fieldwork.entity.NavigationHandoff;
import com.fieldwork.repository.NavigationHandoffRepository;
import com.fieldwork.repository.UserRepository;
import com.fieldwork.repository.WorkGroupRepository;
import com.fieldwork.repository.GroupMemberRepository;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
public class NavigationHandoffService {
    private final NavigationHandoffRepository requests;
    private final TaskService tasks;
    private final UserRepository users;
    private final WorkGroupRepository groups;
    private final GroupMemberRepository members;
    // Zero is reserved internally for the account's workplace; task IDs are positive.
    private static final long WORKPLACE = 0L;
    public NavigationHandoffService(NavigationHandoffRepository requests,TaskService tasks,UserRepository users,WorkGroupRepository groups,GroupMemberRepository members){this.requests=requests;this.tasks=tasks;this.users=users;this.groups=groups;this.members=members;}
    private void validateWorkplace(Long userId,Long groupId){
        if(groupId==null)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"업무공간을 선택해 주세요.");
        var user=users.findById(userId).filter(u->!"DELETED".equals(u.getRole())).orElseThrow(()->new ResponseStatusException(HttpStatus.UNAUTHORIZED,"다시 로그인해 주세요."));
        var group=groups.findById(groupId).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"업무공간을 찾을 수 없습니다."));
        if(!members.existsByGroupAndUser(group,user))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"그룹 구성원이 아닙니다.");
        var lat=user.getWorkplaceLat();var lng=user.getWorkplaceLng();
        if(lat==null||lng==null||!Double.isFinite(lat)||!Double.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"근무지를 먼저 등록해 주세요.");
    }
    private void validate(Long userId,Long groupId,Long taskId){
        if(groupId==null||taskId==null||taskId<=0)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"방문지를 선택해 주세요.");
        tasks.requireEditor(taskId,userId);
        var task=tasks.getById(taskId);
        if(task.getGroup()==null||!groupId.equals(task.getGroup().getGroupId()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"선택한 그룹의 방문지가 아닙니다.");
        if(List.of("complete","completed","done").contains(Objects.toString(task.getTaskStatus(),"").toLowerCase(Locale.ROOT)))throw new ResponseStatusException(HttpStatus.CONFLICT,"완료한 방문지는 안내할 수 없습니다.");
        if(task.getLat()==null||task.getLng()==null||!Double.isFinite(task.getLat())||!Double.isFinite(task.getLng())||Math.abs(task.getLat())>90||Math.abs(task.getLng())>180)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"방문지 좌표를 확인해 주세요.");
    }
    public Map<String,Object> create(Long userId,Long groupId,Long taskId,String mode){
        return create(userId,groupId,taskId,mode,null);
    }
    public Map<String,Object> create(Long userId,Long groupId,Long taskId,String mode,String destination){
        if(!List.of("car","walk").contains(Objects.toString(mode,"")))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"안내 방식을 선택해 주세요.");
        if(destination!=null&&!List.of("task","workplace").contains(destination))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"안내 목적지를 확인해 주세요.");
        boolean workplace="workplace".equals(destination);
        if(workplace){if(taskId!=null)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"안내 목적지를 확인해 주세요.");validateWorkplace(userId,groupId);taskId=WORKPLACE;}
        else validate(userId,groupId,taskId);
        var request=requests.findById(userId).orElseGet(NavigationHandoff::new);
        request.userId=userId;request.groupId=groupId;request.taskId=taskId;request.mode=mode;request.requestId=UUID.randomUUID().toString();request.expiresAt=Instant.now().plusSeconds(600);
        requests.saveAndFlush(request);return view(request);
    }
    public Map<String,Object> pending(Long userId){
        var found=requests.findById(userId);if(found.isEmpty())return Map.of("pending",false);
        var request=found.get();
        if(!request.expiresAt.isAfter(Instant.now())){requests.acknowledge(userId,request.requestId);return Map.of("pending",false);}
        try{if(Long.valueOf(WORKPLACE).equals(request.taskId))validateWorkplace(userId,request.groupId);else validate(userId,request.groupId,request.taskId);}catch(RuntimeException invalid){requests.acknowledge(userId,request.requestId);return Map.of("pending",false);}
        return view(request);
    }
    private Map<String,Object> view(NavigationHandoff r){return Map.of("pending",true,"requestId",r.requestId,"groupId",r.groupId,"taskId",r.taskId,"destination",Long.valueOf(WORKPLACE).equals(r.taskId)?"workplace":"task","mode",r.mode,"expiresAt",r.expiresAt);}
    public void acknowledge(Long userId,String requestId){requests.acknowledge(userId,requestId);}
}
