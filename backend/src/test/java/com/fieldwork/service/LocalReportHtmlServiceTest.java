package com.fieldwork.service;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class LocalReportHtmlServiceTest {
    @Test void htmlUsesSnapshotCopyAndKeepsPhotosAsAuthorizedReferences() {
        var progress = mock(ProgressReportEditService.class);
        var compiled = mock(CompiledReportService.class);
        var item = new LinkedHashMap<String, Object>(Map.of("photos", List.of(Map.of("url", "/api/files/2/photo.jpg", "comment", "설명")), "aiRefinedContent", "old AI text"));
        var snapshot = new LinkedHashMap<String, Object>(Map.of("report", Map.of("title", "합성 보고서"),
                "sections", List.of(Map.of("items", List.of(item)))));
        when(compiled.getJson(1L, 2L)).thenReturn(snapshot);
        var result = new LocalReportHtmlService(progress, compiled).descriptor("compiled", 1L, 2L);
        assertEquals("html", result.get("format"));
        assertTrue(result.toString().contains("/api/files/2/photo.jpg"));
        assertFalse(result.toString().contains("old AI text"));
        assertFalse(snapshot.containsKey("overviewMapImage"));
        assertTrue(item.containsKey("aiRefinedContent"));
        assertFalse(item.containsKey("mapImage"));
    }
    @Test void existingReadAuthorizationIsRequiredForBothReportKinds() {
        var progress = mock(ProgressReportEditService.class);
        var compiled = mock(CompiledReportService.class);
        var denied = new ResponseStatusException(HttpStatus.FORBIDDEN);
        when(progress.htmlJson(1L, 9L)).thenThrow(denied);
        when(compiled.getJson(2L, 9L)).thenThrow(denied);
        var service = new LocalReportHtmlService(progress, compiled);
        assertThrows(ResponseStatusException.class, () -> service.descriptor("progress", 1L, 9L));
        assertThrows(ResponseStatusException.class, () -> service.descriptor("compiled", 2L, 9L));
    }
}
