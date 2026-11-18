package com.skillorbit.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Настройки приложения из блока {@code skillorbit.*} в application.yml.
 */
@ConfigurationProperties(prefix = "skillorbit")
public record SkillOrbitProperties(
        @DefaultValue Cors cors,
        @DefaultValue RateLimit rateLimit,
        @DefaultValue P2p p2p) {

    /** Разрешённые источники для REST API и WebSocket (поддерживаются шаблоны с *). */
    public record Cors(@DefaultValue({"http://localhost:*", "http://127.0.0.1:*"}) List<String> allowedOrigins) {
    }

    /** Ограничение частоты записи в waitlist с одного IP. */
    public record RateLimit(@DefaultValue("10") int requestsPerMinute) {
    }

    /** Ограничения P2P-комнат (mesh-сеть: каждый участник соединён с каждым). */
    public record P2p(@DefaultValue("6") int maxPeersPerRoom) {
    }
}
