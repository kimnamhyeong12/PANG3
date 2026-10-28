package com.fieldwork.repository;
import com.fieldwork.entity.GroupInviteLink;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import java.util.Optional;
public interface GroupInviteLinkRepository extends JpaRepository<GroupInviteLink,Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE) Optional<GroupInviteLink> findByTokenHash(String tokenHash);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select l from GroupInviteLink l where l.id = :id")
    Optional<GroupInviteLink> locked(Long id);
}
