package com.skillorbit;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * SkillOrbit — образовательная P2P-платформа.
 *
 * <p>Сервер делает три вещи:
 * <ul>
 *   <li>REST API waitlist ({@code /api/waitlist});</li>
 *   <li>сигнальный сервер WebRTC ({@code /ws/signal}) — знакомит учеников, а сами занятия
 *       идут напрямую между браузерами (peer-to-peer);</li>
 *   <li>раздаёт статический фронтенд из {@code ../frontend}.</li>
 * </ul>
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class SkillOrbitApplication {

    public static void main(String[] args) {
        SpringApplication.run(SkillOrbitApplication.class, args);
    }
}
