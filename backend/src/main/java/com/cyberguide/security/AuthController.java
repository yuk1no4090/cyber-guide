package com.cyberguide.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * Authentication controller — issues anonymous JWT tokens.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);
    private final JwtTokenProvider tokenProvider;

    public AuthController(JwtTokenProvider tokenProvider) {
        this.tokenProvider = tokenProvider;
    }

    /**
     * Issue an anonymous session token.
     * The frontend calls this on first load to get a JWT.
     */
    @PostMapping("/anonymous")
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
}
