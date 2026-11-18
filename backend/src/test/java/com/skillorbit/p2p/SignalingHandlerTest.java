package com.skillorbit.p2p;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/** Сквозной тест сигнального сервера: настоящие WebSocket-клиенты против запущенного приложения. */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.datasource.url=jdbc:h2:mem:signaling-test;DB_CLOSE_DELAY=-1")
class SignalingHandlerTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @LocalServerPort
    private int port;

    @Test
    void introducesPeersAndForwardsSignalsBetweenThem() throws Exception {
        Client aziz = connect();
        Client malika = connect();

        aziz.send("{\"type\":\"join\",\"room\":\"ielts\",\"name\":\"Aziz\"}");
        JsonNode welcomeAziz = aziz.next();
        assertThat(welcomeAziz.path("type").asText()).isEqualTo("welcome");
        assertThat(welcomeAziz.path("peers")).isEmpty();

        malika.send("{\"type\":\"join\",\"room\":\"ielts\",\"name\":\"Malika\"}");
        JsonNode welcomeMalika = malika.next();
        assertThat(welcomeMalika.path("peers").get(0).path("name").asText()).isEqualTo("Aziz");

        JsonNode joined = aziz.next();
        assertThat(joined.path("type").asText()).isEqualTo("peer-joined");
        assertThat(joined.path("peer").path("name").asText()).isEqualTo("Malika");

        String azizId = welcomeAziz.path("peerId").asText();
        malika.send("{\"type\":\"signal\",\"to\":\"" + azizId + "\",\"data\":{\"sdp\":{\"type\":\"offer\",\"sdp\":\"v=0\"}}}");
        JsonNode signal = aziz.next();
        assertThat(signal.path("type").asText()).isEqualTo("signal");
        assertThat(signal.path("from").asText()).isEqualTo(welcomeMalika.path("peerId").asText());
        assertThat(signal.at("/data/sdp/type").asText()).isEqualTo("offer");

        malika.session.close();
        JsonNode left = aziz.next();
        assertThat(left.path("type").asText()).isEqualTo("peer-left");
        assertThat(left.path("peerId").asText()).isEqualTo(welcomeMalika.path("peerId").asText());

        aziz.session.close();
    }

    @Test
    void rejectsRoomsThatAreNotPlanets() throws Exception {
        Client client = connect();
        client.send("{\"type\":\"join\",\"room\":\"mars\",\"name\":\"Aziz\"}");

        JsonNode reply = client.next();
        assertThat(reply.path("type").asText()).isEqualTo("error");
        assertThat(reply.path("message").asText()).contains("ielts");

        client.session.close();
    }

    private Client connect() throws Exception {
        Client client = new Client();
        WebSocketHttpHeaders headers = new WebSocketHttpHeaders();
        headers.setOrigin("http://localhost:" + port);
        client.session = new StandardWebSocketClient()
                .execute(client, headers, URI.create("ws://localhost:" + port + "/ws/signal"))
                .get(5, TimeUnit.SECONDS);
        return client;
    }

    private static final class Client extends TextWebSocketHandler {

        private final BlockingQueue<String> inbox = new LinkedBlockingQueue<>();
        private WebSocketSession session;

        @Override
        protected void handleTextMessage(WebSocketSession session, TextMessage message) {
            inbox.add(message.getPayload());
        }

        void send(String json) throws Exception {
            session.sendMessage(new TextMessage(json));
        }

        JsonNode next() throws Exception {
            String raw = inbox.poll(5, TimeUnit.SECONDS);
            assertThat(raw).as("message from the signaling server").isNotNull();
            return MAPPER.readTree(raw);
        }
    }
}
