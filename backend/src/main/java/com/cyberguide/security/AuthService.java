package com.cyberguide.security;

import com.cyberguide.exception.BizException;
import com.cyberguide.exception.ErrorCode;
import com.cyberguide.model.User;
import com.cyberguide.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;
    private final EmailCodeService emailCodeService;
    public AuthService(UserRepository userRepository,
                       PasswordEncoder passwordEncoder,
                       JwtTokenProvider tokenProvider,
                       EmailCodeService emailCodeService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenProvider = tokenProvider;
        this.emailCodeService = emailCodeService;
    }

    public AuthResult register(String email, String password, String nickname, String emailCode) {
        String normalizedEmail = normalizeEmail(email);
        if (userRepository.existsByEmail(normalizedEmail)) {
            throw new BizException(ErrorCode.EMAIL_ALREADY_EXISTS);
        }
        if (password == null || password.length() < 6) {
            throw new BizException(ErrorCode.INVALID_REQUEST, "密码至少 6 位");
        }
        emailCodeService.verifyRegisterCode(normalizedEmail, emailCode);
        User user = new User();
        user.setEmail(normalizedEmail);
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setNickname(blankToNull(nickname));
        User saved = userRepository.save(user);
        return issueToken(saved);
    }

    public AuthResult login(String email, String password) {
        String normalizedEmail = normalizeEmail(email);
        User user = userRepository.findByEmail(normalizedEmail)
                .orElseThrow(() -> new BizException(ErrorCode.INVALID_CREDENTIALS));
        String passwordHash = user.getPasswordHash();
        if (passwordHash == null || password == null || !passwordEncoder.matches(password, passwordHash)) {
            throw new BizException(ErrorCode.INVALID_CREDENTIALS);
        }
        return issueToken(user);
    }

    public Optional<UserView> getUserView(UUID userId) {
        return userRepository.findById(userId).map(this::toView);
    }

    private AuthResult issueToken(User user) {
        String token = tokenProvider.generateUserToken(user.getId().toString(), user.getEmail());
        return new AuthResult(token, toView(user));
    }

    private UserView toView(User user) {
        return new UserView(
                user.getId().toString(),
                user.getEmail(),
                user.getNickname(),
                user.getAvatarUrl(),
                "user"
        );
    }

    private String normalizeEmail(String email) {
        if (email == null) {
            throw new BizException(ErrorCode.INVALID_REQUEST, "email 不能为空");
        }
        String normalized = email.trim().toLowerCase(Locale.ROOT);
        if (normalized.isBlank() || !normalized.contains("@")) {
            throw new BizException(ErrorCode.INVALID_REQUEST, "email 格式无效");
        }
        return normalized;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private String blankToNull(String value) {
        return isBlank(value) ? null : value.trim();
    }

    public record AuthResult(String token, UserView user) {}

    public record UserView(String id, String email, String nickname, String avatarUrl, String type) {}
}
