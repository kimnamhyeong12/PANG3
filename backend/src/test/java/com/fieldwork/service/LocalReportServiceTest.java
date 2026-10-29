package com.fieldwork.service;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class LocalReportServiceTest {
    @Test void finalizedSnapshotIsNotMutatedAndOnlyAuthorizedUrlsAreExposed() {
        var progress = mock(TaskProgressService.class);
        var compiled = mock(CompiledReportService.class);
        var renderer = mock(ReportHtmlRenderer.class);
        Map<String, Object> item = new LinkedHashMap<>(Map.of("photos", List.of(Map.of(
                "url", "/api/files/3/photo.jpg", "slot", "작업 전", "comment", "설명"))));
        Map<String, Object> snapshot = new LinkedHashMap<>(Map.of(
                "report", Map.of("title", "제목", "status", "FINAL", "version", 2),
                "project", Map.of("name", "프로젝트"),
                "sections", List.of(Map.of("items", List.of(item)))));
        when(compiled.getJson(7L, 1L)).thenReturn(snapshot);
        var result = new LocalReportService(progress, compiled, renderer).compiled(7L, 1L);
        assertEquals("compiled", result.get("kind"));
        assertFalse(snapshot.containsKey("output_path"));
        assertFalse(item.containsKey("photo_files"));
        String serialized = result.toString();
        assertTrue(serialized.contains("/api/files/3/photo.jpg"));
        assertTrue(serialized.contains("/work/assets/0.jpg"));
        verifyNoInteractions(renderer); // Descriptor creation does not render images or run Python.
    }

    @Test void individualNeverExposesServerPathsAndRejectsRemotePhotoUrls() {
        var progress = mock(TaskProgressService.class);
        var service = new LocalReportService(progress, mock(CompiledReportService.class), mock(ReportHtmlRenderer.class));
        var payload = new LinkedHashMap<String, Object>();
        payload.put("field_photos", List.of(Map.of("path", "/private/server/photo.jpg", "uri", "/api/files/5/photo.jpg", "comment", "작업 후|사진")));
        when(progress.clientReport(5L, 1L)).thenReturn(new LinkedHashMap<>(Map.of("payload", payload, "revision", "abc")));
        var result = service.individual(5L, 1L);
        assertFalse(result.toString().contains("/private/server"));
        assertEquals("abc", result.get("revision"));
        payload.put("map_image", "/api/files/5/existing-red-pin.jpg");
        var savedMap = service.individual(5L, 1L);
        var firstAsset = (Map<?, ?>) ((List<?>) savedMap.get("assets")).get(0);
        assertEquals("/api/files/5/existing-red-pin.jpg", firstAsset.get("url"));
        assertFalse(firstAsset.containsKey("map"), "Existing field-map captures must not be redrawn");
        payload.put("field_photos", List.of(Map.of("uri", "https://external.invalid/photo.jpg")));
        assertThrows(ResponseStatusException.class, () -> service.individual(5L, 1L));
    }
}
