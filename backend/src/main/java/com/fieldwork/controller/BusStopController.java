package com.fieldwork.controller;

import com.fieldwork.entity.BusStop;
import com.fieldwork.service.BusStopService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/bus-stops")
public class BusStopController {

    private final BusStopService busStopService;

    public BusStopController(BusStopService busStopService) {
        this.busStopService = busStopService;
    }

    /**
     * resources/data/bus_stops.json의
     * 버스 정류장 데이터를 DB에 저장한다.
     */
    @PostMapping("/import")
    public Map<String, Object> importBusStops() {

        int savedCount = busStopService.importBusStops();

        return Map.of(
                "success", true,
                "savedCount", savedCount
        );
    }
    @GetMapping
    public List<BusStop> getAllBusStops() {
        return busStopService.getAllBusStops();
    }
    @GetMapping("/by-dong")
    public List<Map<String, Object>> getBusStopsByDong(
            @RequestParam String admCode
    ) {
        return busStopService.getBusStopsByAdmCode(admCode);
    }
    @PostMapping("/update-administrative-areas")
    public Map<String, Object> updateAdministrativeAreas() {

        int updatedCount =
                busStopService.updateAdministrativeAreas();

        return Map.of(
                "success", true,
                "updatedCount", updatedCount
        );
    }
}