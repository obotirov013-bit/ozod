package com.skillorbit.p2p;

import com.skillorbit.config.SkillOrbitProperties;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;

/**
 * Реестр онлайн-участников по комнатам. Хранится в памяти: сервер только знакомит
 * участников, сами данные (чат, звук, видео) идут между браузерами напрямую.
 */
@Component
public class PeerRegistry {

    private static final int SEND_TIME_LIMIT_MS = 5_000;
    private static final int SEND_BUFFER_LIMIT_BYTES = 512 * 1024;

    private final Map<String, PeerSession> bySession = new ConcurrentHashMap<>();
    private final Map<String, Map<String, PeerSession>> rooms = new ConcurrentHashMap<>();
    private final int maxPeersPerRoom;

    public PeerRegistry(SkillOrbitProperties properties) {
        this.maxPeersPerRoom = Math.max(2, properties.p2p().maxPeersPerRoom());
    }

    /**
     * Добавляет участника в комнату.
     *
     * @return новый участник и снимок тех, кто уже был в комнате в момент входа:
     *         новичок звонит именно им, поэтому встречных WebRTC-offer не бывает
     * @throws RoomFullException если комната заполнена
     */
    public synchronized JoinResult join(String room, String name, WebSocketSession session) {
        if (bySession.containsKey(session.getId())) {
            throw new IllegalStateException("Session already joined a room");
        }
        Map<String, PeerSession> members = rooms.computeIfAbsent(room, key -> new ConcurrentHashMap<>());
        if (members.size() >= maxPeersPerRoom) {
            throw new RoomFullException(room, maxPeersPerRoom);
        }
        List<PeerSession> others = List.copyOf(members.values());
        WebSocketSession safeSession =
                new ConcurrentWebSocketSessionDecorator(session, SEND_TIME_LIMIT_MS, SEND_BUFFER_LIMIT_BYTES);
        PeerSession peer = new PeerSession(UUID.randomUUID().toString(), name, room, safeSession);
        members.put(peer.id(), peer);
        bySession.put(session.getId(), peer);
        return new JoinResult(peer, others);
    }

    /** Убирает участника; пустая комната удаляется. */
    public synchronized Optional<PeerSession> leave(String sessionId) {
        PeerSession peer = bySession.remove(sessionId);
        if (peer == null) {
            return Optional.empty();
        }
        Map<String, PeerSession> members = rooms.get(peer.room());
        if (members != null) {
            members.remove(peer.id());
            if (members.isEmpty()) {
                rooms.remove(peer.room());
            }
        }
        return Optional.of(peer);
    }

    public Optional<PeerSession> bySession(String sessionId) {
        return Optional.ofNullable(bySession.get(sessionId));
    }

    public Optional<PeerSession> find(String room, String peerId) {
        Map<String, PeerSession> members = rooms.get(room);
        return members == null ? Optional.empty() : Optional.ofNullable(members.get(peerId));
    }

    /** Остальные участники комнаты (без самого peer). */
    public List<PeerSession> othersInRoom(PeerSession peer) {
        Map<String, PeerSession> members = rooms.get(peer.room());
        if (members == null) {
            return List.of();
        }
        return members.values().stream().filter(other -> !other.id().equals(peer.id())).toList();
    }

    /** Сколько участников во всех комнатах навыка: {@code ielts} и {@code ielts-*}. */
    public int onlineInSkill(String skillId) {
        return rooms.entrySet().stream()
                .filter(entry -> entry.getKey().equals(skillId) || entry.getKey().startsWith(skillId + "-"))
                .mapToInt(entry -> entry.getValue().size())
                .sum();
    }

    public int maxPeersPerRoom() {
        return maxPeersPerRoom;
    }

    public record JoinResult(PeerSession peer, List<PeerSession> others) {
    }
}
