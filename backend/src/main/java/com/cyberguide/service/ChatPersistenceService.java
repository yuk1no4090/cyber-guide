package com.cyberguide.service;

import com.cyberguide.model.ChatMessageEntity;
import com.cyberguide.model.ChatSession;
import com.cyberguide.repository.ChatMessageRepository;
import com.cyberguide.repository.ChatSessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class ChatPersistenceService {

    private static final Logger log = LoggerFactory.getLogger(ChatPersistenceService.class);

    private final ChatSessionRepository sessionRepository;
    private final ChatMessageRepository messageRepository;
    private final ObjectMapper objectMapper;

    public ChatPersistenceService(ChatSessionRepository sessionRepository,
                                  ChatMessageRepository messageRepository,
                                  ObjectMapper objectMapper) {
        this.sessionRepository = sessionRepository;
        this.messageRepository = messageRepository;
        this.objectMapper = objectMapper;
    }

    @Async
    @Transactional
    public void persistConversation(String anonymousSessionId,
                                    UUID userId,
                                    String mode,
                                    UUID targetChatSessionId,
                                    List<Map<String, String>> requestMessages,
                                    String assistantMessage,
                                    boolean isCrisis) {
        persistConversation(anonymousSessionId, userId, mode, targetChatSessionId,
                requestMessages, assistantMessage, isCrisis, null);
    }

    @Async
    @Transactional
    public void persistConversation(String anonymousSessionId,
                                    UUID userId,
                                    String mode,
                                    UUID targetChatSessionId,
                                    List<Map<String, String>> requestMessages,
                                    String assistantMessage,
                                    boolean isCrisis,
                                    List<Map<String, Object>> evidence) {
        try {
            if (anonymousSessionId == null || anonymousSessionId.isBlank()) {
                return;
            }
            if (requestMessages == null || requestMessages.isEmpty()) {
                return;
            }

            String title = buildTitle(requestMessages);
            ChatSession chatSession = loadOrCreateSession(anonymousSessionId, userId, mode, title, targetChatSessionId);
            int seq = messageRepository.countBySession_Id(chatSession.getId());

            Map<String, String> lastUserMessage = requestMessages.stream()
                    .filter(m -> "user".equals(m.get("role")))
                    .reduce((a, b) -> b)
                    .orElse(null);
            if (lastUserMessage != null) {
                ChatMessageEntity userMsg = new ChatMessageEntity();
                userMsg.setSession(chatSession);
                userMsg.setRole("user");
                userMsg.setContent(lastUserMessage.getOrDefault("content", ""));
                userMsg.setSeq(++seq);
                userMsg.setCrisis(false);
                messageRepository.save(userMsg);
            }

            ChatMessageEntity assistantMsg = new ChatMessageEntity();
            assistantMsg.setSession(chatSession);
            assistantMsg.setRole("assistant");
            assistantMsg.setContent(assistantMessage == null ? "" : assistantMessage);
            assistantMsg.setSeq(++seq);
            assistantMsg.setCrisis(isCrisis);
            if (evidence != null && !evidence.isEmpty()) {
                try {
                    assistantMsg.setEvidenceJson(objectMapper.writeValueAsString(evidence));
                } catch (JsonProcessingException e) {
                    log.warn("failed to serialize evidence: sessionId={}", anonymousSessionId, e);
                }
            }
            messageRepository.save(assistantMsg);
        } catch (Exception e) {
            log.warn("persist conversation failed: sessionId={}", anonymousSessionId, e);
        }
    }

    private ChatSession loadOrCreateSession(String anonymousSessionId,
                                            UUID userId,
                                            String mode,
                                            String title,
                                            UUID targetChatSessionId) {
        ChatSession session = null;
        if (targetChatSessionId != null) {
            session = sessionRepository.findById(targetChatSessionId).orElse(null);
            if (session != null) {
                boolean ownerMismatch = userId != null
                        ? !userId.equals(session.getUserId())
                        : session.getUserId() != null;
                if (ownerMismatch) {
                    session = null;
                }
            }
        }
        if (session == null && userId != null) {
            session = sessionRepository.findTopByAnonymousSessionIdAndUserIdOrderByUpdatedAtDesc(anonymousSessionId, userId).orElse(null);
        }
        if (session != null) {
            if (session.getTitle() == null || session.getTitle().isBlank()) {
                session.setTitle(title);
            }
            if (mode != null && !mode.isBlank()) {
                session.setMode(mode);
            }
            return sessionRepository.save(session);
        }
        ChatSession created = new ChatSession();
        created.setAnonymousSessionId(anonymousSessionId);
        created.setUserId(userId);
        created.setMode((mode == null || mode.isBlank()) ? "chat" : mode);
        created.setTitle(title);
        return sessionRepository.save(created);
    }

    private String buildTitle(List<Map<String, String>> messages) {
        String firstUser = messages.stream()
                .filter(m -> "user".equals(m.get("role")))
                .map(m -> m.getOrDefault("content", "新对话"))
                .findFirst()
                .orElse("新对话");
        String oneLine = firstUser.replace('\n', ' ').trim();
        if (oneLine.length() <= 20) {
            return oneLine.isEmpty() ? "新对话" : oneLine;
        }
        return oneLine.substring(0, 20);
    }
}
