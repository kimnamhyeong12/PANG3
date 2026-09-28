package com.fieldwork.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fieldwork.entity.Entrance;
import com.fieldwork.repository.EntranceRepository;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.io.geojson.GeoJsonReader;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class EntranceService {

    private final EntranceRepository entranceRepository;
    private final ObjectMapper objectMapper;
    private final SgisBoundaryService sgisBoundaryService;

    private final GeometryFactory geometryFactory =
            new GeometryFactory();

    private final GeoJsonReader geoJsonReader =
            new GeoJsonReader();


    public EntranceService(
            EntranceRepository entranceRepository,
            ObjectMapper objectMapper,
            SgisBoundaryService sgisBoundaryService
    ) {
        this.entranceRepository = entranceRepository;
        this.objectMapper = objectMapper;
        this.sgisBoundaryService = sgisBoundaryService;
    }


    /**
     * resources/data/entrances.json 파일을 읽는다.
     */
    public List<EntranceData> loadEntranceData() {

        try {

            ClassPathResource resource =
                    new ClassPathResource("data/entrances.json");

            try (InputStream inputStream =
                         resource.getInputStream()) {

                return objectMapper.readValue(
                        inputStream,
                        new TypeReference<List<EntranceData>>() {}
                );
            }

        } catch (Exception e) {

            throw new RuntimeException(
                    "건물 출입구 JSON 파일을 읽을 수 없습니다.",
                    e
            );
        }
    }


    /**
     * JSON 데이터를 Entity로 변환한다.
     *
     * 현재 entrances.json 구조
     *
     * {
     *   "sigCode": "26110",
     *   "buildingGroup": "302",
     *   "lat": 35.099009,
     *   "lng": 129.0318838
     * }
     */
    private Entrance toEntity(EntranceData data) {

        Entrance entrance = new Entrance();

        entrance.setSigCode(data.sigCode());
        entrance.setBuildingGroup(data.buildingGroup());
        entrance.setLat(data.lat());
        entrance.setLng(data.lng());

        return entrance;
    }


    /**
     * JSON 전체 데이터를 DB에 저장한다.
     *
     * 건물 출입구 데이터는 별도의 외부 고유 ID가 없으므로
     * 기존 데이터를 전체 삭제한 후 JSON 기준으로 다시 저장한다.
     */
    @Transactional
    public int importEntrances() {

        List<EntranceData> dataList =
                loadEntranceData();

        System.out.println(
                "[출입구] JSON 데이터: "
                        + dataList.size()
                        + "건"
        );


        /*
         * 기존 출입구 데이터 삭제
         */
        entranceRepository.deleteAll();

        System.out.println(
                "[출입구] 기존 데이터 삭제 완료"
        );


        List<Entrance> entrances =
                new ArrayList<>();


        for (EntranceData data : dataList) {

            /*
             * 좌표가 없는 데이터는 지도에서 사용할 수 없으므로
             * 저장하지 않는다.
             */
            if (data.lat() == null
                    || data.lng() == null) {

                System.out.println(
                        "[출입구 제외] 좌표 없음: "
                                + data.buildingGroup()
                );

                continue;
            }


            try {

                Entrance entrance =
                        toEntity(data);

                entrances.add(entrance);

            } catch (Exception e) {

                System.out.println(
                        "[출입구 변환 실패] "
                                + data.buildingGroup()
                                + " / "
                                + e.getMessage()
                );
            }
        }


        /*
         * 전체 저장
         */
        entranceRepository.saveAll(entrances);


        System.out.println(
                "[출입구] 저장 완료: "
                        + entrances.size()
                        + "건"
        );


        return entrances.size();
    }


    /**
     * 부산광역시 전체 건물 출입구의
     * 행정동 정보를 갱신한다.
     */
    @Transactional
    public int updateAdministrativeAreas() {

        List<Entrance> entrances =
                entranceRepository.findAll();

        int updatedCount = 0;


        /*
         * 부산광역시 전체 행정동 경계를 가져온다.
         */
        JsonNode boundary =
                sgisBoundaryService
                        .getSidoAdministrativeDongBoundaries(
                                "부산광역시"
                        );


        try {

            List<BoundaryData> boundaries =
                    new ArrayList<>();


            /*
             * SGIS 경계 데이터를 JTS Geometry로 변환
             */
            for (JsonNode feature :
                    boundary.path("features")) {

                JsonNode properties =
                        feature.path("properties");

                JsonNode geometryNode =
                        feature.path("geometry");


                Geometry geometry =
                        geoJsonReader.read(
                                geometryNode.toString()
                        );


                String admName =
                        properties
                                .path("adm_nm")
                                .asText(null);


                if (admName == null
                        || admName.isBlank()) {

                    continue;
                }


                String[] parts =
                        admName
                                .trim()
                                .split("\\s+");


                if (parts.length < 3) {

                    continue;
                }


                boundaries.add(
                        new BoundaryData(
                                geometry,
                                parts[0],
                                parts[1],
                                parts[2]
                        )
                );
            }


            /*
             * 출입구 하나씩 행정동을 찾는다.
             */
            for (Entrance entrance : entrances) {

                if (entrance.getLat() == null
                        || entrance.getLng() == null) {

                    continue;
                }


                Point point =
                        geometryFactory.createPoint(
                                new Coordinate(
                                        entrance.getLng(),
                                        entrance.getLat()
                                )
                        );


                for (BoundaryData boundaryData :
                        boundaries) {

                    if (boundaryData
                            .geometry()
                            .covers(point)) {


                        entrance.setSido(
                                boundaryData.sido()
                        );


                        entrance.setSigungu(
                                boundaryData.sigungu()
                        );


                        entrance.setAdminDong(
                                boundaryData.adminDong()
                        );


                        updatedCount++;

                        break;
                    }
                }
            }


            entranceRepository.saveAll(entrances);


            System.out.println(
                    "[출입구] 행정동 갱신 완료: "
                            + updatedCount
                            + "건"
            );


            return updatedCount;

        } catch (Exception e) {

            throw new RuntimeException(
                    "건물 출입구 행정동 정보를 갱신할 수 없습니다.",
                    e
            );
        }
    }


    /**
     * 전체 건물 출입구 조회
     */
    @Transactional(readOnly = true)
    public List<Entrance> getAllEntrances() {

        return entranceRepository.findAll();
    }


    /**
     * 행정동 코드로 건물 출입구 조회
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getEntrancesByAdmCode(
            String admCode
    ) {


        /*
         * SGIS에서 해당 행정동의 이름을 가져온다.
         */
        JsonNode boundary =
                sgisBoundaryService
                        .getAdministrativeBoundaries(
                                admCode
                        );


        String admName = null;


        for (JsonNode feature :
                boundary.path("features")) {

            admName =
                    feature
                            .path("properties")
                            .path("adm_nm")
                            .asText(null);


            if (admName != null
                    && !admName.isBlank()) {

                break;
            }
        }


        if (admName == null
                || admName.isBlank()) {

            throw new IllegalStateException(
                    "SGIS 응답에서 행정동 이름을 찾을 수 없습니다. "
                            + "admCode: "
                            + admCode
            );
        }


        String[] parts =
                admName
                        .trim()
                        .split("\\s+");


        if (parts.length < 3) {

            throw new IllegalStateException(
                    "SGIS 행정동 이름 형식이 예상과 다릅니다: "
                            + admName
            );
        }


        String sido = parts[0];
        String sigungu = parts[1];
        String adminDong = parts[2];


        /*
         * 해당 행정동의 출입구 조회
         */
        List<Entrance> entrances =
                entranceRepository
                        .findBySidoAndSigunguAndAdminDong(
                                sido,
                                sigungu,
                                adminDong
                        );


        /*
         * 프론트에서 사용하기 편한 형태로 변환
         */
        return entrances.stream()
                .map(entrance -> {

                    Map<String, Object> map =
                            new HashMap<>();


                    map.put(
                            "entranceId",
                            entrance.getEntranceId()
                    );


                    map.put(
                            "sigCode",
                            entrance.getSigCode()
                    );


                    map.put(
                            "buildingGroup",
                            entrance.getBuildingGroup()
                    );


                    map.put(
                            "lat",
                            entrance.getLat()
                    );


                    map.put(
                            "lng",
                            entrance.getLng()
                    );


                    map.put(
                            "sido",
                            entrance.getSido()
                    );


                    map.put(
                            "sigungu",
                            entrance.getSigungu()
                    );


                    map.put(
                            "adminDong",
                            entrance.getAdminDong()
                    );


                    return map;

                })
                .toList();
    }


    /**
     * SGIS 행정동 경계 정보
     */
    private record BoundaryData(
            Geometry geometry,
            String sido,
            String sigungu,
            String adminDong
    ) {
    }


    /**
     * 현재 entrances.json 원본 구조
     */
    public record EntranceData(
            String sigCode,
            String buildingGroup,
            Double lat,
            Double lng
    ) {
    }
}
