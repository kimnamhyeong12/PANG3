package com.fieldwork.repository;
import com.fieldwork.entity.EmailChallenge;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface EmailChallengeRepository extends JpaRepository<EmailChallenge, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from EmailChallenge c where c.tokenHash = :hash")
    Optional<EmailChallenge> findLocked(@Param("hash") String hash);
    @Modifying
    @Query("update EmailChallenge c set c.used = true where c.user.userId = :userId and c.purpose = :purpose")
    void invalidate(@Param("userId") Long userId, @Param("purpose") String purpose);
    @Modifying
    @Query("delete from EmailChallenge c where c.expiresAt < :now")
    void deleteExpired(@Param("now") java.time.Instant now);
}
