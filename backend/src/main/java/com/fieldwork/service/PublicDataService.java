package com.fieldwork.service;

import com.fieldwork.dto.PublicDataItem;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class PublicDataService {

    private final BusStopService busStopService;

    public PublicDataService(
            BusStopService busStopService
    ) {
        this.busStopService = busStopService;
    }

    public List<PublicDataItem> getPublicData(
            String category,
            String admCode
    ) {

        return switch (category) {

            case "bus" ->
                    getBusStops(admCode);

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
}