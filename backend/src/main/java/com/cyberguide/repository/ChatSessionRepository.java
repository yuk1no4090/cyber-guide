package com.cyberguide.repository;

import com.cyberguide.model.ChatSession;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface ChatSessionRepository extends JpaRepository<ChatSession, UUID> {
    Page<ChatSession> findByUserIdOrderByUpdatedAtDesc(UUID userId, Pageable pageable);

    Optional<ChatSession> findByIdAndUserId(UUID id, UUID userId);
    Optional<ChatSession> findTopByAnonymousSessionIdAndUserIdOrderByUpdatedAtDesc(String anonymousSessionId, UUID userId);
    Optional<ChatSession> findTopByAnonymousSessionIdAndUserIdIsNullOrderByUpdatedAtDesc(String anonymousSessionId);

    @Modifying
    @Query("update ChatSession s set s.userId = :userId where s.anonymousSessionId = :sessionId and s.userId is null")
    int bindAnonymousSessionsToUser(@Param("sessionId") String sessionId, @Param("userId") UUID userId);
}
