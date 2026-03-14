package com.cyberguide.repository;

import com.cyberguide.model.ChatMessageEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ChatMessageRepository extends JpaRepository<ChatMessageEntity, UUID> {
    List<ChatMessageEntity> findBySession_IdOrderBySeqAsc(UUID sessionId);
    void deleteBySession_Id(UUID sessionId);
    int countBySession_Id(UUID sessionId);
}
