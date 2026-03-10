package com.cyberguide.exception;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ExceptionTest {

    @Test
    void bizExceptionCarriesErrorCode() {
        BizException ex = new BizException(ErrorCode.INVALID_REQUEST, "test message");
        assertEquals(ErrorCode.INVALID_REQUEST, ex.getErrorCode());
        assertEquals("test message", ex.getMessage());
        assertEquals(400, ex.getErrorCode().getHttpStatus());
    }

    @Test
    void aiServiceExceptionDefaults() {
        AiServiceException ex = new AiServiceException("AI down");
        assertEquals(ErrorCode.AI_SERVICE_ERROR, ex.getErrorCode());
        assertEquals(502, ex.getErrorCode().getHttpStatus());
    }

    @Test
    void rateLimitExceptionDefaults() {
        RateLimitException ex = new RateLimitException();
        assertEquals(ErrorCode.RATE_LIMITED, ex.getErrorCode());
        assertEquals(429, ex.getErrorCode().getHttpStatus());
    }

    @Test
    void errorCodeEnumValues() {
        assertEquals("INVALID_REQUEST", ErrorCode.INVALID_REQUEST.getCode());
        assertEquals("AI_SERVICE_ERROR", ErrorCode.AI_SERVICE_ERROR.getCode());
        assertEquals("RATE_LIMITED", ErrorCode.RATE_LIMITED.getCode());
        assertEquals("INTERNAL_ERROR", ErrorCode.INTERNAL_ERROR.getCode());
    }
}
