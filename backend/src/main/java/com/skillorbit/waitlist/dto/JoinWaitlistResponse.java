package com.skillorbit.waitlist.dto;

import com.skillorbit.waitlist.JoinStatus;

/**
 * Ответ на запись в waitlist.
 *
 * @param status   REGISTERED (201) или ALREADY_REGISTERED (200)
 * @param email    нормализованный адрес
 * @param position место в очереди, начиная с 1
 * @param message  текст для пользователя
 */
public record JoinWaitlistResponse(JoinStatus status, String email, long position, String message) {
}
