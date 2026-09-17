package com.cyberguide.security;

import com.cyberguide.controller.ApiResponse;
import com.cyberguide.exception.BizException;
import com.cyberguide.exception.ErrorCode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * Authentication controller — supports anonymous token + user auth.
 */
@RestController
@RequestMapping("/api/auth")
@Tag(name = "Auth", description = "Authentication: anonymous token, login, register")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);
    private final JwtTokenProvider tokenProvider;
    private final AuthService authService;
    private final AuthUpgradeService authUpgradeService;
    private final EmailCodeService emailCodeService;
    private final AuthRateLimiter authRateLimiter;

    public AuthController(JwtTokenProvider tokenProvider,
                          AuthService authService,
                          AuthUpgradeService authUpgradeService,
                          EmailCodeService emailCodeService,
                          AuthRateLimiter authRateLimiter) {
        this.tokenProvider = tokenProvider;
        this.authService = authService;
        this.authUpgradeService = authUpgradeService;
        this.emailCodeService = emailCodeService;
        this.authRateLimiter = authRateLimiter;
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
        authRateLimiter.checkRegister(body.email());
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

    /**
     * Public capability probe so the client can render an accurate auth form.
     * <p>
     * Without this the frontend had no way to know whether a verification code
     * is actually required, so it rendered the code field unconditionally and
     * users sat waiting for a mail that was never generated.
     */
    @GetMapping("/config")
    @Operation(summary = "Public auth capabilities (what the registration form should ask for)")
    public ResponseEntity<?> authConfig() {
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "email_code_required", emailCodeService.isEnabled()
        )));
    }

    @PostMapping("/email-code/send")
    @Operation(summary = "Send a verification code to the given email")
    public ResponseEntity<?> sendEmailCode(@RequestBody EmailCodeSendBody body) {
        if (body == null || body.email() == null || body.email().isBlank()) {
            throw new BizException(ErrorCode.INVALID_REQUEST, "email 不能为空");
        }
        EmailCodeService.SendCodeResult result = emailCodeService.sendRegisterCode(body.email());
        // "sent" was hardcoded true, which told the UI a mail was on its way
        // even when verification was switched off and nothing was generated.
        // Report what actually happened instead.
        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "required", emailCodeService.isEnabled(),
                "sent", result.delivered(),
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
        authRateLimiter.checkLogin(body.email());
        AuthService.AuthResult result = authService.login(body.email(), body.password());
        authRateLimiter.clearLogin(body.email());
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

    public record RegisterBody(String email, String password, String nickname, String emailCode) {}

    public record LoginBody(String email, String password) {}

    public record UpgradeBody(String session_id, String anonymous_token) {}

    public record EmailCodeSendBody(String email) {}
}
