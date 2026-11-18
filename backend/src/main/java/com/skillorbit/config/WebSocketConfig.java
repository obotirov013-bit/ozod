package com.skillorbit.config;

import com.skillorbit.p2p.SignalingHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * Регистрирует сигнальный WebSocket для WebRTC: {@code ws(s)://host/ws/signal}.
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final SignalingHandler signalingHandler;
    private final SkillOrbitProperties properties;

    public WebSocketConfig(SignalingHandler signalingHandler, SkillOrbitProperties properties) {
        this.signalingHandler = signalingHandler;
        this.properties = properties;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(signalingHandler, "/ws/signal")
                .setAllowedOriginPatterns(properties.cors().allowedOrigins().toArray(String[]::new));
    }
}
