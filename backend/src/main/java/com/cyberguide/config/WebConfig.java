package com.cyberguide.config;

import org.springframework.context.annotation.Configuration;

/**
 * Web MVC configuration.
 * CORS is now handled by SecurityConfig — see {@link com.cyberguide.security.SecurityConfig}.
 */
@Configuration
public class WebConfig {
    // CORS moved to SecurityConfig.corsConfigurationSource()
}
