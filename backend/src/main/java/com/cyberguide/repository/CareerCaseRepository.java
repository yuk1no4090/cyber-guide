package com.cyberguide.repository;

import com.cyberguide.model.CareerCase;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface CareerCaseRepository extends JpaRepository<CareerCase, UUID> {

    @Query("SELECT c FROM CareerCase c WHERE " +
           "(:category IS NULL OR c.category = :category) " +
           "ORDER BY c.qualityScore DESC")
    List<CareerCase> findCases(@Param("category") String category, Pageable pageable);

    @Query("SELECT c FROM CareerCase c WHERE " +
           "c.background IS NOT NULL AND c.background <> '' AND " +
           "(:category IS NULL OR c.category = :category) " +
           "ORDER BY c.qualityScore DESC")
    List<CareerCase> findExtractedCases(@Param("category") String category, Pageable pageable);

    boolean existsByDedupeHash(String dedupeHash);
}
