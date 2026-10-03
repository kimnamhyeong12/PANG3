package com.fieldwork.service;

import com.fieldwork.dto.PublicDataItem;
import com.fieldwork.entity.Aed;
import com.fieldwork.entity.BusStop;
import com.fieldwork.repository.AedRepository;
import com.fieldwork.repository.BusStopRepository;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class PublicDataService {

    private final BusStopService busStopService;
    private final AedService aedService;
    private final BusStopRepository busStopRepository;
    private final AedRepository aedRepository;

    public PublicDataService(
            BusStopService busStopService,
            AedService aedService,
            BusStopRepository busStopRepository,
            AedRepository aedRepository
    ) {
        this.busStopService = busStopService;
        this.aedService = aedService;
        this.busStopRepository = busStopRepository;
        this.aedRepository = aedRepository;
    }

    public List<PublicDataItem> getPublicData(
            String category,
            String admCode,
            String sido,
            String sigungu,
            String adminDong
    ) {
        if (hasText(sido) && hasText(sigungu) && hasText(adminDong)) {
            return switch (category) {
                case "bus" -> getBusStopsFromDb(sido, sigungu, adminDong);
                case "aed" -> getAedsFromDb(sido, sigungu, adminDong);
                default -> throw new IllegalArgumentException(
                        "지원하지 않는 공공데이터 카테고리입니다: " + category
                );
            };
        }

        if (!hasText(admCode)) {
            throw new IllegalArgumentException("행정동 정보가 필요합니다.");
        }

        // 기존 클라이언트 호환용 fallback.
        return switch (category) {
            case "bus" -> getBusStopsByAdmCode(admCode);
            case "aed" -> getAedsByAdmCode(admCode);
            default -> throw new IllegalArgumentException(
                    "지원하지 않는 공공데이터 카테고리입니다: " + category
            );
        };
    }

    private List<PublicDataItem> getBusStopsFromDb(String sido, String sigungu, String adminDong) {
        return busStopRepository.findBySidoAndSigunguAndAdminDong(sido, sigungu, adminDong)
                .stream()
                .map(this::toPublicDataItem)
                .toList();
    }

    private List<PublicDataItem> getAedsFromDb(String sido, String sigungu, String adminDong) {
        return aedRepository.findBySidoAndSigunguAndAdminDong(sido, sigungu, adminDong)
                .stream()
                .map(this::toPublicDataItem)
                .toList();
    }

    private PublicDataItem toPublicDataItem(BusStop busStop) {
        String roadAddress = String.join(
                " ",
                safe(busStop.getSido()),
                safe(busStop.getSigungu()),
                safe(busStop.getAdminDong())
        ).replaceAll("\\s+", " ").trim();

        return new PublicDataItem(
                busStop.getBusStopId(),
                busStop.getName(),
                roadAddress,
                busStop.getLat(),
                busStop.getLng(),
                "버스정류장",
                busStop.getSido(),
                busStop.getSigungu(),
                busStop.getAdminDong()
        );
    }

    private PublicDataItem toPublicDataItem(Aed aed) {
        return new PublicDataItem(
                aed.getAedId(),
                aed.getModelName(),
                aed.getAddress(),
                aed.getLat(),
                aed.getLng(),
                "심폐제세동기",
                aed.getSido(),
                aed.getSigungu(),
                aed.getAdminDong()
        );
    }

    private List<PublicDataItem> getBusStopsByAdmCode(String admCode) {
        return busStopService.getBusStopsByAdmCode(admCode)
                .stream()
                .map(busStop -> new PublicDataItem(
                        ((Number) busStop.get("busStopId")).longValue(),
                        (String) busStop.get("name"),
                        String.join(" ",
                                safe(busStop.get("sido")),
                                safe(busStop.get("sigungu")),
                                safe(busStop.get("adminDong"))
                        ).replaceAll("\\s+", " ").trim(),
                        ((Number) busStop.get("lat")).doubleValue(),
                        ((Number) busStop.get("lng")).doubleValue(),
                        "버스정류장",
                        (String) busStop.get("sido"),
                        (String) busStop.get("sigungu"),
                        (String) busStop.get("adminDong")
                ))
                .toList();
    }

    private List<PublicDataItem> getAedsByAdmCode(String admCode) {
        return aedService.getAedsByAdmCode(admCode)
                .stream()
                .map(aed -> new PublicDataItem(
                        ((Number) aed.get("aedId")).longValue(),
                        (String) aed.get("modelName"),
                        (String) aed.get("address"),
                        ((Number) aed.get("lat")).doubleValue(),
                        ((Number) aed.get("lng")).doubleValue(),
                        "심폐제세동기",
                        (String) aed.get("sido"),
                        (String) aed.get("sigungu"),
                        (String) aed.get("adminDong")
                ))
                .toList();
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private String safe(Object value) {
        return value == null ? "" : value.toString();
    }
}
