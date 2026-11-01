package com.fieldwork.sync;

import java.util.*;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.event.spi.*;
import org.hibernate.event.service.spi.EventListenerRegistry;
import org.hibernate.engine.spi.SessionFactoryImplementor;
import org.hibernate.persister.entity.EntityPersister;
import org.springframework.stereotype.Component;

/** Observe persisted domain entities; rolled-back transactions never reach subscribers. */
@Component
public class EntityChanges implements PostInsertEventListener, PostUpdateEventListener, PostDeleteEventListener {
    private final ChangeHub hub;
    private final jakarta.persistence.PersistenceUnitUtil ids;
    public EntityChanges(EntityManagerFactory factory, ChangeHub hub) {
        this.hub = hub; ids = factory.getPersistenceUnitUtil();
        EventListenerRegistry registry = factory.unwrap(SessionFactoryImplementor.class).getServiceRegistry().getService(EventListenerRegistry.class);
        registry.appendListeners(EventType.POST_INSERT, this); registry.appendListeners(EventType.POST_UPDATE, this); registry.appendListeners(EventType.POST_DELETE, this);
    }
    @Override public boolean requiresPostCommitHandling(EntityPersister p) { return false; }
    @Override public void onPostInsert(PostInsertEvent e) { changed(e.getPersister(), e.getId(), e.getState()); }
    @Override public void onPostUpdate(PostUpdateEvent e) { changed(e.getPersister(), e.getId(), e.getState()); if (e.getOldState() != null) changed(e.getPersister(), e.getId(), e.getOldState()); }
    @Override public void onPostDelete(PostDeleteEvent e) { changed(e.getPersister(), e.getId(), e.getDeletedState()); }
    private void changed(EntityPersister p, Object id, Object[] state) {
        String type = p.getMappedClass().getSimpleName(); ChangeBatch b = new ChangeBatch();
        switch (type) {
            case "Task", "LocationAssignment" -> b.topics.add("tasks");
            case "TaskProgress" -> b.topics.addAll(List.of("tasks", "reports"));
            case "WorkGroup", "GroupMember" -> b.topics.addAll(List.of("groups", "tasks"));
            case "GroupInvitation", "GroupInviteLink" -> b.topics.add("groups");
            case "TaskTransferRequest" -> b.topics.add("transfers");
            case "Project", "ProjectPlace", "ProjectTask" -> b.topics.addAll(List.of("projects", "tasks"));
            case "CompiledReport", "CompiledReportItem" -> b.topics.addAll(List.of("reports", "projects"));
            case "SupportInquiry", "SupportAttachment" -> b.topics.add("support");
            case "FacilityApplication" -> b.topics.add("applications");
            case "User" -> b.topics.addAll(List.of("account", "groups", "tasks"));
            case "SocialIdentity" -> b.topics.add("account");
            case "NotificationPreference" -> b.topics.add("preferences");
            case "NavigationHandoff" -> b.topics.add("navigation");
            case "AuthSession" -> {
                int revoked = Arrays.asList(p.getPropertyNames()).indexOf("revoked");
                if (state == null || revoked < 0 || !Boolean.TRUE.equals(state[revoked])) return;
                b.topics.add("session");
            }
            case "Aed", "BusStop", "RegisteredFacility", "FacilityCategory" -> { b.topics.add("facilities"); b.allUsers = true; }
            default -> { return; }
        }
        Long key = id instanceof Number n ? n.longValue() : null;
        if (key != null) switch (type) {
            case "Task" -> b.tasks.add(key);
            case "User", "NotificationPreference", "NavigationHandoff" -> b.users.add(key);
            case "WorkGroup" -> b.groups.add(key);
            case "Project" -> b.projects.add(key);
            case "TaskProgress" -> b.progress.add(key);
            case "CompiledReport" -> b.reports.add(key);
        }
        String[] names = p.getPropertyNames();
        for (int i = 0; state != null && i < names.length; i++) {
            Object value = state[i]; if (value == null) continue;
            String relation = value.getClass().getSimpleName().split("\\$")[0];
            Long related = null;
            try { Object found = ids.getIdentifier(value); if (found instanceof Number n) related = n.longValue(); } catch (IllegalArgumentException ignored) {}
            if (related != null) switch (relation) {
                case "User" -> b.users.add(related);
                case "WorkGroup" -> { if (!type.equals("NavigationHandoff")) b.groups.add(related); }
                case "Task" -> b.tasks.add(related);
                case "Project" -> b.projects.add(related);
                case "TaskProgress" -> b.progress.add(related);
                case "CompiledReport" -> b.reports.add(related);
            }
            if (value instanceof Number n && Set.of("userId", "performedByUserId").contains(names[i])) b.users.add(n.longValue());
        }
        if (b.topics.contains("tasks") && b.tasks.isEmpty()) b.taskReset = true;
        hub.record(b);
    }
}
