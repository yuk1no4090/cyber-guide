package com.cyberguide.security;

import com.cyberguide.exception.BizException;
import com.cyberguide.exception.ErrorCode;
import com.cyberguide.model.User;
import com.cyberguide.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;
    private final EmailCodeService emailCodeService;
    private final WebClient webClient;

    @Value("${security.oauth.github.client-id:}")
    private String githubClientId;

    @Value("${security.oauth.github.client-secret:}")
    private String githubClientSecret;

    public AuthService(UserRepository userRepository,
                       PasswordEncoder passwordEncoder,
                       JwtTokenProvider tokenProvider,
                       EmailCodeService emailCodeService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenProvider = tokenProvider;
        this.emailCodeService = emailCodeService;
        this.webClient = WebClient.builder().build();
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

    public AuthResult loginWithGithubCode(String code) {
        if (isBlank(githubClientId) || isBlank(githubClientSecret)) {
            throw new BizException(ErrorCode.INVALID_REQUEST, "GitHub OAuth 尚未配置");
        }
        String accessToken = exchangeGithubAccessToken(code);
        GithubUser githubUser = fetchGithubUser(accessToken);
        User user = upsertGithubUser(githubUser);
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

    private String exchangeGithubAccessToken(String code) {
        @SuppressWarnings("unchecked")
        Map<String, Object> result = webClient.post()
                .uri("https://github.com/login/oauth/access_token")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .accept(MediaType.APPLICATION_JSON)
                .body(BodyInserters.fromFormData("client_id", githubClientId)
                        .with("client_secret", githubClientSecret)
                        .with("code", code))
                .retrieve()
                .bodyToMono(Map.class)
                .block();
        if (result == null || result.get("access_token") == null) {
            throw new BizException(ErrorCode.INVALID_REQUEST, "GitHub 登录失败（token 交换失败）");
        }
        return String.valueOf(result.get("access_token"));
    }

    private GithubUser fetchGithubUser(String accessToken) {
        @SuppressWarnings("unchecked")
        Map<String, Object> user = webClient.get()
                .uri("https://api.github.com/user")
                .headers(h -> h.setBearerAuth(accessToken))
                .accept(MediaType.APPLICATION_JSON)
                .retrieve()
                .bodyToMono(Map.class)
                .block();
        if (user == null || user.get("id") == null) {
            throw new BizException(ErrorCode.INVALID_REQUEST, "GitHub 登录失败（用户信息为空）");
        }

        String githubId = String.valueOf(user.get("id"));
        String nickname = user.get("name") != null ? String.valueOf(user.get("name")) : null;
        if (isBlank(nickname) && user.get("login") != null) {
            nickname = String.valueOf(user.get("login"));
        }
        String avatarUrl = user.get("avatar_url") != null ? String.valueOf(user.get("avatar_url")) : null;
        String email = user.get("email") != null ? String.valueOf(user.get("email")) : null;

        if (isBlank(email)) {
            email = fetchGithubPrimaryEmail(accessToken).orElseGet(
                    () -> githubId + "@users.noreply.github.com"
            );
        }
        return new GithubUser(githubId, normalizeEmail(email), blankToNull(nickname), blankToNull(avatarUrl));
    }

    private Optional<String> fetchGithubPrimaryEmail(String accessToken) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> emails = webClient.get()
                .uri("https://api.github.com/user/emails")
                .headers(h -> h.setBearerAuth(accessToken))
                .accept(MediaType.APPLICATION_JSON)
                .retrieve()
                .bodyToMono(List.class)
                .block();

        if (emails == null || emails.isEmpty()) {
            return Optional.empty();
        }
        return emails.stream()
                .sorted(Comparator.comparing((Map<String, Object> m) -> asBoolean(m.get("primary"))).reversed())
                .map(m -> m.get("email"))
                .filter(e -> e != null)
                .map(String::valueOf)
                .filter(e -> !e.isBlank())
                .findFirst();
    }

    private User upsertGithubUser(GithubUser githubUser) {
        Optional<User> byGithub = userRepository.findByGithubId(githubUser.githubId());
        if (byGithub.isPresent()) {
            User existing = byGithub.get();
            existing.setAvatarUrl(githubUser.avatarUrl());
            if (existing.getNickname() == null && githubUser.nickname() != null) {
                existing.setNickname(githubUser.nickname());
            }
            if (existing.getEmail() == null || existing.getEmail().isBlank()) {
                existing.setEmail(githubUser.email());
            }
            return userRepository.save(existing);
        }

        Optional<User> byEmail = userRepository.findByEmail(githubUser.email());
        if (byEmail.isPresent()) {
            User existing = byEmail.get();
            existing.setGithubId(githubUser.githubId());
            existing.setAvatarUrl(githubUser.avatarUrl());
            if (existing.getNickname() == null && githubUser.nickname() != null) {
                existing.setNickname(githubUser.nickname());
            }
            return userRepository.save(existing);
        }

        User created = new User();
        created.setEmail(githubUser.email());
        created.setGithubId(githubUser.githubId());
        created.setNickname(githubUser.nickname());
        created.setAvatarUrl(githubUser.avatarUrl());
        return userRepository.save(created);
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

    private boolean asBoolean(Object value) {
        if (value instanceof Boolean b) {
            return b;
        }
        return value != null && "true".equalsIgnoreCase(String.valueOf(value));
    }

    private record GithubUser(String githubId, String email, String nickname, String avatarUrl) {}

    public record AuthResult(String token, UserView user) {}

    public record UserView(String id, String email, String nickname, String avatarUrl, String type) {}
}
