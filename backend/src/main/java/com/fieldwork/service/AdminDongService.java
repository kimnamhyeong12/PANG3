package com.fieldwork.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fieldwork.entity.Task;
import com.fieldwork.entity.TaskProgress;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 행정동이 비어 있는 업무를 좌표(없으면 주소)로 채운다 (D34). 카카오 로컬 REST API 를 서버에서 호출한다.
 * 키가 없거나 호출이 실패하면 아무것도 바꾸지 않는다(보고서에는 "(미지정)").
 */
@Service
public class AdminDongService {
    private final String key;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    private final ObjectMapper json = new ObjectMapper();
    private final Map<String, String[]> cache = new ConcurrentHashMap<>();

    public AdminDongService(@Value("${kakao.rest-api-key:}") String key,
            @Value("${KAKAO_REST_API_KEY:}") String envKey) {
        String chosen = key == null || key.isBlank() ? envKey : key;
        this.key = chosen == null ? "" : chosen.trim();
    }

    /** 업무에 행정동이 없으면 채운다. 바뀌었으면 true (저장은 호출한 쪽에서). */
    public boolean fill(Task task, TaskProgress progress) {
        if (key.isEmpty() || task == null || notBlank(task.getAdminDong())) return false;
        Double lat = progress != null && progress.getLatitude() != null ? progress.getLatitude() : task.getLat();
        Double lng = progress != null && progress.getLongitude() != null ? progress.getLongitude() : task.getLng();
        String[] region = null;
        if (lat != null && lng != null) region = byCoord(lat, lng);
        if (region == null) {
            // detailAddress 는 방문지 이름(사진 파일명 등)일 수 있어 도로명 주소만 쓴다
            if (notBlank(task.getRoadAddress())) region = byAddress(task.getRoadAddress());
        }
        if (region == null || !notBlank(region[2])) return false;
        task.setAdminDong(region[2]);
        if (!notBlank(task.getSido())) task.setSido(region[0]);
        if (!notBlank(task.getSigungu())) task.setSigungu(region[1]);
        return true;
    }

    /** [시도, 시군구, 행정동] 또는 null. */
    String[] byCoord(double lat, double lng) {
        if (!Double.isFinite(lat) || !Double.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
        String cacheKey = String.format(Locale.ROOT, "c:%.5f,%.5f", lat, lng);
        String[] cached = cache.get(cacheKey);
        if (cached != null) return cached;
        JsonNode body = get("https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=" + lng + "&y=" + lat);
        if (body == null) return null;
        for (JsonNode doc : body.path("documents")) {
            if ("H".equals(doc.path("region_type").asText())) {
                String[] region = {doc.path("region_1depth_name").asText(""), doc.path("region_2depth_name").asText(""),
                        doc.path("region_3depth_name").asText("")};
                cache.put(cacheKey, region);
                return region;
            }
        }
        return null;
    }

    private String[] byAddress(String address) {
        String cacheKey = "a:" + address.trim();
        String[] cached = cache.get(cacheKey);
        if (cached != null) return cached;
        JsonNode body = get("https://dapi.kakao.com/v2/local/search/address.json?query="
                + URLEncoder.encode(address.trim(), StandardCharsets.UTF_8));
        if (body == null) return null;
        for (JsonNode doc : body.path("documents")) {
            JsonNode jibun = doc.path("address");
            String dong = jibun.path("region_3depth_h_name").asText("");
            if (!dong.isBlank()) {
                String[] region = {jibun.path("region_1depth_name").asText(""), jibun.path("region_2depth_name").asText(""), dong};
                cache.put(cacheKey, region);
                return region;
            }
            if (doc.hasNonNull("x") && doc.hasNonNull("y")) {
                String[] region = byCoord(doc.path("y").asDouble(), doc.path("x").asDouble());
                if (region != null) cache.put(cacheKey, region);
                return region;
            }
        }
        return null;
    }

    private JsonNode get(String url) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(4))
                    .header("Authorization", "KakaoAK " + key).GET().build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            return response.statusCode() == 200 ? json.readTree(response.body()) : null;
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            return null;
        } catch (Exception ex) {
            return null; // 좌표·키는 로그에 남기지 않는다
        }
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }
}
