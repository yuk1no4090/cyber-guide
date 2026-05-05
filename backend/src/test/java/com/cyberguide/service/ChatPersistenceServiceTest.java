package com.cyberguide.service;

import com.cyberguide.model.ChatMessageEntity;
import com.cyberguide.model.ChatSession;
import com.cyberguide.repository.ChatMessageRepository;
import com.cyberguide.repository.ChatSessionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChatPersistenceServiceTest {

    @Mock
    private ChatSessionRepository sessionRepository;

    @Mock
    private ChatMessageRepository messageRepository;

    private ChatPersistenceService service;

    @BeforeEach
    void setUp() {
        service = new ChatPersistenceService(sessionRepository, messageRepository, new com.fasterxml.jackson.databind.ObjectMapper());
    }

    @Test
    void persistConversationCreatesNewSessionWhenMissing() {
        UUID userId = UUID.randomUUID();
        ChatSession created = new ChatSession();
        created.setId(UUID.randomUUID());
        created.setUserId(userId);
        created.setAnonymousSessionId("anon-1");
        created.setTitle("你好");
        created.setMode("chat");

        when(sessionRepository.findTopByAnonymousSessionIdAndUserIdOrderByUpdatedAtDesc("anon-1", userId))
            .thenReturn(Optional.empty());
        when(sessionRepository.save(any(ChatSession.class))).thenReturn(created);
        when(messageRepository.countBySession_Id(created.getId())).thenReturn(0);
        when(messageRepository.save(any(ChatMessageEntity.class))).thenAnswer(inv -> inv.getArgument(0));

        service.persistConversation(
            "anon-1",
            userId,
            "chat",
            null,
            List.of(Map.of("role", "user", "content", "你好"), Map.of("role", "assistant", "content", "旧回复")),
            "新的回复",
            false
        );

        ArgumentCaptor<ChatMessageEntity> msgCaptor = ArgumentCaptor.forClass(ChatMessageEntity.class);
        verify(messageRepository, org.mockito.Mockito.times(2)).save(msgCaptor.capture());
        List<ChatMessageEntity> saved = msgCaptor.getAllValues();
        assertEquals("user", saved.get(0).getRole());
        assertEquals("assistant", saved.get(1).getRole());
        assertEquals("新的回复", saved.get(1).getContent());
    }

    @Test
    void persistConversationReusesTargetSessionWhenOwnerMatches() {
        UUID userId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        ChatSession existing = new ChatSession();
        existing.setId(sessionId);
        existing.setUserId(userId);
        existing.setTitle("已有标题");
        existing.setMode("chat");

        when(sessionRepository.findById(sessionId)).thenReturn(Optional.of(existing));
        when(sessionRepository.save(existing)).thenReturn(existing);
        when(messageRepository.countBySession_Id(sessionId)).thenReturn(5);
        when(messageRepository.save(any(ChatMessageEntity.class))).thenAnswer(inv -> inv.getArgument(0));

        service.persistConversation(
            "anon-2",
            userId,
            "chat",
            sessionId,
            List.of(Map.of("role", "user", "content", "继续聊")),
            "好的，我们继续",
            false
        );

        verify(sessionRepository, never()).findTopByAnonymousSessionIdAndUserIdOrderByUpdatedAtDesc(any(), any());
        verify(messageRepository, org.mockito.Mockito.times(2)).save(any(ChatMessageEntity.class));
    }

    @Test
    void persistConversationCreatesNewWhenTargetOwnerMismatch() {
        UUID userId = UUID.randomUUID();
        UUID anotherUserId = UUID.randomUUID();
        UUID targetId = UUID.randomUUID();
        ChatSession foreign = new ChatSession();
        foreign.setId(targetId);
        foreign.setUserId(anotherUserId);

        ChatSession fallback = new ChatSession();
        fallback.setId(UUID.randomUUID());
        fallback.setUserId(userId);
        fallback.setAnonymousSessionId("anon-3");
        fallback.setTitle("新对话");
        fallback.setMode("chat");

        when(sessionRepository.findById(targetId)).thenReturn(Optional.of(foreign));
        when(sessionRepository.findTopByAnonymousSessionIdAndUserIdOrderByUpdatedAtDesc("anon-3", userId))
            .thenReturn(Optional.empty());
        when(sessionRepository.save(any(ChatSession.class))).thenReturn(fallback);
        when(messageRepository.countBySession_Id(fallback.getId())).thenReturn(0);
        when(messageRepository.save(any(ChatMessageEntity.class))).thenAnswer(inv -> inv.getArgument(0));

        service.persistConversation(
            "anon-3",
            userId,
            "chat",
            targetId,
            List.of(Map.of("role", "user", "content", "hello")),
            "world",
            false
        );

        verify(sessionRepository).findById(targetId);
        verify(sessionRepository).findTopByAnonymousSessionIdAndUserIdOrderByUpdatedAtDesc("anon-3", userId);
        verify(messageRepository, org.mockito.Mockito.times(2)).save(any(ChatMessageEntity.class));
    }

    @Test
    void persistConversationReturnsEarlyWhenMessagesEmpty() {
        service.persistConversation("anon-4", UUID.randomUUID(), "chat", null, List.of(), "ignored", false);

        verify(sessionRepository, never()).save(any(ChatSession.class));
        verify(messageRepository, never()).save(any(ChatMessageEntity.class));
        verify(messageRepository, never()).countBySession_Id(any());
    }

    @Test
    void persistConversationDefaultsModeToChatWhenBlank() {
        UUID userId = UUID.randomUUID();
        ChatSession created = new ChatSession();
        created.setId(UUID.randomUUID());
        created.setUserId(userId);
        created.setAnonymousSessionId("anon-blank");
        created.setTitle("hello");
        created.setMode("chat");

        when(sessionRepository.findTopByAnonymousSessionIdAndUserIdOrderByUpdatedAtDesc("anon-blank", userId))
            .thenReturn(Optional.empty());
        when(sessionRepository.save(any(ChatSession.class))).thenReturn(created);
        when(messageRepository.countBySession_Id(created.getId())).thenReturn(0);
        when(messageRepository.save(any(ChatMessageEntity.class))).thenAnswer(inv -> inv.getArgument(0));

        service.persistConversation(
            "anon-blank",
            userId,
            "   ",
            null,
            List.of(Map.of("role", "user", "content", "hello")),
            "world",
            false
        );

        ArgumentCaptor<ChatSession> captor = ArgumentCaptor.forClass(ChatSession.class);
        verify(sessionRepository).save(captor.capture());
        assertEquals("chat", captor.getValue().getMode());
    }

    @Test
    void persistConversationUpdatesExistingSessionModeWhenProvided() {
        UUID userId = UUID.randomUUID();
        ChatSession existing = new ChatSession();
        UUID sessionId = UUID.randomUUID();
        existing.setId(sessionId);
        existing.setUserId(userId);
        existing.setAnonymousSessionId("anon-mode");
        existing.setTitle("已有标题");
        existing.setMode("chat");

        when(sessionRepository.findTopByAnonymousSessionIdAndUserIdOrderByUpdatedAtDesc("anon-mode", userId))
            .thenReturn(Optional.of(existing));
        when(sessionRepository.save(existing)).thenReturn(existing);
        when(messageRepository.countBySession_Id(sessionId)).thenReturn(0);
        when(messageRepository.save(any(ChatMessageEntity.class))).thenAnswer(inv -> inv.getArgument(0));

        service.persistConversation(
            "anon-mode",
            userId,
            "profile_other",
            null,
            List.of(Map.of("role", "user", "content", "hello")),
            "world",
            false
        );

        assertEquals("profile_other", existing.getMode());
        verify(sessionRepository).save(existing);
    }

    @Test
    void persistConversationSavesEvidenceJsonOnAssistantMessage() {
        UUID userId = UUID.randomUUID();
        ChatSession session = new ChatSession();
        session.setId(UUID.randomUUID());
        session.setUserId(userId);
        session.setAnonymousSessionId("anon-ev");
        session.setTitle("evidence test");
        session.setMode("chat");

        when(sessionRepository.findTopByAnonymousSessionIdAndUserIdOrderByUpdatedAtDesc("anon-ev", userId))
            .thenReturn(Optional.of(session));
        when(sessionRepository.save(any(ChatSession.class))).thenReturn(session);
        when(messageRepository.countBySession_Id(session.getId())).thenReturn(0);
        when(messageRepository.save(any(ChatMessageEntity.class))).thenAnswer(inv -> inv.getArgument(0));

        List<Map<String, Object>> evidence = List.of(
            Map.of("title", "案例A", "source", "case:x", "url", "https://x.com", "score", 8.0, "tier", "high")
        );

        service.persistConversation(
            "anon-ev", userId, "chat", null,
            List.of(Map.of("role", "user", "content", "test")),
            "回复内容", false, evidence
        );

        ArgumentCaptor<ChatMessageEntity> captor = ArgumentCaptor.forClass(ChatMessageEntity.class);
        verify(messageRepository, org.mockito.Mockito.times(2)).save(captor.capture());
        ChatMessageEntity assistantMsg = captor.getAllValues().stream()
            .filter(m -> "assistant".equals(m.getRole()))
            .findFirst()
            .orElseThrow();
        assertTrue(assistantMsg.getEvidenceJson() != null && assistantMsg.getEvidenceJson().contains("案例A"));
    }
}
