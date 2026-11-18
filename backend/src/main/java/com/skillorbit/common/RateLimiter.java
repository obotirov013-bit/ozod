package com.skillorbit.common;

import com.skillorbit.config.SkillOrbitProperties;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * Простое ограничение частоты «N запросов в минуту на ключ» (фиксированное окно, в памяти).
 * Для нескольких экземпляров сервера замените на Redis или ограничение на уровне прокси.
 */
@Component
public class RateLimiter {

    private static final long WINDOW_MS = 60_000;
    private static final int CLEANUP_THRESHOLD = 10_000;

    private final int limit;
    private final Map<String, Window> windows = new ConcurrentHashMap<>();

    public RateLimiter(SkillOrbitProperties properties) {
        this.limit = Math.max(1, properties.rateLimit().requestsPerMinute());
    }

    /** @throws RateLimitExceededException если лимит для ключа исчерпан */
    public void check(String key) {
        long now = System.currentTimeMillis();
        Window window = windows.compute(key, (k, old) ->
                old == null || now - old.start() >= WINDOW_MS ? new Window(now, 1) : new Window(old.start(), old.count() + 1));

        if (windows.size() > CLEANUP_THRESHOLD) {
            windows.entrySet().removeIf(entry -> now - entry.getValue().start() >= WINDOW_MS);
        }

        if (window.count() > limit) {
            long retryAfter = Math.max(1, (window.start() + WINDOW_MS - now) / 1000);
            throw new RateLimitExceededException(retryAfter);
        }
    }

    private record Window(long start, int count) {
    }
}
