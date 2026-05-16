package com.fieldwork.controller;

import com.fieldwork.entity.Task;
import com.fieldwork.service.TaskService;

import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/tasks")
@CrossOrigin("*")
public class TaskController {

    private final TaskService service;

    public TaskController(TaskService service){
        this.service = service;
        System.out.println("adfdfas");
    }

    @GetMapping
    public List<Task> getLocations(){
        return service.getAllTasks();
    }


    @PostMapping
    public Task createLocation(
            @RequestBody Task task
    ){
        return service.saveTask(task);
    }

}