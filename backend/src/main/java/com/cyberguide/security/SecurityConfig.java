package com.cyberguide.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * Security configuration — stateless JWT authentication.
 * <p>
 * Public endpoints: /api/auth/**, /actuator/health, /swagger-ui/**, /v3/api-docs/**
 * Protected endpoints: /api/** (requires valid JWT)
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

    private final JwtAuthenticationFilter jwtFilter;
    @Value("${security.cors.allowed-origin-patterns:http://localhost:*,https://*.cyberguide.dev}")
    private String allowedOriginPatterns;

    @Value("${spring.profiles.active:}")
    private String activeProfiles;

    /**
     * Whether the OpenAPI schema and Swagger UI answer without credentials. Off by
     * default: the schema is a complete map of every endpoint and body shape, which
     * is a gift to anyone probing the service. Dev-like profiles keep it on so local
     * work is unaffected.
     */
    @Value("${security.api-docs.public:false}")
    private boolean apiDocsPublic;

    public SecurityConfig(JwtAuthenticationFilter jwtFilter) {
        this.jwtFilter = jwtFilter;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .authorizeHttpRequests(auth -> {
                auth
                    // Public endpoints
                    .requestMatchers("/api/auth/**").permitAll()
                    // Only the probes nginx and uptime checks need, not all of actuator.
                    .requestMatchers("/actuator/health", "/actuator/health/**", "/actuator/info").permitAll()
                    .requestMatchers("/actuator/**").denyAll()
                    .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll();

                // These paths are outside /api/**, so dropping a permitAll rule would
                // leave them reachable through anyRequest().permitAll() below. Closing
                // them takes an explicit denial.
                String[] apiDocs = {"/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**"};
                if (apiDocsPublic || SecurityUtils.isDevLikeProfile(activeProfiles)) {
                    auth.requestMatchers(apiDocs).permitAll();
                } else {
                    auth.requestMatchers(apiDocs).denyAll();
                }

                auth
                    // All other /api/** require authentication
                    .requestMatchers("/api/**").authenticated()
                    .anyRequest().permitAll();
            })
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public UserDetailsService userDetailsService() {
        return new InMemoryUserDetailsManager(
            User.withUsername("system")
                .password("{noop}unused")
                .roles("SYSTEM")
                .build()
        );
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        List<String> originPatterns = java.util.Arrays.stream(allowedOriginPatterns.split(","))
                .map(String::trim)
                .filter(s -> !s.isBlank())
                .toList();
        // An origin missing from this list surfaces only as a bare 403 "Invalid CORS
        // request" on every browser write, with nothing else in the logs pointing at
        // CORS. Serving the frontend from the same host does not exempt it: a proxy
        // forwards the browser's original Origin header, so every public hostname the
        // app is reached by has to appear here.
        log.info("CORS allowed origin patterns: {}", originPatterns);

        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(originPatterns);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
