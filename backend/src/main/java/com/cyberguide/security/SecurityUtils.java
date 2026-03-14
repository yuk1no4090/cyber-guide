package com.cyberguide.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Optional;
import java.util.UUID;

public final class SecurityUtils {
    private SecurityUtils() {}

    public static Optional<AuthPrincipal> currentPrincipal() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null) {
            return Optional.empty();
        }
        Object principal = authentication.getPrincipal();
        if (principal instanceof AuthPrincipal authPrincipal) {
            return Optional.of(authPrincipal);
        }
        return Optional.empty();
    }

    public static Optional<UUID> currentUserId() {
        return currentPrincipal()
                .filter(AuthPrincipal::isUser)
                .map(AuthPrincipal::id)
                .flatMap(id -> {
                    try {
                        return Optional.of(UUID.fromString(id));
                    } catch (IllegalArgumentException e) {
                        return Optional.empty();
                    }
                });
    }

    public static Optional<String> currentAnonymousSessionId() {
        return currentPrincipal()
                .filter(AuthPrincipal::isAnonymous)
                .map(AuthPrincipal::id);
    }
}
