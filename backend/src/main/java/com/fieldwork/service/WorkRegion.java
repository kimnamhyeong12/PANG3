package com.fieldwork.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.util.Map;

/** The same dated MOIS selection hierarchy is bundled with the mobile app. */
public final class WorkRegion {
    private WorkRegion() {}
    private static final JsonNode DATA = load();
    private static final Map<String, String> ALIASES = Map.of(
            "광주광역시", "전남광주통합특별시", "전라남도", "전남광주통합특별시",
            "강원도", "강원특별자치도", "전라북도", "전북특별자치도");

    private static JsonNode load() {
        try (InputStream input = WorkRegion.class.getResourceAsStream("/korea-regions.json")) {
            if (input == null) throw new IllegalStateException("근무지역 자료가 없습니다.");
            return new ObjectMapper().readTree(input);
        } catch (java.io.IOException error) {
            throw new IllegalStateException("근무지역 자료를 읽지 못했습니다.", error);
        }
    }

    public static void validate(String sido, String selected) {
        if (sido == null || sido.isBlank()) throw new IllegalArgumentException("시·도를 선택해주세요.");
        if (selected == null || selected.isBlank()) throw new IllegalArgumentException("시·군·구를 선택해주세요.");
        String region = ALIASES.getOrDefault(sido.trim(), sido.trim());
        String value = selected.trim().replaceAll("\\s+", " ");
        for (JsonNode parent : DATA.path("districtsByRegion").path(region)) {
            String name = parent.asText();
            if (!value.equals(name) && !value.startsWith(name + " ")) continue;
            JsonNode children = DATA.path("subdistrictsByRegion").path(region).path(name);
            if (children.isMissingNode()) {
                if (value.equals(name)) return;
                break;
            }
            String gu = value.substring(name.length()).trim();
            for (JsonNode child : children) if (child.asText().equals(gu)) return;
            throw new IllegalArgumentException("해당 시의 구를 선택해주세요.");
        }
        throw new IllegalArgumentException("근무지역을 목록에서 다시 선택해주세요.");
    }
}
