package com.fieldwork.sync;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.*;
import java.sql.*;
import java.util.*;
import java.util.concurrent.*;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.transaction.support.*;

@Service
public class ChangeHub {
    private final JdbcTemplate jdbc;
    private final DataSource source;
    private final ObjectMapper json;
    private final TransactionTemplate isolated;
    private final Set<Client> clients = ConcurrentHashMap.newKeySet();
    private final ScheduledExecutorService timers = Executors.newSingleThreadScheduledExecutor();
    private final ExecutorService listener = Executors.newSingleThreadExecutor();
    private volatile boolean stopped, postgres, listening;
    private static final Object TX_KEY = new Object();
    private static class Client {
        final Long user; final SseEmitter stream; final long expiresAt;
        Set<Long> groups = Set.of(); String role = "";
        Client(Long user, SseEmitter stream, long expiresAt) { this.user = user; this.stream = stream; this.expiresAt = expiresAt; }
    }
    public ChangeHub(DataSource source, ObjectMapper json, org.springframework.transaction.PlatformTransactionManager manager) { this.source = source; this.jdbc = new JdbcTemplate(source); this.json = json; isolated = new TransactionTemplate(manager); isolated.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW); }
    @PostConstruct void start() {
        try (Connection c = source.getConnection()) { postgres = c.getMetaData().getDatabaseProductName().contains("PostgreSQL"); }
        catch (SQLException e) { throw new IllegalStateException("Change connection initialization failed", e); }
        if (postgres) listener.submit(this::listen); else listening = true;
        // Keep-alive comments carry no data and execute no database queries.
        timers.scheduleAtFixedRate(() -> {
            for (Client c : clients) {
                if (System.currentTimeMillis() >= c.expiresAt) { c.stream.complete(); clients.remove(c); }
                else send(c, SseEmitter.event().comment("keep-alive"));
            }
        }, 25, 25, TimeUnit.SECONDS);
        if (postgres) timers.scheduleAtFixedRate(() -> {
            try { jdbc.update("delete from sync_changes where created_at < current_timestamp - interval '1 day'"); }
            catch (Exception e) { org.slf4j.LoggerFactory.getLogger(getClass()).warn("Change outbox cleanup deferred", e); }
        }, 1, 1, TimeUnit.HOURS);
    }
    @PreDestroy void stop() { stopped = true; listening = false; clients.forEach(c -> c.stream.complete()); clients.clear(); timers.shutdownNow(); listener.shutdownNow(); }
    private void audience(Client c) {
        c.groups = new HashSet<>(jdbc.queryForList("select group_id from group_members where user_id=?", Long.class, c.user));
        List<String> roles = jdbc.queryForList("select role from users where user_id=?", String.class, c.user);
        c.role = roles.isEmpty() ? "DELETED" : Objects.toString(roles.get(0), "");
    }
    public SseEmitter connect(Long user) {
        return connect(user, Long.MAX_VALUE);
    }
    public SseEmitter connect(Long user, long expiresAt) {
        if (!listening) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE, "변경 알림 연결을 준비 중입니다.");
        SseEmitter stream = new SseEmitter(0L); Client c = new Client(user, stream, expiresAt); audience(c);
        if ("DELETED".equals(c.role)) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.UNAUTHORIZED);
        stream.onCompletion(() -> clients.remove(c)); stream.onTimeout(() -> clients.remove(c)); stream.onError(e -> clients.remove(c));
        clients.add(c);
        // Every new connection starts with reconciliation, including after process restarts.
        send(c, SseEmitter.event().name("sync").data(Map.of("topics", List.of("resync"))));
        return stream;
    }
    private void send(Client c, SseEmitter.SseEventBuilder event) {
        try { c.stream.send(event); } catch (Exception e) { clients.remove(c); c.stream.complete(); }
    }
    public void record(ChangeBatch change) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) return;
        ChangeBatch pending = (ChangeBatch) TransactionSynchronizationManager.getResource(TX_KEY);
        if (pending != null) {
            pending.merge(change);
            if (postgres) persistNotification(pending);
            return;
        }
        TransactionSynchronizationManager.bindResource(TX_KEY, change);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { if (!postgres) publish(change); }
            @Override public void afterCompletion(int status) { TransactionSynchronizationManager.unbindResourceIfPossible(TX_KEY); }
        });
        if (postgres) persistNotification(change);
    }
    private void persistNotification(ChangeBatch batch) {
        // The outbox and NOTIFY share the domain transaction. PostgreSQL releases
        // NOTIFY only after commit, including if this process dies after committing.
        // Equal payloads are coalesced to one notification per transaction.
        try {
            jdbc.update("insert into sync_changes(id,payload,created_at) values (?,?,current_timestamp) "
                    + "on conflict(id) do update set payload=excluded.payload", batch.id, json.writeValueAsString(batch));
            jdbc.queryForObject("select pg_notify('pinwork_changes', ?)", String.class, batch.id);
        } catch (Exception e) { throw new IllegalStateException("변경 사항을 저장하지 못했습니다.", e); }
    }
    private void enrich(ChangeBatch b) {
        for (Long id : b.progress) b.tasks.addAll(jdbc.queryForList("select task_id from task_progress where progress_id=?", Long.class, id));
        for (Long id : new HashSet<>(b.tasks)) b.groups.addAll(jdbc.queryForList("select group_id from task where task_id=? and group_id is not null", Long.class, id));
        for (Long id : b.reports) b.projects.addAll(jdbc.queryForList("select project_id from compiled_reports where report_id=?", Long.class, id));
        for (Long id : b.projects) b.groups.addAll(jdbc.queryForList("select group_id from projects where project_id=?", Long.class, id));
        if (b.topics.contains("account")) for (Long id : b.users) b.groups.addAll(jdbc.queryForList("select group_id from group_members where user_id=?", Long.class, id));
    }
    private void publish(ChangeBatch b) {
        try {
            // Use a separate connection: the domain transaction has already committed.
            isolated.executeWithoutResult(status -> { enrich(b);
            });
            if (!postgres) deliver(b);
        } catch (Exception e) {
            org.slf4j.LoggerFactory.getLogger(getClass()).error("Change delivery failed; reconnect clients for reconciliation", e);
            clients.forEach(c -> c.stream.complete()); clients.clear();
        }
    }
    void deliver(ChangeBatch b) {
        for (Client c : clients) {
            boolean staff = b.topics.contains("support") && Set.of("ADMIN", "SUPPORT_AGENT").contains(c.role)
                    || b.topics.contains("applications") && Set.of("ADMIN", "FACILITY_REVIEWER").contains(c.role);
            boolean member = !Collections.disjoint(c.groups, b.groups);
            if (!(b.allUsers || staff || member || b.users.contains(c.user))) continue;
            if (b.topics.contains("session") && b.users.contains(c.user)) { c.stream.complete(); clients.remove(c); continue; }
            if (b.topics.contains("groups") || b.topics.contains("account")) {
                audience(c);
                if ("DELETED".equals(c.role)) { c.stream.complete(); clients.remove(c); continue; }
            }
            send(c, SseEmitter.event().name("change").id(b.id).data(b.publicEvent()));
        }
    }
    @SuppressWarnings({"unchecked", "rawtypes"}) private void listen() {
        while (!stopped) {
            try (Connection c = source.getConnection(); Statement s = c.createStatement()) {
                c.setAutoCommit(true); s.execute("LISTEN pinwork_changes");
                Class pg = Class.forName("org.postgresql.PGConnection"); Object connection = c.unwrap(pg);
                listening = true;
                while (!stopped) {
                    Object[] notices = (Object[]) pg.getMethod("getNotifications", int.class).invoke(connection, 25_000);
                    if (notices != null) for (Object n : notices) {
                        String id = (String) n.getClass().getMethod("getParameter").invoke(n);
                        String payload = jdbc.queryForObject("select payload from sync_changes where id=?", String.class, id);
                        ChangeBatch change = json.readValue(payload, ChangeBatch.class);
                        enrich(change);
                        deliver(change);
                    }
                }
            } catch (Exception error) {
                listening = false; clients.forEach(c -> c.stream.complete()); clients.clear();
                if (!stopped) try { Thread.sleep(2000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
            }
        }
    }
}
