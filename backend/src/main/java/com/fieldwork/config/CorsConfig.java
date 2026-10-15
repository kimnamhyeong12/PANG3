package com.fieldwork.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.cors.*;
import java.util.*;

@Configuration
public class CorsConfig {

@Bean
public CorsConfigurationSource corsConfigurationSource(
        @Value("${fieldwork.auth.allowed-origins:http://localhost:5173,http://localhost:4173}") String origins) {
    CorsConfiguration config = new CorsConfiguration();
    List<String> allowed = Arrays.stream(origins.split(",")).map(String::trim).filter(value -> !value.isEmpty()).toList();
    if (allowed.stream().anyMatch(value -> value.contains("*"))) throw new IllegalArgumentException("CORS requires explicit origins");
    config.setAllowedOrigins(allowed); config.setAllowCredentials(true);
    config.setAllowedMethods(List.of("GET", "POST", "PATCH", "DELETE", "OPTIONS"));
    config.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-Auth-Client", "X-Kakao-Walk-Key"));
    config.setExposedHeaders(List.of("Content-Disposition"));
    var source = new UrlBasedCorsConfigurationSource(); source.registerCorsConfiguration("/**", config); return source;
}

}
