package com.fieldwork.controller;

import com.fieldwork.entity.Entrance;
import com.fieldwork.service.EntranceService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/entrances")
public class EntranceController {

    private final EntranceService entranceService;


    public EntranceController(EntranceService entranceService) {

        this.entranceService = entranceService;
    }


    /**
     * entrances.json 데이터를 DB에 저장한다.
     */
    @PostMapping("/import")
    public Map<String, Object> importEntrances() {

        int savedCount =
                entranceService.importEntrances();


        return Map.of(
                "success", true,
                "savedCount", savedCount
        );
    }


    /**
     * 부산 전체 건물 출입구 조회
     */
    @GetMapping
    public List<Entrance> getAllEntrances() {

        return entranceService.getAllEntrances();
    }


    /**
     * 행정동 코드로 건물 출입구 조회
     */
    @GetMapping("/by-dong")
    public List<Map<String, Object>> getEntrancesByDong(
            @RequestParam String admCode
    ) {

        return entranceService.getEntrancesByAdmCode(
                admCode
        );
    }


    /**
     * 건물 출입구의 행정동 정보를 갱신한다.
     *
     * 좌표를 기준으로 부산광역시 행정동 경계와
     * 비교하여 sido / sigungu / adminDong을 저장한다.
     */
    @PostMapping("/update-administrative-areas")
    public Map<String, Object> updateAdministrativeAreas() {

        int updatedCount =
                entranceService.updateAdministrativeAreas();


        return Map.of(
                "success", true,
                "updatedCount", updatedCount
        );
    }
}
