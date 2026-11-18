package com.skillorbit.waitlist;

import java.util.Locale;

/** Общие правила для email — та же проверка, что во фронтенде (js/ui/waitlist.js). */
public final class EmailRules {

    /** name@domain.tld: без пробелов, хотя бы одна точка в домене, зона из 2+ символов. */
    public static final String PATTERN = "^[^\\s@]+@(?:[^\\s@.]+\\.)+[^\\s@.]{2,}$";

    public static final int MAX_LENGTH = 254;

    private EmailRules() {
    }

    public static String normalize(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    /** Маскирует адрес для логов: ada@example.com → a***@example.com. */
    public static String mask(String email) {
        int at = email.indexOf('@');
        if (at <= 0) {
            return "***";
        }
        return email.charAt(0) + "***" + email.substring(at);
    }
}
