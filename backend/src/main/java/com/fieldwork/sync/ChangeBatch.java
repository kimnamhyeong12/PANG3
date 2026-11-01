package com.fieldwork.sync;

import java.util.*;

/** Identifiers only: never put report contents, passwords or draft fields on the stream. */
public class ChangeBatch {
    public String id = UUID.randomUUID().toString();
    public Set<String> topics = new LinkedHashSet<>();
    public Set<Long> groups = new LinkedHashSet<>(), users = new LinkedHashSet<>(), tasks = new LinkedHashSet<>();
    public Set<Long> projects = new LinkedHashSet<>(), reports = new LinkedHashSet<>(), progress = new LinkedHashSet<>();
    public boolean allUsers, taskReset;
    public void merge(ChangeBatch b) {
        topics.addAll(b.topics); groups.addAll(b.groups); users.addAll(b.users); tasks.addAll(b.tasks);
        projects.addAll(b.projects); reports.addAll(b.reports); progress.addAll(b.progress);
        allUsers |= b.allUsers; taskReset |= b.taskReset;
        if (tasks.size() > 128) { tasks.clear(); taskReset = true; }
    }
    public Map<String,Object> publicEvent() {
        return Map.of("id", id, "topics", topics, "groups", groups, "taskIds", taskReset ? Set.of() : tasks,
                "resetTasks", taskReset, "userIds", topics.contains("account") ? users : Set.of());
    }
}
