package com.fieldwork.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class HolidayService {

    private static final ZoneId KOREA_ZONE = ZoneId.of("Asia/Seoul");

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    private final ConcurrentHashMap<YearMonth, Set<LocalDate>> holidayCache =
            new ConcurrentHashMap<>();

    @Value("${KOREA_HOLIDAY_API_KEY:}")
    private String holidayApiKey;

    public HolidayService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }

    @PostConstruct
    public void preloadCurrentMonth() {
        LocalDate today = LocalDate.now(KOREA_ZONE);
        loadMonth(YearMonth.from(today));
    }

    /**
     * 정기 업무 알림은 주말과 대한민국 공휴일/대체공휴일에는 보내지 않는다.
     *
     * 공휴일 API 키가 없거나 당월 공휴일 조회에 실패한 경우에는
     * 공휴일 여부를 확정할 수 없으므로 안전하게 false를 반환해
     * 아침/퇴근 정기 알림을 보내지 않는다.
     */
    public boolean isBusinessDay(LocalDate date) {
        if (date == null) {
            return false;
        }

        DayOfWeek day = date.getDayOfWeek();

        if (day == DayOfWeek.SATURDAY || day == DayOfWeek.SUNDAY) {
            return false;
        }

        YearMonth month = YearMonth.from(date);

        if (!holidayCache.containsKey(month)) {
            boolean loaded = loadMonth(month);
            if (!loaded) {
                return false;
            }
        }

        return !holidayCache
                .getOrDefault(month, Collections.emptySet())
                .contains(date);
    }

    /**
     * 매월 1일 새벽에 현재 월과 다음 월 공휴일을 미리 갱신한다.
     */
    @Scheduled(
            cron = "0 10 2 1 * *",
            zone = "Asia/Seoul"
    )
    public void refreshHolidayCache() {
        LocalDate today = LocalDate.now(KOREA_ZONE);
        loadMonth(YearMonth.from(today));
        loadMonth(YearMonth.from(today.plusMonths(1)));
    }

    public boolean loadMonth(YearMonth month) {
        if (month == null) {
            return false;
        }

        if (holidayApiKey == null || holidayApiKey.isBlank()) {
            System.out.println(
                    "[Holiday] KOREA_HOLIDAY_API_KEY가 없어 공휴일 정보를 불러오지 않습니다."
            );
            return false;
        }

        try {
            String serviceKey = encodeServiceKey(holidayApiKey.trim());

            String url =
                    "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo"
                            + "?serviceKey=" + serviceKey
                            + "&solYear=" + month.getYear()
                            + "&solMonth=" + String.format("%02d", month.getMonthValue())
                            + "&numOfRows=100"
                            + "&pageNo=1"
                            + "&_type=json";

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(10))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(
                    request,
                    HttpResponse.BodyHandlers.ofString()
            );

            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                System.out.println(
                        "[Holiday] 공휴일 API HTTP 실패 status="
                                + response.statusCode()
                );
                return false;
            }

            JsonNode root = objectMapper.readTree(response.body());
            JsonNode resultCode = root
                    .path("response")
                    .path("header")
                    .path("resultCode");

            if (resultCode.isTextual()
                    && !"00".equals(resultCode.asText())
                    && !"0".equals(resultCode.asText())) {
                System.out.println(
                        "[Holiday] 공휴일 API 오류 resultCode="
                                + resultCode.asText()
                );
                return false;
            }

            JsonNode itemNode = root
                    .path("response")
                    .path("body")
                    .path("items")
                    .path("item");

            Set<LocalDate> dates = new HashSet<>();

            if (itemNode.isArray()) {
                for (JsonNode item : itemNode) {
                    addHolidayDate(dates, item);
                }
            } else if (itemNode.isObject()) {
                addHolidayDate(dates, itemNode);
            }

            holidayCache.put(
                    month,
                    Collections.unmodifiableSet(dates)
            );

            System.out.println(
                    "[Holiday] " + month + " 공휴일 "
                            + dates.size() + "건 로드"
            );
            return true;
        } catch (Exception error) {
            System.out.println(
                    "[Holiday] 공휴일 조회 실패 "
                            + month + " / " + error.getMessage()
            );
            return false;
        }
    }

    private void addHolidayDate(
            Set<LocalDate> dates,
            JsonNode item
    ) {
        String raw = item.path("locdate").asText("");

        if (raw.length() != 8) {
            return;
        }

        try {
            int year = Integer.parseInt(raw.substring(0, 4));
            int month = Integer.parseInt(raw.substring(4, 6));
            int day = Integer.parseInt(raw.substring(6, 8));

            dates.add(LocalDate.of(year, month, day));
        } catch (Exception ignored) {
        }
    }

    private String encodeServiceKey(String key) {
        // 공공데이터포털에서 "Encoding" 키를 복사한 경우 %가 이미 포함될 수 있다.
        if (key.contains("%")) {
            return key;
        }

        return URLEncoder.encode(
                key,
                StandardCharsets.UTF_8
        );
    }
}
