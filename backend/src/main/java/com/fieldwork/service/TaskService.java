package com.fieldwork.service;

import com.fieldwork.entity.Task;
import com.fieldwork.repository.TaskRepository;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class TaskService {

    private final TaskRepository repo;

    public TaskService(TaskRepository repo){
        this.repo = repo;
    }

    public List<Task> getAllTasks(){
        return repo.findAll();
    }

    public Task saveTask(Task task){
        return repo.save(task);
    }
}