package com.fieldwork.service;

import java.util.*;

/** Geometry only. Keep the existing report numbering/author palette; never render a bitmap here. */
public final class LocalReportMaps {
    private static final String[] COLORS = {"#2477F3", "#12A9A5", "#BE9446", "#7A5BD6", "#E34D59", "#1551A6", "#C87973", "#078A88"};
    private LocalReportMaps() {}
    public static Map<String, Object> single(Object lat, Object lng) {
        List<Map<String, Object>> markers = new ArrayList<>();
        if (valid(lat, lng)) markers.add(Map.of("n", 1, "lat", lat, "lng", lng, "color", COLORS[0]));
        return spec(markers);
    }
    public static Map<String, Object> overview(Map<String, Object> json) {
        List<Map<String, Object>> markers = new ArrayList<>();
        Map<String, String> authors = new LinkedHashMap<>();
        int number = 0;
        for (Object rawSection : list(json.get("sections"))) for (Object raw : list(map(rawSection).get("items"))) {
            Map<?, ?> item = map(raw);
            number++;
            String name = Objects.toString(map(item.get("author")).get("name"), "-");
            String color = authors.computeIfAbsent(name, ignored -> COLORS[authors.size() % COLORS.length]);
            if (valid(item.get("lat"), item.get("lng"))) markers.add(Map.of("n", number, "lat", item.get("lat"), "lng", item.get("lng"), "color", color));
        }
        return spec(markers);
    }
    public static String asset(List<Map<String, Object>> assets, Map<String, Object> spec) {
        String path = "/work/assets/" + assets.size() + ".jpg";
        assets.add(Map.of("path", path, "map", spec, "optional", list(spec.get("markers")).isEmpty()));
        return path;
    }
    private static Map<String, Object> spec(List<Map<String, Object>> markers) {
        return Map.of("width", 960, "height", 560, "markers", markers);
    }
    private static boolean valid(Object lat, Object lng) {
        return lat instanceof Number la && lng instanceof Number lo && Double.isFinite(la.doubleValue())
                && Double.isFinite(lo.doubleValue()) && Math.abs(la.doubleValue()) <= 90 && Math.abs(lo.doubleValue()) <= 180;
    }
    private static Map<?, ?> map(Object value) { return value instanceof Map<?, ?> m ? m : Map.of(); }
    private static List<?> list(Object value) { return value instanceof List<?> l ? l : List.of(); }
}
