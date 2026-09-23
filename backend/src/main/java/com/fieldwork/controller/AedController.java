package com.fieldwork.controller;

import com.fieldwork.entity.Aed;
import com.fieldwork.service.AedService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/aeds")
public class AedController {

    private final AedService aedService;


    public AedController(AedService aedService) {

        this.aedService = aedService;
    }


    /**
     * aeds.json 데이터를 DB에 저장한다.
     */
    @PostMapping("/import")
    public Map<String, Object> importAeds() {

        int savedCount =
                aedService.importAeds();


        return Map.of(
                "success", true,
                "savedCount", savedCount
        );
    }


    /**
     * 부산 전체 AED 조회
     */
    @GetMapping
    public List<Aed> getAllAeds() {

        return aedService.getAllAeds();
    }


    /**
     * 행정동 코드로 AED 조회
     */
    @GetMapping("/by-dong")
    public List<Map<String, Object>> getAedsByDong(
            @RequestParam String admCode
    ) {

        return aedService.getAedsByAdmCode(
                admCode
        );
    }


    /**
     * AED의 행정동 정보를 갱신한다.
     *
     * 좌표를 기준으로 부산광역시 행정동 경계와
     * 비교하여 sido / sigungu / adminDong을 저장한다.
     */
    @PostMapping("/update-administrative-areas")
    public Map<String, Object> updateAdministrativeAreas() {

        int updatedCount =
                aedService.updateAdministrativeAreas();


        return Map.of(
                "success", true,
                "updatedCount", updatedCount
        );
    }
}