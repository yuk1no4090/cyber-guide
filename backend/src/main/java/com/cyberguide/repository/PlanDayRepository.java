package com.cyberguide.repository;

import com.cyberguide.model.PlanDay;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlanDayRepository extends JpaRepository<PlanDay, UUID> {
    List<PlanDay> findBySessionIdOrderByDayIndexAsc(String sessionId);
    Optional<PlanDay> findBySessionIdAndDayIndex(String sessionId, int dayIndex);
}
