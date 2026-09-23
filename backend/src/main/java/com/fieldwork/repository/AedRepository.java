package com.fieldwork.repository;

import com.fieldwork.entity.Aed;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AedRepository
        extends JpaRepository<Aed, Long> {

    /**
     * 행정동 기준 AED 조회
     */
    List<Aed> findBySidoAndSigunguAndAdminDong(
            String sido,
            String sigungu,
            String adminDong
    );
}