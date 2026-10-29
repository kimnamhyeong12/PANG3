package com.fieldwork.service;

import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class LocalReportMapsTest {
    @Test void overviewPreservesReportOrderNumberGapsAndAuthorColors() {
        var source = Map.<String, Object>of("sections", List.of(Map.of("items", List.of(
                Map.of("author", Map.of("name", "작성자 A"), "lat", 35.1, "lng", 128.9),
                Map.of("author", Map.of("name", "작성자 B")), // no coordinate: number must remain reserved
                Map.of("author", Map.of("name", "작성자 B"), "lat", 35.2, "lng", 128.8),
                Map.of("author", Map.of("name", "작성자 A"), "lat", 35.1, "lng", 128.9)))));
        var spec = LocalReportMaps.overview(source);
        var markers = (List<?>) spec.get("markers");
        assertEquals(3, markers.size());
        assertEquals(Map.of("n", 1, "lat", 35.1, "lng", 128.9, "color", "#2477F3"), markers.get(0));
        assertEquals(3, ((Map<?, ?>) markers.get(1)).get("n"));
        assertEquals("#12A9A5", ((Map<?, ?>) markers.get(1)).get("color"));
        assertEquals("#2477F3", ((Map<?, ?>) markers.get(2)).get("color"));
    }
    @Test void singleMapKeepsNumberOneAndInvalidCoordinatesDoNotFetchTiles() {
        var marker = (Map<?, ?>) ((List<?>) LocalReportMaps.single(35.1, 128.9).get("markers")).get(0);
        assertEquals(1, marker.get("n")); assertEquals("#2477F3", marker.get("color"));
        assertTrue(((List<?>) LocalReportMaps.single(Double.NaN, 128.9).get("markers")).isEmpty());
        assertTrue(((List<?>) LocalReportMaps.single(null, null).get("markers")).isEmpty());
    }
}
