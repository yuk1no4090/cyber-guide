package com.cyberguide.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
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
        log.info("CORS allowed origin patterns: {}", originPatterns);

        CorsConfiguration configured = corsConfig(originPatterns);

        // Resolved per request rather than fixed, so that a browser talking to the
        // very host it loaded the page from is not treated as cross-origin.
        //
        // That case is easy to get wrong: the frontend is proxied through nginx and
        // a Next.js rewrite, so from the browser's side every call is same-origin --
        // but the proxies forward the original Origin header, and this service then
        // judges it against a list that has to name each public hostname by hand.
        // Miss one and every browser write fails with a bare 403 "Invalid CORS
        // request" while curl, which sends no Origin, sails through the same
        // endpoint. Treating Origin == request target as same-origin removes a whole
        // class of that, and grants nothing extra: a page on another origin cannot
        // make its Origin say this host.
        return request -> {
            String origin = request.getHeader(HttpHeaders.ORIGIN);
            if (origin == null || origin.isBlank()) {
                return configured;
            }
            if (configured.checkOrigin(origin) != null) {
                return configured;
            }

            String target = requestTargetOrigin(request);
            if (origin.equalsIgnoreCase(target)) {
                CorsConfiguration sameOrigin = corsConfig(originPatterns);
                sameOrigin.addAllowedOriginPattern(origin);
                return sameOrigin;
            }

            // Otherwise it really is a cross-origin caller we do not know. Say so,
            // because the alternative is an unexplained 403.
            log.warn("CORS: refusing Origin {} (this request was addressed to {}). "
                    + "Add it to CORS_ALLOWED_ORIGIN_PATTERNS if that host should be allowed.", origin, target);
            return configured;
        };
    }

    private CorsConfiguration corsConfig(List<String> originPatterns) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(new java.util.ArrayList<>(originPatterns));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);
        return config;
    }

    /**
     * The origin this request was actually addressed to, as the browser would have
     * written it.
     * <p>
     * Forwarded headers are believed only when the request arrives from a loopback
     * address, because that is where this deployment's proxies run; from anywhere
     * else they are just caller-supplied strings. When nothing usable is present
     * the result is null, no request matches it, and behaviour is exactly what it
     * was before.
     */
    private static String requestTargetOrigin(HttpServletRequest request) {
        boolean viaLocalProxy = isLoopback(request.getRemoteAddr());

        String host = viaLocalProxy ? firstHeaderValue(request.getHeader("X-Forwarded-Host")) : null;
        if (host == null) {
            host = request.getHeader(HttpHeaders.HOST);
        }
        if (host == null || host.isBlank()) {
            return null;
        }

        String scheme = viaLocalProxy ? firstHeaderValue(request.getHeader("X-Forwarded-Proto")) : null;
        if (scheme == null || scheme.isBlank()) {
            scheme = request.getScheme();
        }
        return scheme + "://" + host;
    }

    /** Proxies append to these headers, so the client-facing value is the first one. */
    private static String firstHeaderValue(String header) {
        if (header == null || header.isBlank()) return null;
        String first = header.split(",")[0].trim();
        return first.isEmpty() ? null : first;
    }

    private static boolean isLoopback(String address) {
        if (address == null) return false;
        return address.equals("127.0.0.1") || address.equals("::1") || address.equals("0:0:0:0:0:0:0:1");
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
