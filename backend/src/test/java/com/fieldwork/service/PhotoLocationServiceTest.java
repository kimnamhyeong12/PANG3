package com.fieldwork.service;

import com.fieldwork.entity.Task;
import com.fieldwork.entity.TaskProgress;
import com.fieldwork.repository.TaskProgressRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PhotoLocationServiceTest {
    @TempDir Path directory;
    TaskService tasks;
    TaskProgressRepository reports;
    FileStorageService files;
    PhotoLocationService service;
    MockMultipartFile photo = new MockMultipartFile("photo", "photo.jpg", "image/jpeg", new byte[]{1});

    @BeforeEach void setup() throws Exception {
        tasks = mock(TaskService.class); reports = mock(TaskProgressRepository.class); files = mock(FileStorageService.class);
        service = new PhotoLocationService(tasks, reports, files);
        when(tasks.createFromFrontendBody(anyMap())).thenReturn(Map.of("taskId", 7L));
        when(tasks.getById(7L)).thenReturn(new Task());
        when(files.saveMultipart(eq(7L), eq("photo0"), any())).thenReturn(directory.resolve("photo.jpg").toString());
        when(reports.saveAndFlush(any(TaskProgress.class))).thenAnswer(call -> {
            TaskProgress progress = call.getArgument(0);
            ReflectionTestUtils.setField(progress, "progressId", 9L); return progress;
        });
        TransactionSynchronizationManager.initSynchronization();
    }
    @AfterEach void cleanup() { TransactionSynchronizationManager.clearSynchronization(); }

    @Test void storesChosenAddressCategoryAndBeforePhotoTogether() throws Exception {
        var result = service.create(1L, 2L, " 현장 A ", 35.1, 129.1, photo, " 부산 주소 ", "점검");
        assertEquals(7L, result.get("taskId")); assertEquals(9L, result.get("progressId"));
        verify(tasks).createFromFrontendBody(argThat(body -> body.get("detailAddress").equals("현장 A")
                && body.get("roadAddress").equals("부산 주소") && body.get("task").equals("점검") && body.get("status").equals("pending")));
        verify(reports).saveAndFlush(argThat(progress -> progress.getLocationAddress().equals("부산 주소")
                && progress.getProgressStatus().equals("pending") && progress.getFieldPhotos().get(0).get("type").equals("before")));
    }
    @Test void legacyRequestStillWorksAndRollbackRemovesPhoto() throws Exception {
        Path saved = directory.resolve("photo.jpg"); Files.write(saved, new byte[]{1});
        service.create(1L, null, "현장", 35.0, 129.0, photo);
        for (var synchronization : TransactionSynchronizationManager.getSynchronizations()) synchronization.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
        assertFalse(Files.exists(saved));
    }
    @Test void rejectsInvalidCategoryBeforeCreatingVisit() {
        assertThrows(IllegalArgumentException.class, () -> service.create(1L, 2L, "현장", 35.0, 129.0, photo, "주소", "unknown"));
        verifyNoInteractions(tasks, reports, files);
    }
}
