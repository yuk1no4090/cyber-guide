package com.cyberguide.controller;

import com.cyberguide.exception.BizException;
import com.cyberguide.model.User;
import com.cyberguide.repository.UserRepository;
import com.cyberguide.security.AuthPrincipal;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProfileControllerTest {

    @Mock
    private UserRepository userRepository;

    private ProfileController controller;
    private UUID userId;

    @BeforeEach
    void setUp() {
        controller = new ProfileController(userRepository, new ObjectMapper());
        userId = UUID.randomUUID();
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken(
                new AuthPrincipal(userId.toString(), "user", "p@test.com"),
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
    void getProfileReturnsParsedJson() {
        User user = new User();
        user.setId(userId);
        user.setProfileJson("{\"school\":\"某大学\",\"goal\":\"保研\"}");
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        ResponseEntity<?> response = controller.getProfile();

        ApiResponse<?> body = (ApiResponse<?>) response.getBody();
        Map<String, Object> data = castMap(body.getData());
        Map<?, ?> profile = assertInstanceOf(Map.class, data.get("profile"));
        assertEquals("某大学", profile.get("school"));
        assertEquals("保研", profile.get("goal"));
    }

    @Test
    void updateProfilePersistsJsonAndReturnsSavedProfile() {
        User user = new User();
        user.setId(userId);
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        ResponseEntity<?> response = controller.updateProfile(Map.of("gpa", "3.8", "target", "秋招"));

        ApiResponse<?> body = (ApiResponse<?>) response.getBody();
        Map<String, Object> data = castMap(body.getData());
        Map<?, ?> profile = assertInstanceOf(Map.class, data.get("profile"));
        assertEquals("3.8", profile.get("gpa"));
        assertEquals("秋招", profile.get("target"));

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(captor.capture());
        assertEquals(true, captor.getValue().getProfileJson().contains("\"gpa\":\"3.8\""));
    }

    @Test
    void getProfileThrowsUnauthorizedWhenNoSecurityContext() {
        SecurityContextHolder.clearContext();
        assertThrows(BizException.class, () -> controller.getProfile());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> castMap(Object data) {
        return (Map<String, Object>) data;
    }
}
