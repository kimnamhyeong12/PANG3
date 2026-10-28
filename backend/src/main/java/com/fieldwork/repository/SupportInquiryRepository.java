package com.fieldwork.repository;

import com.fieldwork.entity.SupportInquiry;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface SupportInquiryRepository extends JpaRepository<SupportInquiry, Long> {
    Page<SupportInquiry> findByUser_UserId(Long userId, Pageable pageable);
    Page<SupportInquiry> findByStatus(String status, Pageable pageable);
    Optional<SupportInquiry> findByIdAndUser_UserId(Long id, Long userId);
    Optional<SupportInquiry> findByUser_UserIdAndRequestKey(Long userId, String requestKey);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from SupportInquiry i where i.id = :id")
    Optional<SupportInquiry> findLocked(@Param("id") Long id);
}
