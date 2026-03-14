package com.cyberguide.repository;

import com.cyberguide.model.Feedback;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface FeedbackRepository extends JpaRepository<Feedback, UUID> {
    List<Feedback> findByUserIdOrderByCreatedAtDesc(UUID userId);

    @Modifying
    @Query("update Feedback f set f.userId = :userId where f.sessionId = :sessionId and f.userId is null")
    int bindSessionToUser(@Param("sessionId") String sessionId, @Param("userId") UUID userId);
}
