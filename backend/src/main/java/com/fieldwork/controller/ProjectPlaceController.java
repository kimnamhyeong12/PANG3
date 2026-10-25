package com.fieldwork.controller;
import com.fieldwork.security.CurrentUser;
import com.fieldwork.service.ProjectPlaceService;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController @RequestMapping("/api/projects/{projectId}")
public class ProjectPlaceController {
 private final ProjectPlaceService service;
 public ProjectPlaceController(ProjectPlaceService service){this.service=service;}
 @GetMapping("/places") public List<Map<String,Object>> list(@PathVariable Long projectId){return service.list(projectId,CurrentUser.id());}
 @PostMapping("/places/register") public Map<String,Object> register(@PathVariable Long projectId,@RequestBody Map<String,Object> body){return service.register(projectId,CurrentUser.require(body.get("userId")),body);}
 @PostMapping("/link-reports") public Map<String,Object> link(@PathVariable Long projectId,@RequestBody Map<String,Object> body){return service.linkReports(projectId,CurrentUser.require(body.get("userId")),body);}
}
