package com.skillorbit.waitlist.dto;

import com.skillorbit.waitlist.EmailRules;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Тело запроса POST /api/waitlist.
 *
 * @param email  адрес ученика
 * @param source откуда пришла заявка (landing, room, ...), необязательно
 */
public record JoinWaitlistRequest(
        @NotBlank(message = "Enter your email to join the waitlist.")
        @Size(max = EmailRules.MAX_LENGTH, message = "Enter an email like name@example.com.")
        @Pattern(regexp = EmailRules.PATTERN, message = "Enter an email like name@example.com.")
        String email,

        @Size(max = 40, message = "Use 40 characters or fewer for the source.")
        @Pattern(regexp = "^[a-z0-9_-]*$", message = "Use lowercase letters, digits, - or _ for the source.")
        String source) {

    /** Пробелы по краям — не ошибка пользователя: убираем их до валидации. */
    public JoinWaitlistRequest {
        email = email == null ? null : email.trim();
        source = source == null ? null : source.trim();
    }
}
