package com.cyberguide.controller;

import com.cyberguide.exception.BizException;
import com.cyberguide.model.ChatMessageEntity;
import com.cyberguide.model.ChatSession;
import com.cyberguide.repository.ChatMessageRepository;
import com.cyberguide.repository.ChatSessionRepository;
import com.cyberguide.security.AuthPrincipal;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.http.ResponseEntity;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SessionControllerTest {

    @Mock
    private ChatSessionRepository sessionRepository;

    @Mock
    private ChatMessageRepository messageRepository;

    private SessionController controller;
    private UUID userId;

    @BeforeEach
    void setUp() {
        controller = new SessionController(sessionRepository, messageRepository, new com.fasterxml.jackson.databind.ObjectMapper());
        userId = UUID.randomUUID();
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken(
                new AuthPrincipal(userId.toString(), "user", "user@test.com"),
                null,
                List.of(new SimpleGrantedAuthority("ROLE_USER"))
            )
        );
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void listReturnsPagedSessions() {
        ChatSession s = buildSession(UUID.randomUUID(), "会话A", "chat");
        when(sessionRepository.findByUserIdOrderByUpdatedAtDesc(eq(userId), any(PageRequest.class)))
            .thenReturn(new PageImpl<>(List.of(s)));

        ResponseEntity<?> response = controller.list(0, 20);

        ApiResponse<?> body = (ApiResponse<?>) response.getBody();
        Map<String, Object> data = castMap(body.getData());
        List<?> items = assertInstanceOf(List.class, data.get("items"));
        assertEquals(1, items.size());
        verify(sessionRepository).findByUserIdOrderByUpdatedAtDesc(eq(userId), any(PageRequest.class));
    }

    @Test
    void messagesReturnsOrderedItemsForOwnedSession() {
        UUID sessionId = UUID.randomUUID();
        ChatSession s = buildSession(sessionId, "测试会话", "chat");
        ChatMessageEntity m1 = buildMessage(s, "user", "你好", 1, false);
        ChatMessageEntity m2 = buildMessage(s, "assistant", "你好呀", 2, false);
        when(sessionRepository.findByIdAndUserId(sessionId, userId)).thenReturn(Optional.of(s));
        when(messageRepository.findBySession_IdOrderBySeqAsc(sessionId)).thenReturn(List.of(m1, m2));

        ResponseEntity<?> response = controller.messages(sessionId);

        ApiResponse<?> body = (ApiResponse<?>) response.getBody();
        Map<String, Object> data = castMap(body.getData());
        List<?> messages = assertInstanceOf(List.class, data.get("messages"));
        assertEquals(2, messages.size());
    }

    @Test
    void createCreatesSessionWithTrimmedTitle() {
        String longTitle = "x".repeat(140);
        ChatSession saved = buildSession(UUID.randomUUID(), "x".repeat(120), "plan");
        when(sessionRepository.save(any(ChatSession.class))).thenReturn(saved);

        ResponseEntity<?> response = controller.create(new SessionController.CreateBody(longTitle, "plan", "anon-1"));

        ApiResponse<?> body = (ApiResponse<?>) response.getBody();
        Map<String, Object> data = castMap(body.getData());
        Map<?, ?> sessionMap = assertInstanceOf(Map.class, data.get("session"));
        assertEquals("x".repeat(120), sessionMap.get("title"));

        ArgumentCaptor<ChatSession> captor = ArgumentCaptor.forClass(ChatSession.class);
        verify(sessionRepository).save(captor.capture());
        assertEquals(userId, captor.getValue().getUserId());
        assertEquals("plan", captor.getValue().getMode());
        assertEquals("anon-1", captor.getValue().getAnonymousSessionId());
    }

    @Test
    void renameUpdatesTitleForOwnedSession() {
        UUID sessionId = UUID.randomUUID();
        ChatSession session = buildSession(sessionId, "旧标题", "chat");
        when(sessionRepository.findByIdAndUserId(sessionId, userId)).thenReturn(Optional.of(session));
        when(sessionRepository.save(any(ChatSession.class))).thenAnswer(inv -> inv.getArgument(0));

        ResponseEntity<?> response = controller.rename(sessionId, new SessionController.RenameBody(" 新标题 "));

        ApiResponse<?> body = (ApiResponse<?>) response.getBody();
        Map<String, Object> data = castMap(body.getData());
        Map<?, ?> sessionMap = assertInstanceOf(Map.class, data.get("session"));
        assertEquals("新标题", sessionMap.get("title"));
    }

    @Test
    void deleteRemovesMessagesThenSession() {
        UUID sessionId = UUID.randomUUID();
        ChatSession session = buildSession(sessionId, "删除会话", "chat");
        when(sessionRepository.findByIdAndUserId(sessionId, userId)).thenReturn(Optional.of(session));

        ResponseEntity<?> response = controller.delete(sessionId);

        ApiResponse<?> body = (ApiResponse<?>) response.getBody();
        Map<String, Object> data = castMap(body.getData());
        assertEquals(true, data.get("deleted"));
        verify(messageRepository).deleteBySession_Id(sessionId);
        verify(sessionRepository).delete(session);
    }

    @Test
    void listThrowsUnauthorizedWhenAuthPrincipalMissing() {
        SecurityContextHolder.clearContext();
        assertThrows(BizException.class, () -> controller.list(0, 20));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> castMap(Object data) {
        return (Map<String, Object>) data;
    }

    private ChatSession buildSession(UUID id, String title, String mode) {
        ChatSession s = new ChatSession();
        s.setId(id);
        s.setUserId(userId);
        s.setTitle(title);
        s.setMode(mode);
        s.setAnonymousSessionId("anon");
        return s;
    }

    @Test
    void messagesReturnsEvidenceForAssistantMessages() {
        UUID sessionId = UUID.randomUUID();
        ChatSession s = buildSession(sessionId, "带引据的会话", "chat");
        ChatMessageEntity m1 = buildMessage(s, "user", "你好", 1, false);
        ChatMessageEntity m2 = buildMessage(s, "assistant", "回答", 2, false);
        m2.setEvidenceJson("[{\"title\":\"案例1\",\"source\":\"case:x\",\"url\":\"https://x.com\",\"score\":7.5,\"tier\":\"high\"}]");
        ChatMessageEntity m3 = buildMessage(s, "assistant", "旧消息", 3, false);
        when(sessionRepository.findByIdAndUserId(sessionId, userId)).thenReturn(Optional.of(s));
        when(messageRepository.findBySession_IdOrderBySeqAsc(sessionId)).thenReturn(List.of(m1, m2, m3));

        ResponseEntity<?> response = controller.messages(sessionId);

        ApiResponse<?> body = (ApiResponse<?>) response.getBody();
        Map<String, Object> data = castMap(body.getData());
        List<?> messages = assertInstanceOf(List.class, data.get("messages"));
        assertEquals(3, messages.size());

        Map<?, ?> msg2 = assertInstanceOf(Map.class, messages.get(1));
        List<?> ev = assertInstanceOf(List.class, msg2.get("evidence"));
        assertEquals(1, ev.size());

        Map<?, ?> msg3 = assertInstanceOf(Map.class, messages.get(2));
        List<?> evEmpty = assertInstanceOf(List.class, msg3.get("evidence"));
        assertEquals(0, evEmpty.size());
    }

    private ChatMessageEntity buildMessage(ChatSession session, String role, String content, int seq, boolean crisis) {
        ChatMessageEntity m = new ChatMessageEntity();
        m.setId(UUID.randomUUID());
        m.setSession(session);
        m.setRole(role);
        m.setContent(content);
        m.setSeq(seq);
        m.setCrisis(crisis);
        return m;
    }
}
