package com.fieldwork.controller;
import com.fieldwork.security.CurrentUser;
import com.fieldwork.service.NavigationHandoffService;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
@RestController
@RequestMapping("/api/navigation-handoffs")
public class NavigationHandoffController {
    private final NavigationHandoffService service;
    public NavigationHandoffController(NavigationHandoffService service){this.service=service;}
    public record Input(Long groupId,Long taskId,String mode){}
    @PostMapping public Map<String,Object> create(@RequestBody Input body){return service.create(CurrentUser.id(),body.groupId(),body.taskId(),body.mode());}
    @GetMapping("/pending") public ResponseEntity<?> pending(){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.pending(CurrentUser.id()));}
    @PostMapping("/{requestId}/acknowledge") public void acknowledge(@PathVariable String requestId){service.acknowledge(CurrentUser.id(),requestId);}
}
