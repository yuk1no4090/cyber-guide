package com.cyberguide.security;

import com.cyberguide.exception.BizException;
import com.cyberguide.exception.ErrorCode;
import com.cyberguide.model.User;
import com.cyberguide.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private JwtTokenProvider tokenProvider;

    @Mock
    private EmailCodeService emailCodeService;

    private AuthService authService;

    @BeforeEach
    void setUp() {
        authService = new AuthService(userRepository, passwordEncoder, tokenProvider, emailCodeService);
    }

    @Test
    void registerSuccessVerifiesEmailCodeAndIssuesToken() {
        String rawEmail = "TEST@EXAMPLE.COM";
        String normalizedEmail = "test@example.com";
        User saved = new User();
        saved.setId(UUID.randomUUID());
        saved.setEmail(normalizedEmail);
        saved.setNickname("Nick");

        when(userRepository.existsByEmail(normalizedEmail)).thenReturn(false);
        when(passwordEncoder.encode("123456")).thenReturn("encoded");
        when(userRepository.save(any(User.class))).thenReturn(saved);
        when(tokenProvider.generateUserToken(saved.getId().toString(), normalizedEmail)).thenReturn("jwt-u");

        AuthService.AuthResult result = authService.register(rawEmail, "123456", "Nick", "888888");

        assertEquals("jwt-u", result.token());
        assertEquals(normalizedEmail, result.user().email());
        verify(emailCodeService).verifyRegisterCode(normalizedEmail, "888888");
    }

    @Test
    void registerThrowsWhenEmailExists() {
        when(userRepository.existsByEmail("dup@example.com")).thenReturn(true);

        BizException ex = assertThrows(BizException.class,
            () -> authService.register("dup@example.com", "123456", null, "123456"));

        assertEquals(ErrorCode.EMAIL_ALREADY_EXISTS, ex.getErrorCode());
        verify(emailCodeService, never()).verifyRegisterCode(any(), any());
    }

    @Test
    void loginSuccessReturnsJwt() {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail("user@example.com");
        user.setPasswordHash("hash");
        user.setNickname("u");
        when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("123456", "hash")).thenReturn(true);
        when(tokenProvider.generateUserToken(user.getId().toString(), user.getEmail())).thenReturn("jwt-login");

        AuthService.AuthResult result = authService.login("user@example.com", "123456");

        assertEquals("jwt-login", result.token());
        assertEquals("user", result.user().type());
    }

    @Test
    void loginThrowsWhenPasswordWrong() {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail("user@example.com");
        user.setPasswordHash("hash");
        when(userRepository.findByEmail("user@example.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("bad-pass", "hash")).thenReturn(false);

        BizException ex = assertThrows(BizException.class, () -> authService.login("user@example.com", "bad-pass"));
        assertEquals(ErrorCode.INVALID_CREDENTIALS, ex.getErrorCode());
    }

    @Test
    void githubLoginThrowsWhenOauthNotConfigured() {
        BizException ex = assertThrows(BizException.class, () -> authService.loginWithGithubCode("code"));
        assertEquals(ErrorCode.INVALID_REQUEST, ex.getErrorCode());
    }

    @Test
    void getUserViewReturnsOptionalWhenUserExists() {
        UUID userId = UUID.randomUUID();
        User user = new User();
        user.setId(userId);
        user.setEmail("me@example.com");
        user.setNickname("Me");
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        Optional<AuthService.UserView> view = authService.getUserView(userId);

        assertEquals(true, view.isPresent());
        assertEquals("me@example.com", view.orElseThrow().email());
        assertNotNull(view.orElseThrow().id());
    }
}
