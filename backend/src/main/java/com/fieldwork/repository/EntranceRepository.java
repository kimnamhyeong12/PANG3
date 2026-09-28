package com.fieldwork.repository;

import com.fieldwork.entity.Entrance;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EntranceRepository
        extends JpaRepository<Entrance, Long> {

    /**
     * 행정동 기준 건물 출입구 조회
     */
    List<Entrance> findBySidoAndSigunguAndAdminDong(
            String sido,
            String sigungu,
            String adminDong
    );
}
