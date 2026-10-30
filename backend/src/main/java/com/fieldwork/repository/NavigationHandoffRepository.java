package com.fieldwork.repository;
import com.fieldwork.entity.NavigationHandoff;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
public interface NavigationHandoffRepository extends JpaRepository<NavigationHandoff,Long> {
    @Modifying
    @Query("delete from NavigationHandoff h where h.userId=:userId and h.requestId=:requestId")
    int acknowledge(@Param("userId") Long userId,@Param("requestId") String requestId);
}
