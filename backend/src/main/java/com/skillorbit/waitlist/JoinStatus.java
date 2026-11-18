package com.skillorbit.waitlist;

/** Результат записи в waitlist. Повторная запись не ошибка — запрос идемпотентен. */
public enum JoinStatus {
    REGISTERED,
    ALREADY_REGISTERED
}
