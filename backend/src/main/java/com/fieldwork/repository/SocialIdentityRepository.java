package com.fieldwork.repository;

import com.fieldwork.entity.SocialIdentity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface SocialIdentityRepository extends JpaRepository<SocialIdentity, Long> {
    Optional<SocialIdentity> findByProviderAndSubject(String provider, String subject);
    Optional<SocialIdentity> findByUser_UserIdAndProvider(Long userId, String provider);
    List<SocialIdentity> findByUser_UserId(Long userId);
    void deleteByUser_UserId(Long userId);
}
