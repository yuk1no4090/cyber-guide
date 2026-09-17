package com.cyberguide.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;

/**
 * The rule under test: a browser talking to the very host it loaded the page from
 * is not cross-origin, however many proxies sit in between.
 * <p>
 * Getting this wrong is not loud. The frontend is served through nginx and a
 * Next.js rewrite, so the call is same-origin from the browser's side, but the
 * proxies pass the original Origin header down and this service judges it against
 * a hand-maintained list. A hostname missing from that list fails every browser
 * write with a bare 403 while curl, which sends no Origin at all, succeeds against
 * the identical endpoint.
 */
class SecurityConfigCorsTest {

    private CorsConfigurationSource sourceAllowing(String patterns) {
        SecurityConfig config = new SecurityConfig(mock(JwtAuthenticationFilter.class));
        ReflectionTestUtils.setField(config, "allowedOriginPatterns", patterns);
        return config.corsConfigurationSource();
    }

    private MockHttpServletRequest request(String origin, String remoteAddr, String forwardedHost, String forwardedProto) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(remoteAddr);
        if (origin != null) request.addHeader("Origin", origin);
        if (forwardedHost != null) request.addHeader("X-Forwarded-Host", forwardedHost);
        if (forwardedProto != null) request.addHeader("X-Forwarded-Proto", forwardedProto);
        return request;
    }

    @Test
    void allowsAnOriginThatIsConfigured() {
        var request = request("http://localhost:3000", "127.0.0.1", null, null);

        CorsConfiguration config = sourceAllowing("http://localhost:*").getCorsConfiguration(request);

        assertNotNull(config.checkOrigin("http://localhost:3000"));
    }

    @Test
    void allowsAnOriginNamingTheHostTheRequestWasAddressedTo() {
        // The exact case that broke registration in production: the site answers on
        // a hostname nobody remembered to add to the list.
        var request = request("https://guide.example.com", "127.0.0.1", "guide.example.com", "https");

        CorsConfiguration config = sourceAllowing("http://localhost:*").getCorsConfiguration(request);

        assertNotNull(config.checkOrigin("https://guide.example.com"));
    }

    @Test
    void readsTheClientFacingValueWhenProxiesHaveAppendedToTheHeader() {
        // Each hop appends, so the browser-facing value is the first one.
        var request = request("https://guide.example.com", "127.0.0.1", "guide.example.com, internal.local", "https,http");

        CorsConfiguration config = sourceAllowing("http://localhost:*").getCorsConfiguration(request);

        assertNotNull(config.checkOrigin("https://guide.example.com"));
    }

    @Test
    void refusesAnOriginThatIsNeitherConfiguredNorTheRequestTarget() {
        var request = request("https://evil.example", "127.0.0.1", "guide.example.com", "https");

        CorsConfiguration config = sourceAllowing("http://localhost:*").getCorsConfiguration(request);

        assertNull(config.checkOrigin("https://evil.example"));
    }

    @Test
    void ignoresForwardedHeadersFromCallersThatAreNotTheLocalProxy() {
        // Otherwise anyone reaching the port directly could declare themselves the
        // target host and be granted their own origin.
        var request = request("https://evil.example", "203.0.113.9", "evil.example", "https");

        CorsConfiguration config = sourceAllowing("http://localhost:*").getCorsConfiguration(request);

        assertNull(config.checkOrigin("https://evil.example"));
    }

    @Test
    void fallsBackToTheHostHeaderWhenNothingIsForwarded() {
        var request = request("http://guide.example.com", "127.0.0.1", null, null);
        request.addHeader("Host", "guide.example.com");

        CorsConfiguration config = sourceAllowing("http://localhost:*").getCorsConfiguration(request);

        assertNotNull(config.checkOrigin("http://guide.example.com"));
    }

    @Test
    void aRequestWithoutAnOriginIsUnaffected() {
        var request = request(null, "127.0.0.1", null, null);

        CorsConfiguration config = sourceAllowing("http://localhost:*").getCorsConfiguration(request);

        assertNotNull(config);
        assertNull(config.checkOrigin("https://anything.example"));
    }
}
