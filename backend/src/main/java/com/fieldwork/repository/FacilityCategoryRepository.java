package com.fieldwork.repository;
import com.fieldwork.entity.FacilityCategory;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
public interface FacilityCategoryRepository extends JpaRepository<FacilityCategory,Long>{Optional<FacilityCategory> findByName(String name);}
