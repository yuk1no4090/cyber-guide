package com.cyberguide.repository;

import com.cyberguide.model.CrawledArticle;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.UUID;

public interface CrawledArticleRepository extends JpaRepository<CrawledArticle, UUID> {

    List<CrawledArticle> findBySourceNameOrderByCrawlTimeDesc(String sourceName, Pageable pageable);

    @Query("SELECT a FROM CrawledArticle a WHERE " +
           "(:source IS NULL OR a.sourceName = :source) " +
           "ORDER BY a.crawlTime DESC")
    List<CrawledArticle> findArticles(@Param("source") String source, Pageable pageable);

    boolean existsByDedupeHash(String dedupeHash);
}
