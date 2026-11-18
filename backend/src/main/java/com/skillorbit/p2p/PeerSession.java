package com.skillorbit.p2p;

import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

/**
 * Участник P2P-комнаты.
 *
 * @param id      публичный id участника (виден другим ученикам)
 * @param name    отображаемое имя
 * @param room    комната, например {@code ielts} или {@code ielts-mock42}
 * @param session WebSocket-сессия, обёрнутая в ConcurrentWebSocketSessionDecorator (потокобезопасная отправка)
 */
public record PeerSession(String id, String name, String room, WebSocketSession session) {

    private static final Logger log = LoggerFactory.getLogger(PeerSession.class);

    /** Отправляет JSON участнику; ошибки отправки не роняют обработку остальных. */
    public void send(String json) {
        if (!session.isOpen()) {
            return;
        }
        try {
            session.sendMessage(new TextMessage(json));
        } catch (IOException | RuntimeException e) {
            log.debug("P2P: could not deliver a message to peer {}: {}", id, e.getMessage());
        }
    }
}
