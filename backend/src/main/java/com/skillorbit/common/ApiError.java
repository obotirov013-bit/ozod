package com.skillorbit.common;

import java.time.Instant;
import java.util.Map;
import org.springframework.http.HttpStatus;

/**
 * Единый формат ошибки API.
 *
 * @param status  HTTP-код
 * @param error   название кода (Bad Request, Too Many Requests, ...)
 * @param message что пошло не так и как это исправить — показывается пользователю
 * @param fields  ошибки по полям (если есть)
 */
public record ApiError(int status, String error, String message, Map<String, String> fields, Instant timestamp) {

    public static ApiError of(HttpStatus status, String message) {
        return of(status, message, null);
    }

    public static ApiError of(HttpStatus status, String message, Map<String, String> fields) {
        return new ApiError(status.value(), status.getReasonPhrase(), message, fields, Instant.now());
    }
}
