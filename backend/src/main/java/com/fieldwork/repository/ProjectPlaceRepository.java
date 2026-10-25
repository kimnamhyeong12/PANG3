package com.fieldwork.repository;
import com.fieldwork.entity.ProjectPlace;
import java.util.List;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
public interface ProjectPlaceRepository extends JpaRepository<ProjectPlace,Long> {
 @Lock(LockModeType.PESSIMISTIC_WRITE)
 @Query("select p from ProjectPlace p where p.project.projectId = :id order by p.placeId")
 List<ProjectPlace> lockProjectPlaces(@Param("id") Long id);
 List<ProjectPlace> findByProject_ProjectIdOrderByPlaceId(Long id);
}
