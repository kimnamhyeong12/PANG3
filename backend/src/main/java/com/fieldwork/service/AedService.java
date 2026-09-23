package com.fieldwork.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fieldwork.entity.Aed;
import com.fieldwork.repository.AedRepository;
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
public class AedService {

    private final AedRepository aedRepository;
    private final ObjectMapper objectMapper;
    private final SgisBoundaryService sgisBoundaryService;

    private final GeometryFactory geometryFactory =
            new GeometryFactory();

    private final GeoJsonReader geoJsonReader =
            new GeoJsonReader();


    public AedService(
            AedRepository aedRepository,
            ObjectMapper objectMapper,
            SgisBoundaryService sgisBoundaryService
    ) {
        this.aedRepository = aedRepository;
        this.objectMapper = objectMapper;
        this.sgisBoundaryService = sgisBoundaryService;
    }


    /**
     * resources/data/aeds.json 파일을 읽는다.
     */
    public List<AedData> loadAedData() {

        try {

            ClassPathResource resource =
                    new ClassPathResource("data/aeds.json");

            try (InputStream inputStream =
                         resource.getInputStream()) {

                return objectMapper.readValue(
                        inputStream,
                        new TypeReference<List<AedData>>() {}
                );
            }

        } catch (Exception e) {

            throw new RuntimeException(
                    "AED JSON 파일을 읽을 수 없습니다.",
                    e
            );
        }
    }


    /**
     * JSON 데이터를 Entity로 변환한다.
     *
     * 현재 aeds.json 구조
     *
     * {
     *   "modelNm": "...",
     *   "address": "...",
     *   "productNm": "...",
     *   "bizTel": "...",
     *   "lng": 129.0,
     *   "lat": 35.0
     * }
     */
    private Aed toEntity(AedData data) {

        Aed aed = new Aed();

        aed.setModelName(data.modelNm());
        aed.setAddress(data.address());
        aed.setProductName(data.productNm());
        aed.setBusinessTel(data.bizTel());
        aed.setLng(data.lng());
        aed.setLat(data.lat());

        return aed;
    }


    /**
     * JSON 전체 데이터를 DB에 저장한다.
     *
     * 현재 AED 데이터는 별도의 외부 고유 ID가 없으므로
     * 기존 데이터를 전체 삭제한 후 JSON 기준으로 다시 저장한다.
     */
    @Transactional
    public int importAeds() {

        List<AedData> dataList =
                loadAedData();

        System.out.println(
                "[AED] JSON 데이터: "
                        + dataList.size()
                        + "건"
        );


        /*
         * 기존 AED 데이터 삭제
         */
        aedRepository.deleteAll();

        System.out.println(
                "[AED] 기존 데이터 삭제 완료"
        );


        List<Aed> aeds =
                new ArrayList<>();


        for (AedData data : dataList) {

            /*
             * 주소가 없는 데이터는 저장하지 않는다.
             */
            if (data.address() == null
                    || data.address().isBlank()) {

                System.out.println(
                        "[AED 제외] 주소 없음"
                );

                continue;
            }


            /*
             * 좌표가 없는 데이터는 지도에서 사용할 수 없으므로
             * 저장하지 않는다.
             */
            if (data.lat() == null
                    || data.lng() == null) {

                System.out.println(
                        "[AED 제외] 좌표 없음: "
                                + data.address()
                );

                continue;
            }


            try {

                Aed aed =
                        toEntity(data);

                aeds.add(aed);

            } catch (Exception e) {

                System.out.println(
                        "[AED 변환 실패] "
                                + data.address()
                                + " / "
                                + e.getMessage()
                );
            }
        }


        /*
         * 전체 저장
         */
        aedRepository.saveAll(aeds);


        System.out.println(
                "[AED] 저장 완료: "
                        + aeds.size()
                        + "건"
        );


        return aeds.size();
    }


    /**
     * 부산광역시 전체 AED의
     * 행정동 정보를 갱신한다.
     */
    @Transactional
    public int updateAdministrativeAreas() {

        List<Aed> aeds =
                aedRepository.findAll();

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
             * AED 하나씩 행정동을 찾는다.
             */
            for (Aed aed : aeds) {

                if (aed.getLat() == null
                        || aed.getLng() == null) {

                    continue;
                }


                Point point =
                        geometryFactory.createPoint(
                                new Coordinate(
                                        aed.getLng(),
                                        aed.getLat()
                                )
                        );


                for (BoundaryData boundaryData :
                        boundaries) {

                    if (boundaryData
                            .geometry()
                            .covers(point)) {


                        aed.setSido(
                                boundaryData.sido()
                        );


                        aed.setSigungu(
                                boundaryData.sigungu()
                        );


                        aed.setAdminDong(
                                boundaryData.adminDong()
                        );


                        updatedCount++;

                        break;
                    }
                }
            }


            aedRepository.saveAll(aeds);


            System.out.println(
                    "[AED] 행정동 갱신 완료: "
                            + updatedCount
                            + "건"
            );


            return updatedCount;

        } catch (Exception e) {

            throw new RuntimeException(
                    "AED 행정동 정보를 갱신할 수 없습니다.",
                    e
            );
        }
    }


    /**
     * 전체 AED 조회
     */
    @Transactional(readOnly = true)
    public List<Aed> getAllAeds() {

        return aedRepository.findAll();
    }


    /**
     * 행정동 코드로 AED 조회
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getAedsByAdmCode(
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
         * 해당 행정동의 AED 조회
         */
        List<Aed> aeds =
                aedRepository
                        .findBySidoAndSigunguAndAdminDong(
                                sido,
                                sigungu,
                                adminDong
                        );


        /*
         * 프론트에서 사용하기 편한 형태로 변환
         */
        return aeds.stream()
                .map(aed -> {

                    Map<String, Object> map =
                            new HashMap<>();


                    map.put(
                            "aedId",
                            aed.getAedId()
                    );


                    map.put(
                            "modelName",
                            aed.getModelName()
                    );


                    map.put(
                            "address",
                            aed.getAddress()
                    );


                    map.put(
                            "productName",
                            aed.getProductName()
                    );


                    map.put(
                            "businessTel",
                            aed.getBusinessTel()
                    );


                    map.put(
                            "lat",
                            aed.getLat()
                    );


                    map.put(
                            "lng",
                            aed.getLng()
                    );


                    map.put(
                            "sido",
                            aed.getSido()
                    );


                    map.put(
                            "sigungu",
                            aed.getSigungu()
                    );


                    map.put(
                            "adminDong",
                            aed.getAdminDong()
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
     * 현재 aeds.json 원본 구조
     */
    public record AedData(
            String modelNm,
            String address,
            String productNm,
            String bizTel,
            Double lng,
            Double lat
    ) {
    }
}