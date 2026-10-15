package com.fieldwork.repository;

import com.fieldwork.entity.AuthSession;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface AuthSessionRepository extends JpaRepository<AuthSession, Long> {
    Optional<AuthSession> findByAccessHash(String hash);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from AuthSession s where s.refreshHash = :hash")
    Optional<AuthSession> findRefreshLocked(@Param("hash") String hash);
    @Modifying
    @Query("update AuthSession s set s.revoked = true where s.user.userId = :userId")
    void revokeAll(@Param("userId") Long userId);
    @Modifying
    @Query("delete from AuthSession s where s.refreshExpiresAt < :now")
    void deleteExpired(@Param("now") java.time.Instant now);
}
