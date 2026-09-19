
package com.fieldwork.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.io.geojson.GeoJsonReader;
import com.fieldwork.entity.BusStop;
import com.fieldwork.repository.BusStopRepository;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class BusStopService {

    private final BusStopRepository busStopRepository;
    private final ObjectMapper objectMapper;
    private final SgisBoundaryService sgisBoundaryService;

    private final GeometryFactory geometryFactory = new GeometryFactory();
    private final GeoJsonReader geoJsonReader = new GeoJsonReader();

    public BusStopService(
            BusStopRepository busStopRepository,
            ObjectMapper objectMapper,
            SgisBoundaryService sgisBoundaryService
    ) {
        this.busStopRepository = busStopRepository;
        this.objectMapper = objectMapper;
        this.sgisBoundaryService = sgisBoundaryService;
    }
    /**
     * resources/data/bus_stops.json 파일을 읽는다.
     */
    public List<BusStopData> loadBusStopData() {

        try {
            ClassPathResource resource =
                    new ClassPathResource("data/bus_stops.json");

            try (InputStream inputStream = resource.getInputStream()) {

                return objectMapper.readValue(
                        inputStream,
                        new TypeReference<List<BusStopData>>() {}
                );
            }

        } catch (Exception e) {
            throw new RuntimeException(
                    "버스 정류장 JSON 파일을 읽을 수 없습니다.",
                    e
            );
        }
    }

    /**
     * JSON 원본 데이터를 DB Entity로 변환한다.
     */
    private BusStop toEntity(BusStopData data) {

        BusStop busStop = new BusStop();

        busStop.setExternalId(data.bstopid());
        busStop.setName(data.bstopnm());
        busStop.setArsNo(data.arsno());
        busStop.setLng(data.gpsx());
        busStop.setLat(data.gpsy());
        busStop.setStopType(data.stoptype());

        return busStop;
    }

    /**
     * JSON 전체 데이터를 DB에 저장한다.
     */
    @Transactional
    public int importBusStops() {

        List<BusStopData> dataList = loadBusStopData();

        int savedCount = 0;

        for (BusStopData data : dataList) {

            if (data.bstopid() == null
                    || data.bstopid().isBlank()) {
                continue;
            }

            // 이미 저장된 정류장은 다시 저장하지 않는다.
            if (busStopRepository
                    .findByExternalId(data.bstopid())
                    .isPresent()) {
                continue;
            }

            BusStop busStop = toEntity(data);

            busStopRepository.save(busStop);

            savedCount++;
        }

        return savedCount;
    }
    @Transactional
    public int updateAdministrativeAreas() {

        List<BusStop> busStops =
                busStopRepository.findAll();

        int updatedCount = 0;

        // 부산광역시 전체 행정동 경계를 가져온다.
        JsonNode boundary =
                sgisBoundaryService.getSidoAdministrativeDongBoundaries(
                        "부산광역시"
                );

        try {

            List<BoundaryData> boundaries = new ArrayList<>();

            for (JsonNode feature : boundary.path("features")) {

                JsonNode properties =
                        feature.path("properties");

                JsonNode geometryNode =
                        feature.path("geometry");

                Geometry geometry =
                        geoJsonReader.read(
                                geometryNode.toString()
                        );

                String admName =
                        properties.path("adm_nm").asText(null);

                if (admName == null || admName.isBlank()) {
                    continue;
                }

                String[] parts =
                        admName.trim().split("\\s+");

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

            for (BusStop busStop : busStops) {

                if (busStop.getLat() == null
                        || busStop.getLng() == null) {
                    continue;
                }

                Point point =
                        geometryFactory.createPoint(
                                new Coordinate(
                                        busStop.getLng(),
                                        busStop.getLat()
                                )
                        );

                for (BoundaryData boundaryData : boundaries) {

                    if (boundaryData.geometry().covers(point)) {

                        busStop.setSido(
                                boundaryData.sido()
                        );

                        busStop.setSigungu(
                                boundaryData.sigungu()
                        );

                        busStop.setAdminDong(
                                boundaryData.adminDong()
                        );

                        updatedCount++;

                        break;
                    }
                }
            }

            busStopRepository.saveAll(busStops);

            return updatedCount;

        } catch (Exception e) {

            throw new RuntimeException(
                    "버스 정류장 행정동 정보를 갱신할 수 없습니다.",
                    e
            );
        }
    }

    private record BoundaryData(
            Geometry geometry,
            String sido,
            String sigungu,
            String adminDong
    ) {
    }
    /**
     * 부산 버스 API JSON의 원본 구조를 표현하는 DTO
     */
    public record BusStopData(
            String bstopid,
            String bstopnm,
            String arsno,
            Double gpsx,
            Double gpsy,
            String stoptype
    ) {
    }
    @Transactional(readOnly = true)
    public List<BusStop> getAllBusStops() {
        return busStopRepository.findAll();
    }
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getBusStopsByAdmCode(String admCode) {

        JsonNode boundary =
                sgisBoundaryService.getAdministrativeBoundaries(admCode);

        String admName = null;

        for (JsonNode feature : boundary.path("features")) {

            admName = feature.path("properties")
                    .path("adm_nm")
                    .asText(null);

            if (admName != null && !admName.isBlank()) {
                break;
            }
        }

        if (admName == null || admName.isBlank()) {
            throw new IllegalStateException(
                    "SGIS 응답에서 행정동 이름을 찾을 수 없습니다. admCode: "
                            + admCode
            );
        }

        String[] parts =
                admName.trim().split("\\s+");

        if (parts.length < 3) {
            throw new IllegalStateException(
                    "SGIS 행정동 이름 형식이 예상과 다릅니다: "
                            + admName
            );
        }

        String sido = parts[0];
        String sigungu = parts[1];
        String adminDong = parts[2];

        List<BusStop> busStops =
                busStopRepository.findBySidoAndSigunguAndAdminDong(
                        sido,
                        sigungu,
                        adminDong
                );

        return busStops.stream()
                .map(busStop -> {

                    Map<String, Object> map =
                            new HashMap<>();

                    map.put(
                            "busStopId",
                            busStop.getBusStopId()
                    );

                    map.put(
                            "externalId",
                            busStop.getExternalId()
                    );

                    map.put(
                            "name",
                            busStop.getName()
                    );

                    map.put(
                            "arsNo",
                            busStop.getArsNo()
                    );

                    map.put(
                            "lat",
                            busStop.getLat()
                    );

                    map.put(
                            "lng",
                            busStop.getLng()
                    );

                    map.put(
                            "stopType",
                            busStop.getStopType()
                    );

                    map.put(
                            "sido",
                            busStop.getSido()
                    );

                    map.put(
                            "sigungu",
                            busStop.getSigungu()
                    );

                    map.put(
                            "adminDong",
                            busStop.getAdminDong()
                    );

                    return map;
                })
                .toList();
    }
}
