package com.fieldwork.repository;

import com.fieldwork.entity.PushToken;
import com.fieldwork.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PushTokenRepository extends JpaRepository<PushToken, Long> {

    Optional<PushToken> findByExpoPushToken(String expoPushToken);

    List<PushToken> findByUserAndActiveTrue(User user);
}
