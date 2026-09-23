package com.fieldwork.service;

import com.fieldwork.dto.PublicDataItem;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class PublicDataService {

    private final BusStopService busStopService;
    private final AedService aedService;

    public PublicDataService(
            BusStopService busStopService,
            AedService aedService
    ) {
        this.busStopService = busStopService;
        this.aedService = aedService;
    }

    public List<PublicDataItem> getPublicData(
            String category,
            String admCode
    ) {

        return switch (category) {

            case "bus" ->
                    getBusStops(admCode);

            case "aed" ->
                    getAeds(admCode);

            // 추후 추가
            // case "tree" ->
            //         getTrees(admCode);

            // case "manhole" ->
            //         getManholes(admCode);

            default ->
                    throw new IllegalArgumentException(
                            "지원하지 않는 공공데이터 카테고리입니다: "
                                    + category
                    );
        };
    }

    /**
     * 버스정류장 데이터를
     * 공통 PublicDataItem 형태로 변환한다.
     */
    private List<PublicDataItem> getBusStops(
            String admCode
    ) {

        return busStopService
                .getBusStopsByAdmCode(admCode)
                .stream()
                .map(busStop -> {

                    String sido =
                            (String) busStop.get("sido");

                    String sigungu =
                            (String) busStop.get("sigungu");

                    String adminDong =
                            (String) busStop.get("adminDong");

                    String roadAddress =
                            String.join(
                                    " ",
                                    sido,
                                    sigungu,
                                    adminDong
                            );

                    return new PublicDataItem(
                            (Long) busStop.get("busStopId"),
                            (String) busStop.get("name"),
                            roadAddress,
                            (Double) busStop.get("lat"),
                            (Double) busStop.get("lng"),
                            "버스정류장",
                            sido,
                            sigungu,
                            adminDong
                    );
                })
                .toList();
    }

    /**
     * AED 데이터를
     * 공통 PublicDataItem 형태로 변환한다.
     */
    private List<PublicDataItem> getAeds(
            String admCode
    ) {

        return aedService
                .getAedsByAdmCode(admCode)
                .stream()
                .map(aed -> {

                    String sido =
                            (String) aed.get("sido");

                    String sigungu =
                            (String) aed.get("sigungu");

                    String adminDong =
                            (String) aed.get("adminDong");

                    String address =
                            (String) aed.get("address");

                    String detailAddress =
                            (String) aed.get("modelName");

                    return new PublicDataItem(
                            ((Number) aed.get("aedId")).longValue(),
                            detailAddress,
                            address,
                            ((Number) aed.get("lat")).doubleValue(),
                            ((Number) aed.get("lng")).doubleValue(),
                            "심폐제세동기",
                            sido,
                            sigungu,
                            adminDong
                    );
                })
                .toList();
    }
}