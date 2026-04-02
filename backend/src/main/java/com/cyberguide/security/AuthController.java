package com.cyberguide.security;

import com.cyberguide.controller.ApiResponse;
import com.cyberguide.exception.BizException;
import com.cyberguide.exception.ErrorCode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Authentication controller — supports anonymous token + user auth.
 */
@RestController
@RequestMapping("/api/auth")
@Tag(name = "Auth", description = "Authentication — anonymous token, login, register, GitHub OAuth")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);
    private final JwtTokenProvider tokenProvider;
    private final AuthService authService;
    private final AuthUpgradeService authUpgradeService;
    private final EmailCodeService emailCodeService;

    @Value("${security.oauth.github.client-id:}")
    private String githubClientId;

    @Value("${security.oauth.github.redirect-uri:http://localhost:8080/api/auth/github/callback}")
    private String githubRedirectUri;

    @Value("${security.oauth.github.frontend-callback:http://localhost:3000}")
    private String frontendCallback;

    @Value("${security.oauth.github.allowed-redirect-origins:http://localhost:3000}")
    private String allowedRedirectOrigins;

    public AuthController(JwtTokenProvider tokenProvider,
                          AuthService authService,
                          AuthUpgradeService authUpgradeService,
                          EmailCodeService emailCodeService) {
        this.tokenProvider = tokenProvider;
        this.authService = authService;
        this.authUpgradeService = authUpgradeService;
        this.emailCodeService = emailCodeService;
    }

    /**
     * Issue an anonymous session token.
     * The frontend calls this on first load to get a JWT.
     */
    @PostMapping("/anonymous")
    @Operation(summary = "Issue an anonymous session token")
    public ResponseEntity<?> anonymous(@RequestBody(required = false) Map<String, String> body) {
        String sessionId = (body != null && body.containsKey("session_id"))
                ? body.get("session_id")
                : UUID.randomUUID().toString();

        String token = tokenProvider.generateAnonymousToken(sessionId);
        log.info("anonymous token issued: sessionId={}", sessionId);

        return ResponseEntity.ok(Map.of(
            "token", token,
            "session_id", sessionId,
            "type", "anonymous"
        ));
    }

    @PostMapping("/register")
    @Operation(summary = "Register a new user with email and password")
    public ResponseEntity<?> register(@RequestBody RegisterBody body) {
        if (body == null) {
            throw new BizException(ErrorCode.INVALID_REQUEST);
        }
        AuthService.AuthResult result = authService.register(
                body.email(),
                body.password(),
                body.nickname(),
                body.emailCode()
        );
        log.info("register success: email={}", body.email());
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "token", result.token(),
                "user", result.user(),
                "type", "user"
        )));
    }

    @PostMapping("/email-code/send")
    @Operation(summary = "Send a verification code to the given email")
    public ResponseEntity<?> sendEmailCode(@RequestBody EmailCodeSendBody body) {
        if (body == null || body.email() == null || body.email().isBlank()) {
            throw new BizException(ErrorCode.INVALID_REQUEST, "email 不能为空");
        }
        EmailCodeService.SendCodeResult result = emailCodeService.sendRegisterCode(body.email());
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "sent", true,
                "ttl_seconds", result.ttlSeconds(),
                "cooldown_seconds", result.cooldownSeconds()
        )));
    }

    @PostMapping("/login")
    @Operation(summary = "Login with email and password")
    public ResponseEntity<?> login(@RequestBody LoginBody body) {
        if (body == null) {
            throw new BizException(ErrorCode.INVALID_REQUEST);
        }
        AuthService.AuthResult result = authService.login(body.email(), body.password());
        log.info("login success: email={}", body.email());
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "token", result.token(),
                "user", result.user(),
                "type", "user"
        )));
    }

    @GetMapping("/me")
    @Operation(summary = "Get current user info")
    public ResponseEntity<?> me() {
        AuthPrincipal principal = SecurityUtils.currentPrincipal()
                .orElseThrow(() -> new BizException(ErrorCode.UNAUTHORIZED));
        if (principal.isAnonymous()) {
            return ResponseEntity.ok(ApiResponse.ok(Map.of(
                    "isLoggedIn", false,
                    "type", "anonymous",
                    "session_id", principal.id()
            )));
        }
        var user = authService.getUserView(UUID.fromString(principal.id()))
                .orElseThrow(() -> new BizException(ErrorCode.UNAUTHORIZED));
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "isLoggedIn", true,
                "type", "user",
                "user", user
        )));
    }

    @GetMapping("/github")
    @Operation(summary = "Redirect to GitHub OAuth authorization page")
    public ResponseEntity<Void> githubAuth(@RequestParam(name = "redirect_uri", required = false) String redirectUri) {
        if (githubClientId == null || githubClientId.isBlank()) {
            throw new BizException(ErrorCode.INVALID_REQUEST, "GitHub OAuth 尚未配置");
        }
        String target = (redirectUri == null || redirectUri.isBlank() || !isAllowedRedirect(redirectUri))
                ? frontendCallback
                : redirectUri;
        String state = Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(target.getBytes(StandardCharsets.UTF_8));
        String location = UriComponentsBuilder
                .fromHttpUrl("https://github.com/login/oauth/authorize")
                .queryParam("client_id", githubClientId)
                .queryParam("redirect_uri", githubRedirectUri)
                .queryParam("scope", "read:user user:email")
                .queryParam("state", state)
                .build()
                .toUriString();
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, location)
                .build();
    }

    @GetMapping("/github/callback")
    @Operation(summary = "GitHub OAuth callback — exchanges code for token")
    public ResponseEntity<Void> githubCallback(@RequestParam String code,
                                               @RequestParam(required = false) String state) {
        AuthService.AuthResult result = authService.loginWithGithubCode(code);
        String redirect = decodeRedirect(state)
                .filter(this::isAllowedRedirect)
                .orElse(frontendCallback);
        String separator = redirect.contains("?") ? "&" : "?";
        String encodedToken = URLEncoder.encode(result.token(), StandardCharsets.UTF_8);
        String location = redirect + separator + "token=" + encodedToken + "&provider=github";
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, location)
                .build();
    }

    @PostMapping("/upgrade")
    @Operation(summary = "Upgrade anonymous session data to a logged-in user")
    public ResponseEntity<?> upgrade(@RequestBody UpgradeBody body) {
        if (body == null || body.session_id() == null || body.session_id().isBlank()) {
            throw new BizException(ErrorCode.INVALID_SESSION_ID);
        }
        if (body.anonymous_token() == null || body.anonymous_token().isBlank()) {
            throw new BizException(ErrorCode.UNAUTHORIZED, "缺少匿名凭证，无法迁移会话数据");
        }
        JwtTokenProvider.TokenIdentity anonymousIdentity = tokenProvider.parseIdentity(body.anonymous_token());
        if (anonymousIdentity == null || !("anonymous".equals(anonymousIdentity.type()))) {
            throw new BizException(ErrorCode.UNAUTHORIZED, "匿名凭证无效或已过期");
        }
        if (!body.session_id().equals(anonymousIdentity.subject())) {
            throw new BizException(ErrorCode.UNAUTHORIZED, "会话身份校验失败，无法迁移数据");
        }
        UUID userId = SecurityUtils.currentUserId()
                .orElseThrow(() -> new BizException(ErrorCode.UNAUTHORIZED, "请先登录后升级数据"));
        Map<String, Integer> result = authUpgradeService.upgradeSessionData(body.session_id(), userId);
        return ResponseEntity.ok(ApiResponse.ok(Map.of("migrated", result)));
    }

    private boolean isAllowedRedirect(String redirect) {
        if (redirect == null || redirect.isBlank()) {
            return false;
        }
        URI uri;
        try {
            uri = URI.create(redirect);
        } catch (Exception e) {
            return false;
        }
        if (uri.getScheme() == null || uri.getHost() == null) {
            return false;
        }
        String origin = buildOrigin(uri.getScheme(), uri.getHost(), uri.getPort());
        List<String> allowedOrigins = java.util.Arrays.stream(allowedRedirectOrigins.split(","))
                .map(String::trim)
                .filter(s -> !s.isBlank())
                .toList();
        return allowedOrigins.contains(origin);
    }

    private String buildOrigin(String scheme, String host, int port) {
        if (port <= 0) {
            return scheme + "://" + host;
        }
        return scheme + "://" + host + ":" + port;
    }

    private java.util.Optional<String> decodeRedirect(String state) {
        if (state == null || state.isBlank()) {
            return java.util.Optional.empty();
        }
        try {
            byte[] bytes = Base64.getUrlDecoder().decode(state);
            String decoded = new String(bytes, StandardCharsets.UTF_8);
            if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
                return java.util.Optional.of(decoded);
            }
        } catch (Exception ignored) {
        }
        return java.util.Optional.empty();
    }

    public record RegisterBody(String email, String password, String nickname, String emailCode) {}

    public record LoginBody(String email, String password) {}

    public record UpgradeBody(String session_id, String anonymous_token) {}

    public record EmailCodeSendBody(String email) {}
}
