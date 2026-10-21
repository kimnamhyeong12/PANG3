package com.fieldwork.service;

import com.fieldwork.config.FieldworkProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** HWPX payload builder + photo embedding, without Spring or Python. */
class ProjectHwpxPayloadTest {
    @TempDir Path uploads;

    ReportHtmlRenderer renderer() {
        FieldworkProperties properties = new FieldworkProperties();
        properties.getUpload().setBaseDir(uploads.toAbsolutePath().toString());
        return new ReportHtmlRenderer(properties, new StaticMapService(false, "", ""));
    }

    Map<String, Object> json(String photoUrl, String mapUrl) {
        Map<String, Object> photo = new LinkedHashMap<>(Map.of("slot", "작업 전", "url", photoUrl, "comment", "현수막"));
        Map<String, Object> missing = new LinkedHashMap<>(Map.of("slot", "작업 후", "url", "/api/files/55/none.jpg", "comment", ""));
        Map<String, Object> escape = new LinkedHashMap<>(Map.of("slot", "", "url", "/api/files/55/../../secret.jpg", "comment", ""));
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("progressId", 101);
        item.put("address", "하단동 492-1");
        item.put("author", Map.of("name", "김남형"));
        item.put("comment", "제거 완료");
        item.put("photos", new ArrayList<>(List.of(photo, missing, escape)));
        item.put("locationMapImage", mapUrl);
        Map<String, Object> section = new LinkedHashMap<>(Map.of("key", "하단동", "label", "하단동", "count", 1));
        section.put("items", new ArrayList<>(List.of(item)));
        Map<String, Object> json = new LinkedHashMap<>();
        json.put("schemaVersion", 1);
        json.put("report", new LinkedHashMap<>(Map.of("reportId", 12, "title", "상반기 결과보고", "status", "DRAFT", "version", 1, "groupBy", "adminDong")));
        json.put("project", new LinkedHashMap<>(Map.of("name", "정비", "groupName", "환경위생과")));
        json.put("summary", new LinkedHashMap<>(Map.of("totalCount", 1, "authors", List.of("김남형"))));
        json.put("sections", new ArrayList<>(List.of(section)));
        return json;
    }

    Path image(String name, int w, int h) throws Exception {
        Path dir = Files.createDirectories(uploads.resolve("55"));
        Path file = dir.resolve(name);
        ImageIO.write(new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB), "png", file.toFile());
        return file;
    }

    @Test void payloadResolvesOnlySafeExistingFiles() throws Exception {
        Path photo = image("photo0.png", 20, 10);
        CompiledReportHwpxService service = new CompiledReportHwpxService(null, renderer(), new FieldworkProperties());
        Map<String, Object> source = json("/api/files/55/photo0.png", "/api/files/55/map.png");
        Path output = uploads.resolve("out.hwpx");

        Map<String, Object> payload = service.buildPayload(source, output);
        @SuppressWarnings("unchecked")
        Map<String, Object> item = (Map<String, Object>) ((List<Map<String, Object>>) ((List<Map<String, Object>>) payload.get("sections")).get(0).get("items")).get(0);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> files = (List<Map<String, Object>>) item.get("photo_files");
        assertEquals(1, files.size());
        assertEquals(photo.toRealPath(), Path.of(files.get(0).get("path").toString()).toRealPath());
        assertEquals("작업 전 현수막", files.get(0).get("caption"));
        assertNull(item.get("map_file"));
        assertEquals(output.toAbsolutePath().toString(), payload.get("output_path"));
        assertEquals("하단동 492-1", item.get("address"));
        assertFalse(source.containsKey("output_path"));
        assertEquals("상반기_결과_v1", CompiledReportHwpxService.safeName("상반기/결과") + "_v1");
    }

    @Test void htmlEmbedsDownscaledPhotoAndSkipsMissingOnes() throws Exception {
        image("big.png", 1600, 1200);
        String html = renderer().render(json("/api/files/55/big.png", "/api/files/55/none.png"));
        assertTrue(html.contains("data:image/jpeg;base64,"));
        assertEquals(1, html.split("data:image/jpeg;base64,", -1).length - 1);
    }
}
