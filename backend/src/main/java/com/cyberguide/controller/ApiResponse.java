package com.cyberguide.controller;

import java.util.Map;

/**
 * Standard API response envelope.
 */
public class ApiResponse<T> {
    private boolean success;
    private T data;
    private Map<String, String> error;

    public static <T> ApiResponse<T> ok(T data) {
        ApiResponse<T> r = new ApiResponse<>();
        r.success = true;
        r.data = data;
        return r;
    }

    public static <T> ApiResponse<T> fail(String code, String message) {
        ApiResponse<T> r = new ApiResponse<>();
        r.success = false;
        r.error = Map.of("code", code, "message", message);
        return r;
    }

    public boolean isSuccess() { return success; }
    public void setSuccess(boolean success) { this.success = success; }
    public T getData() { return data; }
    public void setData(T data) { this.data = data; }
    public Map<String, String> getError() { return error; }
    public void setError(Map<String, String> error) { this.error = error; }
}
