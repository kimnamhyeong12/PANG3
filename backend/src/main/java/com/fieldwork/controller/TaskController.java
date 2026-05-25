package com.fieldwork.controller;

import com.fieldwork.entity.Location;
import com.fieldwork.entity.Task;
import com.fieldwork.service.TaskService;

import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/locations")
@CrossOrigin("*")
public class TaskController {

    private final TaskService service;

    public TaskController(TaskService service){
        this.service = service;
    }

    @GetMapping
    public List<Task> getAllTasks(){
        return service.getAllTasks();
    }

    @GetMapping("/status/{status}")
    public List<Task> getStatusTasks(@PathVariable String status) { return service.getStatusTasks(status); }

    @PostMapping
    public Task createTask(
            @RequestBody Task task
    ){
        return service.saveTask(task);
    }
    @PatchMapping("/{id}/status")
    public Task updateStatus(
            @PathVariable Long id,
            @RequestBody Task task
    ) {
        return service.updateStatus(id, task.getStatus());
    }
}