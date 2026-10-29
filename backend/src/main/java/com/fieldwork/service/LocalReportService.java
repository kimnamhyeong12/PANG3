package com.fieldwork.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Supplies authorized data and asset URLs only; document generation runs on the device. */
@Service
public class LocalReportService {
    private final TaskProgressService progress;
    private final CompiledReportService compiled;
    private final ReportHtmlRenderer renderer;

    public LocalReportService(TaskProgressService progress, CompiledReportService compiled, ReportHtmlRenderer renderer) {
        this.progress = progress;
        this.compiled = compiled;
        this.renderer = renderer;
    }

    public Map<String, Object> individual(Long id, Long userId) {
        Map<String, Object> record = progress.clientReport(id, userId);
        Map<String, Object> payload = map(record.get("payload"));
        List<Map<String, Object>> assets = new ArrayList<>();
        String map = Objects.toString(payload.get("map_image"), "");
        payload.put("map_image", map.isBlank() ? LocalReportMaps.asset(assets, LocalReportMaps.single(payload.get("latitude"), payload.get("longitude"))) : asset(assets, map, false));
        List<Map<String, Object>> photos = new ArrayList<>();
        for (Object value : list(payload.get("field_photos"))) {
            Map<String, Object> photo = map(value);
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("comment", photo.get("comment"));
            entry.put("type", photo.get("type"));
            entry.put("path", asset(assets, Objects.toString(photo.get("uri"), ""), false));
            photos.add(entry);
        }
        payload.put("field_photos", photos);
        payload.put("output_dir", "/work");
        String name = first(record.get("reportName"), record.get("detailAddress"), record.get("roadAddress"), "보고서");
        return descriptor("individual", payload, assets, safe(name) + "_" + id + ".hwpx", record.get("revision"));
    }

    public Map<String, Object> compiled(Long id, Long userId) {
        // A FINAL report may return its persisted snapshot; never add device paths to that object.
        Map<String, Object> payload = new com.fasterxml.jackson.databind.ObjectMapper().convertValue(
                compiled.getJson(id, userId), new com.fasterxml.jackson.core.type.TypeReference<LinkedHashMap<String, Object>>() {});
        List<Map<String, Object>> assets = new ArrayList<>();
        for (Object section : list(payload.get("sections"))) {
            for (Object raw : list(map(section).get("items"))) {
                Map<String, Object> item = map(raw);
                List<Map<String, Object>> photos = new ArrayList<>();
                for (Object rawPhoto : list(item.get("photos"))) {
                    Map<String, Object> photo = map(rawPhoto);
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("path", asset(assets, Objects.toString(photo.get("url"), ""), false));
                    entry.put("slot", photo.get("slot"));
                    entry.put("comment", photo.get("comment"));
                    entry.put("caption", (Objects.toString(photo.get("slot"), "") + " " + Objects.toString(photo.get("comment"), "")).trim());
                    photos.add(entry);
                }
                item.put("photo_files", photos);
                String map = Objects.toString(item.get("locationMapImage"), "");
                item.put("map_file", map.isBlank() ? LocalReportMaps.asset(assets, LocalReportMaps.single(item.get("lat"), item.get("lng"))) : asset(assets, map, false));
            }
        }
        payload.put("overview_map_file", LocalReportMaps.asset(assets, LocalReportMaps.overview(payload)));
        payload.put("output_path", "/work/result.hwpx");
        Map<String, Object> report = map(payload.get("report"));
        String name = safe(first(map(payload.get("project")).get("name"), "프로젝트")) + "_"
                + safe(first(report.get("title"), "통합보고서"))
                + ("DRAFT".equals(report.get("status")) ? "_초안" : "") + "_v" + report.get("version") + ".hwpx";
        return descriptor("compiled", payload, assets, name, null);
    }

    public StaticMapService.MapImage individualMap(Long id, Long userId) {
        Map<String, Object> data = map(progress.clientReport(id, userId).get("payload"));
        return renderer.singleMap(data.get("latitude"), data.get("longitude"));
    }

    public StaticMapService.MapImage compiledMap(Long id, Long userId, Integer index) {
        Map<String, Object> data = compiled.getJson(id, userId);
        if (index == null) return renderer.overviewMap(data);
        int current = 0;
        for (Object section : list(data.get("sections"))) {
            for (Object raw : list(map(section).get("items"))) {
                Map<String, Object> item = map(raw);
                if (current++ == index) return renderer.singleMap(item.get("lat"), item.get("lng"));
            }
        }
        throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    }

    private static Map<String, Object> descriptor(String kind, Map<String, Object> payload,
            List<Map<String, Object>> assets, String fileName, Object revision) {
        // Bound work on a phone. No partial report is silently produced.
        if (assets.size() > 202) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "사진·위치도가 많습니다. 보고서를 나누어 만들어 주세요.");
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("schema", 1); result.put("kind", kind); result.put("payload", payload);
        result.put("assets", assets); result.put("fileName", fileName); result.put("revision", revision);
        return result;
    }

    private static String asset(List<Map<String, Object>> assets, String url, boolean optional) {
        if (url == null || url.isBlank()) return null;
        if (!url.matches("^/api/(files/[^?#]+|local-reports/[^?#]+)$"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "보고서 사진 경로를 확인해 주세요.");
        String path = "/work/assets/" + assets.size() + ".jpg";
        assets.add(Map.of("path", path, "url", url, "optional", optional));
        return path;
    }

    private static String first(Object... values) {
        for (Object value : values) if (value != null && !value.toString().isBlank()) return value.toString();
        return "보고서";
    }
    private static String safe(String value) { return CompiledReportHwpxService.safeName(value); }
    @SuppressWarnings("unchecked") private static Map<String, Object> map(Object value) {
        return value instanceof Map<?, ?> m ? (Map<String, Object>) m : new LinkedHashMap<>();
    }
    private static List<?> list(Object value) { return value instanceof List<?> l ? l : List.of(); }
}
