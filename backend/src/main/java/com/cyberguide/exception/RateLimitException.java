package com.cyberguide.exception;

/**
 * Thrown when a client exceeds the rate limit.
 */
public class RateLimitException extends BizException {

    public RateLimitException() {
        super(ErrorCode.RATE_LIMITED);
    }

    public RateLimitException(String message) {
        super(ErrorCode.RATE_LIMITED, message);
    }
}
