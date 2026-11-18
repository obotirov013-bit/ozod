package com.skillorbit.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * CORS для REST API: нужен, когда фронтенд открыт с другого порта (Live Server, Vite и т.п.).
 * Если фронтенд отдаёт сам Spring Boot, запросы идут с того же origin и CORS не участвует.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final SkillOrbitProperties properties;

    public WebConfig(SkillOrbitProperties properties) {
        this.properties = properties;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns(properties.cors().allowedOrigins().toArray(String[]::new))
                .allowedMethods("GET", "POST", "OPTIONS")
                .allowedHeaders("Content-Type", "Accept")
                .maxAge(3600);
    }
}
