package com.fieldwork.service;

import com.fieldwork.config.FieldworkProperties;
import com.fieldwork.entity.*;
import com.fieldwork.repository.TaskProgressRepository;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;
import org.springframework.web.server.ResponseStatusException;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReportPreparationTest {
    @TempDir Path temp;
    TaskProgressRepository repository;
    TaskProgress progress;
    AiReportService ai;
    TaskProgressService service;
    final PlatformTransactionManager manager = new AbstractPlatformTransactionManager() {
        @Override protected Object doGetTransaction() { return new Object(); }
        @Override protected void doBegin(Object transaction, TransactionDefinition definition) {}
        @Override protected void doCommit(DefaultTransactionStatus status) {}
        @Override protected void doRollback(DefaultTransactionStatus status) {}
    };
    @BeforeEach void setup() throws Exception {
        var config = new FieldworkProperties(); config.getAi().setOutputDir(temp.toString());
        ai = spy(new AiReportService(config)); repository = mock(TaskProgressRepository.class);
        var tasks = mock(TaskService.class); User owner = new User(); owner.setUserId(7L);
        Task task = new Task(); task.setTaskId(1L); task.setCurrentAssignee(owner);
        progress = new TaskProgress(); progress.setTask(task); progress.setProgressStatus("working"); progress.setFieldMemo("before");
        var id = TaskProgress.class.getDeclaredField("progressId"); id.setAccessible(true); id.set(progress, 11L);
        when(tasks.currentAssignee(task)).thenReturn(owner);
        when(repository.findById(11L)).thenReturn(Optional.of(progress));
        when(repository.findLocked(11L)).thenReturn(Optional.of(progress));
        service = new TaskProgressService(repository, tasks, new FileStorageService(config), ai, manager);
    }
    @AfterEach void stop() { ai.stop(); }
    @Test void expensiveWorkRunsWithoutTransactionAndExistingFileSkipsGeneration() throws Exception {
        String file = Files.createTempFile(temp,"ready",".hwpx").toString();
        doAnswer(invocation -> {
            assertFalse(TransactionSynchronizationManager.isActualTransactionActive());
            return Map.of("ok",true,"report_file",file);
        }).when(ai).generatePayload(anyMap(),eq(7L));
        assertNotNull(service.prepareReport(11L,7L).get("reportDownloadUrl"));
        service.prepareReport(11L,7L);
        verify(ai,times(1)).generatePayload(anyMap(),eq(7L));
    }
    @Test void editsDuringGenerationCannotPublishAnOutdatedFile() throws Exception {
        String file = Files.createTempFile(temp,"old",".hwpx").toString();
        doAnswer(invocation -> { progress.setFieldMemo("after"); return Map.of("ok",true,"report_file",file); })
                .when(ai).generatePayload(anyMap(),eq(7L));
        assertEquals(409, assertThrows(ResponseStatusException.class, () -> service.prepareReport(11L,7L)).getStatusCode().value());
        assertNull(progress.getReportFilePath());
    }
}
