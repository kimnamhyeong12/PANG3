package com.fieldwork.service;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

/** Single-server bounded work queue. Authorization is checked by the caller on every request. */
public final class ReportGenerationCoordinator implements AutoCloseable {
    private record Cached(Map<String, Object> result, long expires) {}
    private final ThreadPoolExecutor workers;
    private final Map<String, CompletableFuture<Map<String, Object>>> flights = new HashMap<>();
    private final Map<Long, String> userJobs = new HashMap<>();
    private final Map<String, Cached> cache = new LinkedHashMap<>();
    private final Semaphore waiters = new Semaphore(32);

    public ReportGenerationCoordinator(int concurrency, int queueSize) {
        if (concurrency < 1 || concurrency > 8 || queueSize < 1 || queueSize > 32) throw new IllegalArgumentException("Invalid report worker limits");
        workers = new ThreadPoolExecutor(concurrency, concurrency, 0, TimeUnit.SECONDS,
                new ArrayBlockingQueue<>(queueSize), action -> {
                    Thread thread = new Thread(action, "report-generator"); thread.setDaemon(true); return thread;
                });
    }

    public Map<String, Object> generate(String key, Long userId, Callable<Map<String, Object>> generate) {
        CompletableFuture<Map<String, Object>> future;
        synchronized (this) {
            cache.entrySet().removeIf(entry -> entry.getValue().expires <= System.currentTimeMillis() || !available(entry.getValue().result));
            Cached cached = cache.get(key);
            if (cached != null) return new HashMap<>(cached.result);
            if (!waiters.tryAcquire()) throw busy();
            future = flights.get(key);
            if (future == null) {
                if (userJobs.containsKey(userId)) { waiters.release(); throw busy(); }
                future = new CompletableFuture<>();
                flights.put(key, future); userJobs.put(userId, key);
                CompletableFuture<Map<String, Object>> work = future;
                try {
                    workers.execute(() -> {
                        try {
                            Map<String, Object> result = new HashMap<>(generate.call());
                            if (!available(result) || !Boolean.TRUE.equals(result.get("ok")))
                                throw new IllegalStateException("보고서 파일을 만들지 못했습니다. 다시 시도해 주세요.");
                            synchronized (this) {
                                if (cache.size() >= 256) cache.remove(cache.keySet().iterator().next());
                                cache.put(key, new Cached(result, System.currentTimeMillis() + 86400000));
                                flights.remove(key, work); userJobs.remove(userId, key);
                            }
                            work.complete(result);
                        } catch (Exception error) {
                            synchronized (this) { flights.remove(key, work); userJobs.remove(userId, key); }
                            work.completeExceptionally(error);
                        }
                    });
                } catch (RejectedExecutionException error) {
                    flights.remove(key); userJobs.remove(userId); waiters.release(); throw busy();
                }
            }
        }
        try { return new HashMap<>(future.get(180, TimeUnit.SECONDS)); }
        catch (InterruptedException error) { Thread.currentThread().interrupt(); throw busy(); }
        catch (TimeoutException error) { throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "보고서를 생성 중입니다. 잠시 후 다시 요청해 주세요."); }
        catch (ExecutionException error) {
            if (error.getCause() instanceof ResponseStatusException status) throw status;
            throw new IllegalStateException("보고서 파일을 만들지 못했습니다. 다시 시도해 주세요.", error.getCause());
        } finally { waiters.release(); }
    }
    private static boolean available(Map<String, Object> result) {
        try { return result.get("report_file") instanceof String file && Files.isRegularFile(Path.of(file)); }
        catch (InvalidPathException error) { return false; }
    }
    private static ResponseStatusException busy() {
        return new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "보고서 생성 요청이 많습니다. 진행 중인 작업이 끝난 후 다시 시도해 주세요.");
    }
    @Override public void close() { workers.shutdownNow(); }
}
