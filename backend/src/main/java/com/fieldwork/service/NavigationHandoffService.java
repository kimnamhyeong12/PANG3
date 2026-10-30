package com.fieldwork.service;
import com.fieldwork.entity.NavigationHandoff;
import com.fieldwork.repository.NavigationHandoffRepository;
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
    public NavigationHandoffService(NavigationHandoffRepository requests,TaskService tasks){this.requests=requests;this.tasks=tasks;}
    private void validate(Long userId,Long groupId,Long taskId){
        if(groupId==null||taskId==null)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"방문지를 선택해 주세요.");
        tasks.requireEditor(taskId,userId);
        var task=tasks.getById(taskId);
        if(task.getGroup()==null||!groupId.equals(task.getGroup().getGroupId()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"선택한 그룹의 방문지가 아닙니다.");
        if(List.of("complete","completed","done").contains(Objects.toString(task.getTaskStatus(),"").toLowerCase(Locale.ROOT)))throw new ResponseStatusException(HttpStatus.CONFLICT,"완료한 방문지는 안내할 수 없습니다.");
        if(task.getLat()==null||task.getLng()==null||!Double.isFinite(task.getLat())||!Double.isFinite(task.getLng())||Math.abs(task.getLat())>90||Math.abs(task.getLng())>180)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"방문지 좌표를 확인해 주세요.");
    }
    public Map<String,Object> create(Long userId,Long groupId,Long taskId,String mode){
        if(!List.of("car","walk").contains(Objects.toString(mode,"")))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"안내 방식을 선택해 주세요.");
        validate(userId,groupId,taskId);
        var request=requests.findById(userId).orElseGet(NavigationHandoff::new);
        request.userId=userId;request.groupId=groupId;request.taskId=taskId;request.mode=mode;request.requestId=UUID.randomUUID().toString();request.expiresAt=Instant.now().plusSeconds(600);
        requests.saveAndFlush(request);return view(request);
    }
    public Map<String,Object> pending(Long userId){
        var found=requests.findById(userId);if(found.isEmpty())return Map.of("pending",false);
        var request=found.get();
        if(!request.expiresAt.isAfter(Instant.now())){requests.acknowledge(userId,request.requestId);return Map.of("pending",false);}
        try{validate(userId,request.groupId,request.taskId);}catch(RuntimeException invalid){requests.acknowledge(userId,request.requestId);return Map.of("pending",false);}
        return view(request);
    }
    private Map<String,Object> view(NavigationHandoff r){return Map.of("pending",true,"requestId",r.requestId,"groupId",r.groupId,"taskId",r.taskId,"mode",r.mode,"expiresAt",r.expiresAt);}
    public void acknowledge(Long userId,String requestId){requests.acknowledge(userId,requestId);}
}
