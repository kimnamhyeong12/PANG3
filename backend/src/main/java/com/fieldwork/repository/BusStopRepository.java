
package com.fieldwork.repository;

import com.fieldwork.entity.BusStop;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BusStopRepository extends JpaRepository<BusStop, Long> {

    /**
     * 부산 버스 API의 정류소 고유 ID로 조회
     */
    Optional<BusStop> findByExternalId(String externalId);

    /**
     * 정류소명으로 검색
     */
    List<BusStop> findByNameContaining(String name);
    List<BusStop> findBySidoAndSigunguAndAdminDong(
            String sido,
            String sigungu,
            String adminDong
    );

}
