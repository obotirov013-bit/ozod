package com.skillorbit.p2p;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.skillorbit.skill.Skill;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/**
 * Сигнальный сервер WebRTC. Пересылает между участниками комнаты SDP и ICE-кандидаты,
 * после чего браузеры соединяются напрямую (RTCDataChannel / медиа) — peer-to-peer.
 *
 * <pre>
 * клиент → сервер                           сервер → клиент
 * {type:"join", room, name}                 {type:"welcome", peerId, room, peers:[{id,name}]}
 * {type:"signal", to, data}                 {type:"signal", from, data}
 * {type:"leave"}                            {type:"peer-joined", peer:{id,name}}
 * {type:"ping"}                             {type:"peer-left", peerId} / {type:"pong"}
 *                                           {type:"error", message}
 * </pre>
 */
@Component
public class SignalingHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(SignalingHandler.class);

    private static final int MAX_TEXT_MESSAGE_BYTES = 64 * 1024; // SDP с медиа может быть больше 8 КБ по умолчанию
    private static final int MAX_NAME_LENGTH = 40;
    private static final Pattern ROOM_PATTERN = Pattern.compile("^("
            + Arrays.stream(Skill.values()).map(Skill::id).collect(Collectors.joining("|"))
            + ")(-[a-z0-9]{3,16})?$");

    private final PeerRegistry registry;
    private final ObjectMapper mapper;

    public SignalingHandler(PeerRegistry registry, ObjectMapper mapper) {
        this.registry = registry;
        this.mapper = mapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        session.setTextMessageSizeLimit(MAX_TEXT_MESSAGE_BYTES);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        JsonNode msg;
        try {
            msg = mapper.readTree(message.getPayload());
        } catch (JsonProcessingException e) {
            reply(session, error("Send messages as JSON objects."));
            return;
        }

        String type = msg.path("type").asText("");
        switch (type) {
            case "join" -> handleJoin(session, msg);
            case "signal" -> handleSignal(session, msg);
            case "leave" -> handleLeave(session);
            case "ping" -> reply(session, toJson(Map.of("type", "pong")));
            default -> reply(session, error("Unknown message type '" + type + "'."));
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        handleLeave(session);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.debug("P2P: transport error in session {}: {}", session.getId(), exception.getMessage());
    }

    // ------------------------------------------------------------------ сообщения

    private void handleJoin(WebSocketSession session, JsonNode msg) {
        if (registry.bySession(session.getId()).isPresent()) {
            reply(session, error("You are already in a room. Leave it before joining another one."));
            return;
        }
        String room = msg.path("room").asText("").trim().toLowerCase(Locale.ROOT);
        if (!ROOM_PATTERN.matcher(room).matches()) {
            reply(session, error("Pick a planet room: ielts, sat, csca or programming, optionally with a code like ielts-mock42."));
            return;
        }

        PeerRegistry.JoinResult result;
        try {
            result = registry.join(room, cleanName(msg.path("name").asText("")), session);
        } catch (RoomFullException e) {
            reply(session, error("This room already has " + e.getLimit() + " people. Use another room code."));
            return;
        }

        PeerSession peer = result.peer();
        List<Map<String, String>> peers = result.others().stream()
                .map(other -> Map.of("id", other.id(), "name", other.name()))
                .toList();
        peer.send(toJson(Map.of("type", "welcome", "peerId", peer.id(), "room", room, "peers", peers)));

        String joined = toJson(Map.of("type", "peer-joined", "peer", Map.of("id", peer.id(), "name", peer.name())));
        result.others().forEach(other -> other.send(joined));
        log.info("P2P: peer joined room '{}' ({} online there)", room, result.others().size() + 1);
    }

    private void handleSignal(WebSocketSession session, JsonNode msg) {
        Optional<PeerSession> from = registry.bySession(session.getId());
        if (from.isEmpty()) {
            reply(session, error("Join a room before sending signals."));
            return;
        }
        JsonNode data = msg.get("data");
        if (data == null || !data.isObject()) {
            from.get().send(error("The signal has no data to forward."));
            return;
        }
        Optional<PeerSession> target = registry.find(from.get().room(), msg.path("to").asText(""));
        if (target.isEmpty()) {
            from.get().send(error("That peer has already left the room."));
            return;
        }

        ObjectNode forward = mapper.createObjectNode();
        forward.put("type", "signal");
        forward.put("from", from.get().id());
        forward.set("data", data);
        target.get().send(forward.toString());
    }

    private void handleLeave(WebSocketSession session) {
        registry.leave(session.getId()).ifPresent(peer -> {
            String left = toJson(Map.of("type", "peer-left", "peerId", peer.id()));
            registry.othersInRoom(peer).forEach(other -> other.send(left));
            log.info("P2P: peer left room '{}'", peer.room());
        });
    }

    // ------------------------------------------------------------------ помощники

    /** Ответ отправителю: через потокобезопасную обёртку, если он уже в комнате. */
    private void reply(WebSocketSession session, String json) {
        Optional<PeerSession> peer = registry.bySession(session.getId());
        if (peer.isPresent()) {
            peer.get().send(json);
            return;
        }
        synchronized (session) {
            try {
                if (session.isOpen()) {
                    session.sendMessage(new TextMessage(json));
                }
            } catch (IOException e) {
                log.debug("P2P: could not reply to session {}: {}", session.getId(), e.getMessage());
            }
        }
    }

    private String error(String message) {
        return toJson(Map.of("type", "error", "message", message));
    }

    private String toJson(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Could not serialize a signaling message", e);
        }
    }

    private static String cleanName(String raw) {
        String name = raw.replaceAll("\\p{Cntrl}", "").trim();
        if (name.isEmpty()) {
            return "Peer";
        }
        return name.length() > MAX_NAME_LENGTH ? name.substring(0, MAX_NAME_LENGTH) : name;
    }
}
