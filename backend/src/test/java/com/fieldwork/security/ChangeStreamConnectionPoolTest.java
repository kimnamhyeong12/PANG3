package com.fieldwork.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fieldwork.entity.User;
import com.fieldwork.repository.UserRepository;
import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import java.net.URI;
import java.net.http.*;
import java.io.InputStream;
import java.time.Duration;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,
    classes={ReleaseAuthIntegrationTest.TestConfig.class,ChangeSyncIntegrationTest.Config.class,com.fieldwork.config.JpaViewConfig.class,ChangeStreamConnectionPoolTest.ScopeProbe.class}, properties={
    "spring.config.location=classpath:/auth-test.properties",
    "spring.datasource.url=jdbc:h2:mem:syncpool;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
    "spring.datasource.hikari.maximum-pool-size=2", "spring.datasource.hikari.minimum-idle=0",
    "spring.datasource.hikari.connection-timeout=1000", "spring.jpa.open-in-view=true"})
@AutoConfigureMockMvc
class ChangeStreamConnectionPoolTest {
    @org.springframework.web.bind.annotation.RestController
    static class ScopeProbe {
        private final jakarta.persistence.EntityManagerFactory factory;
        ScopeProbe(jakarta.persistence.EntityManagerFactory factory){this.factory=factory;}
        @org.springframework.web.bind.annotation.GetMapping("/api/test/connection-scope")
        public Map<String,Object> scope(){return Map.of("openInView",org.springframework.transaction.support.TransactionSynchronizationManager.hasResource(factory));}
    }
    @LocalServerPort int port;
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder passwords;
    @Autowired HikariDataSource pool;
    @Autowired com.fieldwork.service.AuthSessionService sessions;
    @Test void openStreamsMustNotHoldDatabaseConnectionsOrBlockFacilityReads() throws Exception {
        User user=new User();user.setLoginId("pool"+UUID.randomUUID());user.setName("pool test");user.setRole("ADMIN");user.setPassword(passwords.encode("test-password"));users.saveAndFlush(user);
        var auth=mvc.perform(post("/api/auth/login").header("X-Auth-Client","native").contentType("application/json")
            .content(json.writeValueAsString(Map.of("loginId",user.getLoginId(),"password","test-password")))).andReturn();
        String token="Bearer "+json.readTree(auth.getResponse().getContentAsString()).get("accessToken").asText();
        HttpClient client=HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(3)).build();
        List<InputStream> opened=new ArrayList<>();
        try {
            for(int i=0;i<4;i++) {
                var stream=client.send(HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/api/sync/events"))
                    .header("Authorization",token).timeout(Duration.ofSeconds(5)).build(),HttpResponse.BodyHandlers.ofInputStream());
                opened.add(stream.body());assertEquals(200,stream.statusCode());
                // An SSE request has no business transaction after opening.
                assertEquals(0,pool.getHikariPoolMXBean().getActiveConnections(),"SSE must release its JPA/DB connection after opening");
            }
            var response=client.send(HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/api/admin/facility-applications"))
                .header("Authorization",token).timeout(Duration.ofSeconds(5)).build(),HttpResponse.BodyHandlers.ofString());
            assertEquals(200,response.statusCode());assertTrue(response.body().contains("items"));
            var scope=client.send(HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/api/test/connection-scope"))
                .header("Authorization",token).timeout(Duration.ofSeconds(5)).build(),HttpResponse.BodyHandlers.ofString());
            assertEquals(200,scope.statusCode());assertTrue(json.readTree(scope.body()).get("openInView").asBoolean(),"Other MVC routes retain their original JPA view scope");
        } finally { sessions.revokeAll(user.getUserId()); for(InputStream stream:opened)stream.close(); }
    }
}
