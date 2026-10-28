package com.fieldwork.repository;
import com.fieldwork.entity.FacilityApplication;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.domain.*;
import jakarta.persistence.LockModeType;
import java.util.Optional;
public interface FacilityApplicationRepository extends JpaRepository<FacilityApplication,Long>{
    Page<FacilityApplication> findByUser_UserId(Long id,Pageable page);
    Optional<FacilityApplication> findByIdAndUser_UserId(Long id,Long userId);
    Optional<FacilityApplication> findByUser_UserIdAndRequestKey(Long userId,String requestKey);
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select a from FacilityApplication a where a.id=:id")
    Optional<FacilityApplication> locked(@org.springframework.data.repository.query.Param("id") Long id);
}
