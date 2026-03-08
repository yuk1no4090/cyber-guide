package com.cyberguide.exception;

/**
 * Thrown when the upstream AI service fails or times out.
 */
public class AiServiceException extends BizException {

    public AiServiceException(String message) {
        super(ErrorCode.AI_SERVICE_ERROR, message);
    }

    public AiServiceException(String message, Throwable cause) {
        super(ErrorCode.AI_SERVICE_ERROR, message, cause);
    }
}
