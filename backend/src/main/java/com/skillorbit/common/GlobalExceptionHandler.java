package com.skillorbit.common;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Переводит исключения в понятные ответы {@link ApiError}.
 * Тексты не обвиняют пользователя и подсказывают, что сделать.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> fields = new LinkedHashMap<>();
        for (FieldError error : ex.getBindingResult().getFieldErrors()) {
            // «Поле пустое» важнее, чем «неверный формат» для того же поля
            if ("NotBlank".equals(error.getCode()) || !fields.containsKey(error.getField())) {
                fields.put(error.getField(), error.getDefaultMessage());
            }
        }
        String message = fields.values().stream().findFirst().orElse("Check the request and try again.");
        return ResponseEntity.badRequest().body(ApiError.of(HttpStatus.BAD_REQUEST, message, fields));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiError> handleUnreadable(HttpMessageNotReadableException ex) {
        return ResponseEntity.badRequest()
                .body(ApiError.of(HttpStatus.BAD_REQUEST, "Send a JSON body with an email field, like {\"email\": \"name@example.com\"}."));
    }

    @ExceptionHandler(RateLimitExceededException.class)
    public ResponseEntity<ApiError> handleRateLimit(RateLimitExceededException ex) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(ex.getRetryAfterSeconds()))
                .body(ApiError.of(HttpStatus.TOO_MANY_REQUESTS,
                        "Too many sign-ups from this network. Wait a minute and try again."));
    }
}
