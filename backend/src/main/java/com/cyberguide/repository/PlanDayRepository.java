package com.cyberguide.repository;

import com.cyberguide.model.PlanDay;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlanDayRepository extends JpaRepository<PlanDay, UUID> {
    List<PlanDay> findBySessionIdOrderByDayIndexAsc(String sessionId);
    Optional<PlanDay> findBySessionIdAndDayIndex(String sessionId, int dayIndex);
    List<PlanDay> findByUserIdOrderByDayIndexAsc(UUID userId);

    @Modifying
    @Query("update PlanDay p set p.userId = :userId where p.sessionId = :sessionId and p.userId is null")
    int bindSessionToUser(@Param("sessionId") String sessionId, @Param("userId") UUID userId);
}
