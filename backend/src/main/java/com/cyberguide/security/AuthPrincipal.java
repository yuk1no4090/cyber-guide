package com.cyberguide.security;

import java.io.Serializable;

public record AuthPrincipal(
        String id,
        String type,
        String email
) implements Serializable {
    public boolean isUser() {
        return "user".equals(type);
    }

    public boolean isAnonymous() {
        return "anonymous".equals(type);
    }
}
