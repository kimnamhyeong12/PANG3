package com.fieldwork.service;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.server.ResponseStatusException;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;

@Timeout(15)
class ReportGenerationCoordinatorTest {
    @TempDir Path temp;
    Map<String, Object> result() throws Exception { return Map.of("ok", true, "report_file", Files.createTempFile(temp, "report", ".hwpx").toString()); }

    @Test void simultaneousAndRepeatedRequestsShareAFileButDeletedFilesAreRegenerated() throws Exception {
        try (var generator = new ReportGenerationCoordinator(2, 2)) {
            var requests = Executors.newFixedThreadPool(2);
            var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
            var calls = new AtomicInteger();
            Callable<Map<String, Object>> action = () -> { calls.incrementAndGet(); entered.countDown(); assertTrue(release.await(5, TimeUnit.SECONDS)); return result(); };
            try {
                var first = requests.submit(() -> generator.generate("same", 1L, action));
                assertTrue(entered.await(5, TimeUnit.SECONDS));
                var second = requests.submit(() -> generator.generate("same", 2L, action));
                release.countDown();
                var value = first.get(5, TimeUnit.SECONDS);
                assertEquals(value, second.get(5, TimeUnit.SECONDS));
                assertEquals(value, generator.generate("same", 1L, action));
                assertEquals(1, calls.get());
                Files.delete(Path.of((String) value.get("report_file")));
                generator.generate("same", 1L, action);
                assertEquals(2, calls.get());
                generator.generate("changed-content", 1L, action);
                assertEquals(3, calls.get());
            } finally { release.countDown(); requests.shutdownNow(); }
        }
    }

    @Test void serverConcurrencyAndPerUserWorkAreBoundedAndFailureCanBeRetried() throws Exception {
        try (var generator = new ReportGenerationCoordinator(1, 1)) {
            var requests = Executors.newFixedThreadPool(2);
            var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
            try {
                var first = requests.submit(() -> generator.generate("one", 1L, () -> {
                    entered.countDown(); assertTrue(release.await(5, TimeUnit.SECONDS)); return result();
                }));
                assertTrue(entered.await(5, TimeUnit.SECONDS));
                assertEquals(429, assertThrows(ResponseStatusException.class,
                        () -> generator.generate("other", 1L, this::result)).getStatusCode().value());
                var queued = requests.submit(() -> generator.generate("two", 2L, this::result));
                // A different user may queue, but cannot start a second Python job while the first is blocked.
                assertFalse(queued.isDone());
                release.countDown(); first.get(5, TimeUnit.SECONDS); queued.get(5, TimeUnit.SECONDS);
                assertThrows(IllegalStateException.class, () -> generator.generate("fail", 3L, () -> { throw new IllegalStateException(); }));
                assertNotNull(generator.generate("fail", 3L, this::result).get("report_file"));
            } finally { release.countDown(); requests.shutdownNow(); }
        }
    }
}
