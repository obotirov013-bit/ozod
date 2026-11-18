package com.skillorbit.p2p;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.skillorbit.config.SkillOrbitProperties;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.WebSocketSession;

class PeerRegistryTest {

    private PeerRegistry registry;

    @BeforeEach
    void setUp() {
        SkillOrbitProperties properties = new SkillOrbitProperties(
                new SkillOrbitProperties.Cors(List.of("http://localhost:*")),
                new SkillOrbitProperties.RateLimit(10),
                new SkillOrbitProperties.P2p(2));
        registry = new PeerRegistry(properties);
    }

    @Test
    void newcomerGetsPeersWhoJoinedBefore() {
        PeerRegistry.JoinResult first = registry.join("ielts", "Aziz", session("s1"));
        PeerRegistry.JoinResult second = registry.join("ielts", "Malika", session("s2"));

        assertThat(first.others()).isEmpty();
        assertThat(second.others()).extracting(PeerSession::name).containsExactly("Aziz");
        assertThat(registry.othersInRoom(first.peer())).extracting(PeerSession::name).containsExactly("Malika");
        assertThat(registry.onlineInSkill("ielts")).isEqualTo(2);
    }

    @Test
    void roomRejectsPeersOverTheLimit() {
        registry.join("sat", "A", session("s1"));
        registry.join("sat", "B", session("s2"));

        assertThatThrownBy(() -> registry.join("sat", "C", session("s3")))
                .isInstanceOf(RoomFullException.class);
    }

    @Test
    void leavingRemovesPeerAndEmptyRoom() {
        PeerRegistry.JoinResult joined = registry.join("csca-mock42", "Aziz", session("s1"));
        assertThat(registry.onlineInSkill("csca")).isEqualTo(1);

        assertThat(registry.leave("s1")).contains(joined.peer());
        assertThat(registry.onlineInSkill("csca")).isZero();
        assertThat(registry.find("csca-mock42", joined.peer().id())).isEmpty();
        assertThat(registry.leave("s1")).isEmpty();
    }

    private static WebSocketSession session(String id) {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(id);
        when(session.isOpen()).thenReturn(true);
        return session;
    }
}
