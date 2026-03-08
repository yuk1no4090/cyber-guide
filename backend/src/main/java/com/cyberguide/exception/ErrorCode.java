package com.cyberguide.exception;

/**
 * Unified error code enum — every business error maps to one code.
 */
public enum ErrorCode {

    // --- Client errors (4xx) ---
    INVALID_REQUEST("INVALID_REQUEST", 400, "请求参数无效"),
    INVALID_SESSION_ID("INVALID_SESSION_ID", 400, "session_id 无效"),
    INVALID_RATING("INVALID_RATING", 400, "评分无效"),
    INVALID_MODE("INVALID_MODE", 400, "模式无效"),
    INVALID_DAY_INDEX("INVALID_DAY_INDEX", 400, "day_index 必须是 1~7"),
    INVALID_STATUS("INVALID_STATUS", 400, "状态值无效"),
    RESOURCE_NOT_FOUND("RESOURCE_NOT_FOUND", 404, "资源不存在"),
    RATE_LIMITED("RATE_LIMITED", 429, "请求过于频繁，请稍后再试"),

    // --- Server errors (5xx) ---
    AI_SERVICE_ERROR("AI_SERVICE_ERROR", 502, "AI 服务暂时不可用"),
    AI_SERVICE_TIMEOUT("AI_SERVICE_TIMEOUT", 504, "AI 服务响应超时"),
    INTERNAL_ERROR("INTERNAL_ERROR", 500, "服务器内部错误");

    private final String code;
    private final int httpStatus;
    private final String defaultMessage;

    ErrorCode(String code, int httpStatus, String defaultMessage) {
        this.code = code;
        this.httpStatus = httpStatus;
        this.defaultMessage = defaultMessage;
    }

    public String getCode() { return code; }
    public int getHttpStatus() { return httpStatus; }
    public String getDefaultMessage() { return defaultMessage; }
}
