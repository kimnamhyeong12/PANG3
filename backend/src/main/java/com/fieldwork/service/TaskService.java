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

    public Task updateStatus(Long id, String status)
    {
        Task task = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Task not found"));
        task.setStatus(status);

        return repo.save(task);
    }
    public List<Task> getStatusTasks(String status) { return repo.findByStatus(status); }


}