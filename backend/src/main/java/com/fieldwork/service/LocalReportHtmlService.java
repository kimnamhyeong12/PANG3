package com.fieldwork.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;

/** JSON and authorized image references for HTML assembly on the user's device. */
@Service
public class LocalReportHtmlService {
    private final ProgressReportEditService progress;
    private final CompiledReportService compiled;
    private final ObjectMapper json = new ObjectMapper();

    public LocalReportHtmlService(ProgressReportEditService progress, CompiledReportService compiled) {
        this.progress = progress;
        this.compiled = compiled;
    }

    public Map<String, Object> source(String kind, Long id, Long userId) {
        return "progress".equals(kind) ? progress.htmlJson(id, userId) : compiled.getJson(id, userId);
    }

    public Map<String, Object> descriptor(String kind, Long id, Long userId) {
        Map<String, Object> payload = json.convertValue(source(kind, id, userId), new TypeReference<LinkedHashMap<String, Object>>() {});
        List<Map<String, Object>> assets = new ArrayList<>();
        for (Object rawSection : list(payload.get("sections"))) {
            for (Object rawItem : list(map(rawSection).get("items"))) {
                Map<String, Object> item = map(rawItem);
                // Retain Gemini implementation, but do not include historical AI text in new exports.
                item.remove("aiRefinedContent");
                for (Object rawPhoto : list(item.get("photos"))) {
                    Map<String, Object> photo = map(rawPhoto);
                    photo.put("url", asset(assets, Objects.toString(photo.get("url"), ""), false));
                }
                String mapUrl = Objects.toString(item.get("locationMapImage"), "");
                item.put("mapImage", mapUrl.isBlank() ? LocalReportMaps.asset(assets, LocalReportMaps.single(item.get("lat"), item.get("lng"))) : asset(assets, mapUrl, false));
                item.remove("locationMapImage");
            }
        }
        payload.put("overviewMapImage", LocalReportMaps.asset(assets, LocalReportMaps.overview(payload)));
        if (assets.size() > 202) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "사진·위치도가 많습니다. 보고서를 나누어 만들어 주세요.");
        String title = Objects.toString(map(payload.get("report")).get("title"), "보고서");
        return Map.of("schema", 1, "kind", "html", "format", "html", "payload", payload,
                "assets", assets, "fileName", CompiledReportHwpxService.safeName(title) + ".html");
    }

    private static String asset(List<Map<String, Object>> assets, String url, boolean optional) {
        if (url.isBlank()) return null;
        if (!url.matches("^/api/(files/[^?#]+|local-reports/[^?#]+)$"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "보고서 사진 경로를 확인해 주세요.");
        String path = "/work/assets/" + assets.size() + ".jpg";
        assets.add(Map.of("path", path, "url", url, "optional", optional));
        return path;
    }
    @SuppressWarnings("unchecked") private static Map<String, Object> map(Object value) {
        return value instanceof Map<?, ?> m ? (Map<String, Object>) m : new LinkedHashMap<>();
    }
    private static List<?> list(Object value) { return value instanceof List<?> l ? l : List.of(); }
}
