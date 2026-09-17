package com.fieldwork.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.locationtech.proj4j.CRSFactory;
import org.locationtech.proj4j.CoordinateReferenceSystem;
import org.locationtech.proj4j.CoordinateTransform;
import org.locationtech.proj4j.CoordinateTransformFactory;
import org.locationtech.proj4j.ProjCoordinate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class SgisBoundaryService {

    private static final String AUTH_URL =
            "https://sgisapi.mods.go.kr/OpenAPI3/auth/authentication.json";
    private static final String BOUNDARY_URL =
            "https://sgisapi.mods.go.kr/OpenAPI3/boundary/hadmarea.geojson";

    private final RestClient restClient = RestClient.create();
    private final ObjectMapper objectMapper;
    private final String consumerKey;
    private final String consumerSecret;
    private final String sahaguCode;
    private final String boundaryYear;
    private final CoordinateTransform toWgs84;

    private volatile String accessToken;
    private volatile long accessTokenExpiresAtEpochSeconds;
    private final Map<String, JsonNode> cachedBoundaries = new ConcurrentHashMap<>();

    private static final Map<String, String> SIDO_CODES = createSidoCodes();

    public SgisBoundaryService(
            ObjectMapper objectMapper,
            @Value("${sgis.consumer-key:${sgis.consumerKey:${sgis.service-id:${SGIS_CONSUMER_KEY:}}}}") String consumerKey,
            @Value("${sgis.consumer-secret:${sgis.consumerSecret:${sgis.secret-key:${SGIS_CONSUMER_SECRET:}}}}") String consumerSecret,
            @Value("${sgis.sahagu-code:21100}") String sahaguCode,
            @Value("${sgis.boundary-year:2025}") String boundaryYear) {
        this.objectMapper = objectMapper;
        this.consumerKey = consumerKey;
        this.consumerSecret = consumerSecret;
        this.sahaguCode = sahaguCode;
        this.boundaryYear = boundaryYear;

        CRSFactory crsFactory = new CRSFactory();
        CoordinateReferenceSystem epsg5179 = crsFactory.createFromParameters(
                "EPSG:5179",
                "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 " +
                        "+x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs");
        CoordinateReferenceSystem wgs84 = crsFactory.createFromParameters(
                "EPSG:4326",
                "+proj=longlat +datum=WGS84 +no_defs");
        this.toWgs84 = new CoordinateTransformFactory().createTransform(epsg5179, wgs84);
    }

    public JsonNode getSahaguAdministrativeBoundaries() {
        return getAdministrativeBoundaries(sahaguCode);
    }

    public JsonNode getAdministrativeBoundaries(String admCode) {
        String normalized = admCode == null ? "" : admCode.trim();
        if (!normalized.matches("\\d{2,7}")) {
            throw new IllegalArgumentException("올바른 SGIS 행정구역 코드를 입력해 주세요.");
        }
        return cachedBoundaries.computeIfAbsent(normalized,
                code -> convertFeatureCollection(requestBoundary(getAccessToken(), code, 1)));
    }

    /**
     * 사용자의 근무 시·도 전체를 행정동 단위로 내려준다.
     * 시·도(2자리)에서 시군구를 한 단계, 행정동을 두 단계 내려가므로 low_search=2를 사용한다.
     */
    public JsonNode getSidoAdministrativeDongBoundaries(String sido) {
        String normalized = sido == null ? "" : sido.replace(" ", "").trim();
        String code = SIDO_CODES.get(normalized);
        if (code == null) {
            throw new IllegalArgumentException("지원하지 않는 근무 시·도입니다: " + sido);
        }
        String cacheKey = "sido-dong-" + code;
        return cachedBoundaries.computeIfAbsent(cacheKey,
                ignored -> convertFeatureCollection(requestBoundary(getAccessToken(), code, 2)));
    }

    private String getAccessToken() {
        long now = Instant.now().getEpochSecond();
        if (accessToken != null && now < accessTokenExpiresAtEpochSeconds - 60) {
            return accessToken;
        }

        if (consumerKey.isBlank() || consumerSecret.isBlank()) {
            throw new IllegalStateException(
                    "SGIS 인증정보가 없습니다. SGIS_CONSUMER_KEY와 SGIS_CONSUMER_SECRET을 설정해 주세요.");
        }

        JsonNode response = restClient.get()
                .uri(URI.create(UriComponentsBuilder
                        .fromUriString(AUTH_URL)
                        .queryParam("consumer_key", consumerKey)
                        .queryParam("consumer_secret", consumerSecret)
                        .build()
                        .encode()
                        .toUriString()))
                .accept(MediaType.APPLICATION_JSON)
                .retrieve()
                .body(JsonNode.class);

        validateSgisResponse(response, "SGIS 인증");
        JsonNode result = response.path("result");
        accessToken = result.path("accessToken").asText();
        accessTokenExpiresAtEpochSeconds = result.path("accessTimeout")
                .asLong(now + 3600);

        if (accessToken.isBlank()) {
            throw new IllegalStateException("SGIS 인증 응답에 accessToken이 없습니다.");
        }
        return accessToken;
    }

    private JsonNode requestBoundary(String token, String admCode, int lowSearch) {
        JsonNode response = restClient.get()
                .uri(URI.create(UriComponentsBuilder
                        .fromUriString(BOUNDARY_URL)
                        .queryParam("accessToken", token)
                        .queryParam("year", boundaryYear)
                        .queryParam("adm_cd", admCode)
                        .queryParam("low_search", lowSearch)
                        .build()
                        .encode()
                        .toUriString()))
                .accept(MediaType.APPLICATION_JSON)
                .retrieve()
                .body(JsonNode.class);
        validateSgisResponse(response, "행정동 경계 조회");
        return response;
    }

    private static Map<String, String> createSidoCodes() {
        Map<String, String> codes = new LinkedHashMap<>();
        codes.put("서울특별시", "11");
        codes.put("부산광역시", "21");
        codes.put("대구광역시", "22");
        codes.put("인천광역시", "23");
        codes.put("광주광역시", "24");
        codes.put("대전광역시", "25");
        codes.put("울산광역시", "26");
        codes.put("세종특별자치시", "29");
        codes.put("경기도", "31");
        codes.put("강원특별자치도", "32");
        codes.put("강원도", "32");
        codes.put("충청북도", "33");
        codes.put("충청남도", "34");
        codes.put("전북특별자치도", "35");
        codes.put("전라북도", "35");
        codes.put("전라남도", "36");
        codes.put("경상북도", "37");
        codes.put("경상남도", "38");
        codes.put("제주특별자치도", "39");
        return Map.copyOf(codes);
    }

    private void validateSgisResponse(JsonNode response, String operation) {
        if (response == null) {
            throw new IllegalStateException(operation + " 응답이 없습니다.");
        }
        if (response.path("errCd").asInt(-1) != 0) {
            throw new IllegalStateException(
                    operation + " 실패: " + response.path("errMsg").asText("알 수 없는 오류"));
        }
    }

    private JsonNode convertFeatureCollection(JsonNode source) {
        ObjectNode result = objectMapper.createObjectNode();
        result.put("type", "FeatureCollection");
        ArrayNode features = result.putArray("features");

        source.path("features").forEach(feature -> {
            ObjectNode converted = feature.deepCopy();
            JsonNode geometry = feature.path("geometry");
            String type = geometry.path("type").asText();
            ObjectNode convertedGeometry = converted.withObject("geometry");

            if ("Polygon".equals(type)) {
                convertedGeometry.set("coordinates", convertPolygon(geometry.path("coordinates")));
            } else if ("MultiPolygon".equals(type)) {
                ArrayNode polygons = objectMapper.createArrayNode();
                geometry.path("coordinates").forEach(polygon -> polygons.add(convertPolygon(polygon)));
                convertedGeometry.set("coordinates", polygons);
            }
            features.add(converted);
        });
        return result;
    }

    private ArrayNode convertPolygon(JsonNode polygon) {
        ArrayNode rings = objectMapper.createArrayNode();
        polygon.forEach(ring -> {
            ArrayNode convertedRing = objectMapper.createArrayNode();
            ring.forEach(point -> {
                ProjCoordinate target = new ProjCoordinate();
                toWgs84.transform(
                        new ProjCoordinate(point.get(0).asDouble(), point.get(1).asDouble()),
                        target);
                ArrayNode convertedPoint = objectMapper.createArrayNode();
                convertedPoint.add(target.x);
                convertedPoint.add(target.y);
                convertedRing.add(convertedPoint);
            });
            rings.add(convertedRing);
        });
        return rings;
    }
}
