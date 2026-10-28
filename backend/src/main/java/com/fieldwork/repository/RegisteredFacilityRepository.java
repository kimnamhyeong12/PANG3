package com.fieldwork.repository;
import com.fieldwork.entity.RegisteredFacility;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface RegisteredFacilityRepository extends JpaRepository<RegisteredFacility,Long>{
    List<RegisteredFacility> findByCategoryKeyAndSidoAndSigunguAndAdminDong(String key,String sido,String sigungu,String dong);
}
