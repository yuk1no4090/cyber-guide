package com.cyberguide.controller;

import com.cyberguide.exception.BizException;
import com.cyberguide.exception.ErrorCode;
import com.cyberguide.model.ChatMessageEntity;
import com.cyberguide.model.ChatSession;
import com.cyberguide.repository.ChatMessageRepository;
import com.cyberguide.repository.ChatSessionRepository;
import com.cyberguide.security.SecurityUtils;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/sessions")
public class SessionController {

    private final ChatSessionRepository chatSessionRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final ObjectMapper objectMapper;

    public SessionController(ChatSessionRepository chatSessionRepository,
                             ChatMessageRepository chatMessageRepository,
                             ObjectMapper objectMapper) {
        this.chatSessionRepository = chatSessionRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.objectMapper = objectMapper;
    }

    @GetMapping
    public ResponseEntity<?> list(@RequestParam(defaultValue = "0") int page,
                                  @RequestParam(defaultValue = "20") int size) {
        UUID userId = SecurityUtils.currentUserId()
                .orElseThrow(() -> new BizException(ErrorCode.UNAUTHORIZED, "请先登录后查看会话"));
        int safeSize = Math.max(1, Math.min(size, 100));
        int safePage = Math.max(page, 0);

        var pageable = PageRequest.of(safePage, safeSize, Sort.by(Sort.Direction.DESC, "updatedAt"));
        var result = chatSessionRepository.findByUserIdOrderByUpdatedAtDesc(userId, pageable)
                .map(this::toSessionItem);
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "items", result.getContent(),
                "page", safePage,
                "size", safeSize,
                "total", result.getTotalElements()
        )));
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody(required = false) CreateBody body) {
        UUID userId = SecurityUtils.currentUserId()
                .orElseThrow(() -> new BizException(ErrorCode.UNAUTHORIZED, "请先登录后创建会话"));
        ChatSession session = new ChatSession();
        session.setUserId(userId);
        session.setAnonymousSessionId(body != null ? body.session_id() : null);
        session.setMode(body != null && body.mode() != null && !body.mode().isBlank() ? body.mode() : "chat");
        String title = (body != null && body.title() != null && !body.title().isBlank()) ? body.title().trim() : "新对话";
        session.setTitle(title.length() > 120 ? title.substring(0, 120) : title);
        ChatSession saved = chatSessionRepository.save(session);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("session", toSessionItem(saved))));
    }

    @GetMapping("/{id}/messages")
    public ResponseEntity<?> messages(@PathVariable UUID id) {
        ChatSession session = findOwnedSession(id);
        List<ChatMessageEntity> messages = chatMessageRepository.findBySession_IdOrderBySeqAsc(session.getId());
        List<Map<String, Object>> items = messages.stream()
                .map(this::toMessageItem)
                .toList();
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "session", toSessionItem(session),
                "messages", items
        )));
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<?> delete(@PathVariable UUID id) {
        ChatSession session = findOwnedSession(id);
        chatMessageRepository.deleteBySession_Id(session.getId());
        chatSessionRepository.delete(session);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("deleted", true)));
    }

    @PutMapping("/{id}/title")
    public ResponseEntity<?> rename(@PathVariable UUID id, @RequestBody RenameBody body) {
        if (body == null || body.title() == null || body.title().isBlank()) {
            throw new BizException(ErrorCode.INVALID_REQUEST, "title 不能为空");
        }
        ChatSession session = findOwnedSession(id);
        String normalized = body.title().trim();
        if (normalized.length() > 120) {
            normalized = normalized.substring(0, 120);
        }
        session.setTitle(normalized);
        ChatSession saved = chatSessionRepository.save(session);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("session", toSessionItem(saved))));
    }

    private ChatSession findOwnedSession(UUID sessionId) {
        UUID userId = SecurityUtils.currentUserId()
                .orElseThrow(() -> new BizException(ErrorCode.UNAUTHORIZED, "请先登录后查看会话"));
        return chatSessionRepository.findByIdAndUserId(sessionId, userId)
                .orElseThrow(() -> new BizException(ErrorCode.RESOURCE_NOT_FOUND, "会话不存在"));
    }

    private Map<String, Object> toSessionItem(ChatSession session) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", session.getId());
        item.put("title", session.getTitle());
        item.put("mode", session.getMode());
        item.put("createdAt", session.getCreatedAt());
        item.put("updatedAt", session.getUpdatedAt());
        return item;
    }

    private Map<String, Object> toMessageItem(ChatMessageEntity message) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", message.getId());
        item.put("role", message.getRole());
        item.put("content", message.getContent());
        item.put("isCrisis", message.isCrisis());
        item.put("seq", message.getSeq());
        item.put("createdAt", message.getCreatedAt());
        item.put("evidence", parseEvidenceJson(message.getEvidenceJson()));
        return item;
    }

    private List<Map<String, Object>> parseEvidenceJson(String json) {
        if (json == null || json.isBlank()) {
            return Collections.emptyList();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    public record RenameBody(String title) {}
    public record CreateBody(String title, String mode, String session_id) {}
}
