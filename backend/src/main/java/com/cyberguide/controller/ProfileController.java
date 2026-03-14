package com.cyberguide.controller;

import com.cyberguide.exception.BizException;
import com.cyberguide.exception.ErrorCode;
import com.cyberguide.model.User;
import com.cyberguide.repository.UserRepository;
import com.cyberguide.security.SecurityUtils;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/profile")
public class ProfileController {

    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    public ProfileController(UserRepository userRepository, ObjectMapper objectMapper) {
        this.userRepository = userRepository;
        this.objectMapper = objectMapper;
    }

    @GetMapping
    public ResponseEntity<?> getProfile() {
        User user = currentUser();
        Map<String, Object> profile = parseProfile(user.getProfileJson());
        return ResponseEntity.ok(ApiResponse.ok(Map.of("profile", profile)));
    }

    @PutMapping
    public ResponseEntity<?> updateProfile(@RequestBody Map<String, Object> profile) {
        User user = currentUser();
        try {
            user.setProfileJson(objectMapper.writeValueAsString(profile == null ? Collections.emptyMap() : profile));
            User saved = userRepository.save(user);
            return ResponseEntity.ok(ApiResponse.ok(Map.of("profile", parseProfile(saved.getProfileJson()))));
        } catch (JsonProcessingException e) {
            throw new BizException(ErrorCode.INVALID_REQUEST, "画像 JSON 无效");
        }
    }

    private User currentUser() {
        UUID userId = SecurityUtils.currentUserId()
                .orElseThrow(() -> new BizException(ErrorCode.UNAUTHORIZED, "请先登录"));
        return userRepository.findById(userId)
                .orElseThrow(() -> new BizException(ErrorCode.UNAUTHORIZED));
    }

    private Map<String, Object> parseProfile(String json) {
        if (json == null || json.isBlank()) {
            return Collections.emptyMap();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            return Collections.emptyMap();
        }
    }
}
