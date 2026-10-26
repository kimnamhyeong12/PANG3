package com.fieldwork.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fieldwork.entity.VisitDurationSnapshot;
import com.fieldwork.repository.VisitDurationSnapshotRepository;
import java.time.*;
import java.util.*;
import java.util.function.Function;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/** Active-work snapshots have no five-minute TTL. Reads never initiate provider calls. */
@Service
public class VisitDurationCache {
    public record Leg(long observedAt, double seconds) {}
    public static class Snapshot {
        @com.fasterxml.jackson.annotation.JsonIgnore public Long ownerId;
        @com.fasterxml.jackson.annotation.JsonIgnore public boolean dirty;
        @com.fasterxml.jackson.annotation.JsonIgnore public volatile boolean revoked;
        public Map<String, Leg> legs = new LinkedHashMap<>();
        public String lastGuidanceDay;
        public Map<String, Object> origin;
        public boolean originsSupported = true;
        public Snapshot() {}
        public synchronized Double get(String key) {
            Leg value = legs.get(key);
            return value == null ? null : value.seconds();
        }
        public synchronized void put(String key, double seconds, long now) {
            if (!Double.isFinite(seconds) || seconds < 0) throw new IllegalArgumentException("Invalid duration");
            legs.put(key, new Leg(now, seconds));
            dirty=true;
        }
    }
    private final VisitDurationSnapshotRepository repository;
    private final Clock clock;
    private final ObjectMapper json = new ObjectMapper();
    private final Object[] locks = new Object[64];
    private final Map<String, Snapshot> memory = new LinkedHashMap<>(128, .75f, true);
    public VisitDurationCache() { this(null, Clock.systemUTC()); }
    @Autowired public VisitDurationCache(VisitDurationSnapshotRepository repository) { this(repository, Clock.systemUTC()); }
    VisitDurationCache(VisitDurationSnapshotRepository repository, Clock clock) {
        this.repository = repository; this.clock = clock;
        Arrays.setAll(locks, i -> new Object());
    }
    public long now() { return clock.millis(); }
    public String day() { return LocalDate.now(clock.withZone(ZoneId.of("Asia/Seoul"))).toString(); }
    public void beginGuidance(Snapshot snapshot, String mode) {
        if ("car".equals(mode) && !day().equals(snapshot.lastGuidanceDay)) {
            String today=day();
            boolean removed=snapshot.legs.entrySet().removeIf(entry -> !Instant.ofEpochMilli(entry.getValue().observedAt())
                    .atZone(ZoneId.of("Asia/Seoul")).toLocalDate().toString().equals(today));
            snapshot.dirty|=removed;
        }
    }
    public static String legKey(Map<String,Object> from, Map<String,Object> to) {
        return coordinate(from) + ">" + coordinate(to);
    }
    public static String coordinate(Map<String,Object> p) {
        return Double.parseDouble(p.get("lat").toString()) + "," + Double.parseDouble(p.get("lng").toString());
    }
    public <T> T use(Long owner, String scope, String mode, String providerKey, Function<Snapshot,T> action) {
        String id = AuthSessionService.hash(owner + ":" + scope + ":" + mode + ":TIME:BROAD_FIRST:" + Objects.toString(providerKey, ""));
        synchronized (locks[Math.floorMod(id.hashCode(), locks.length)]) {
            Snapshot snapshot;
            synchronized (memory) { snapshot = memory.get(id); }
            if (snapshot == null) {
                snapshot = load(id);
                snapshot.ownerId = owner;
                synchronized (memory) {
                    memory.put(id, snapshot);
                    while (memory.size() > 128) memory.remove(memory.keySet().iterator().next());
                }
            }
            try { return action.apply(snapshot); }
            finally { save(id, owner, snapshot); }
        }
    }
    private Snapshot load(String id) {
        if (repository == null) return new Snapshot();
        var row = repository.findById(id);
        if (row.isEmpty()) return new Snapshot();
        try { return json.readValue(row.get().payload, Snapshot.class); }
        catch (Exception invalidCache) { return new Snapshot(); }
    }
    private void save(String id, Long owner, Snapshot snapshot) {
        // Coordinates not used in the current matrix are evicted first by the caller.
        synchronized (snapshot) {
            if(snapshot.revoked)return;
            while (snapshot.legs.size() > 2048) snapshot.legs.remove(snapshot.legs.keySet().iterator().next());
            if (repository == null) return;
            if (!snapshot.dirty && repository.touch(id,now())>0)return;
            try {
                var row = new VisitDurationSnapshot(); row.id = id; row.ownerId = owner;
                row.touchedAt = now(); row.payload = json.writeValueAsString(snapshot);
                repository.save(row);
                if(snapshot.revoked) {repository.deleteById(id);return;}
                snapshot.dirty=false;
                var entries = repository.recentIds(owner);
                if (entries.size() > 16) repository.deleteAllById(entries.subList(16, entries.size()));
            } catch (com.fasterxml.jackson.core.JsonProcessingException error) {
                throw new IllegalStateException("추천 캐시를 저장하지 못했습니다.", error);
            }
        }
    }
    public void clearUser(Long owner) {
        // On account deletion invalidate all process snapshots, including any restored workspace.
        synchronized (memory) {
            memory.values().removeIf(value -> {
                if(!Objects.equals(value.ownerId,owner))return false;
                value.revoked=true;return true;
            });
        }
        if (repository != null) repository.deleteByOwnerId(owner);
    }
}
