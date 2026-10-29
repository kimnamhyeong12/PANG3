package com.fieldwork.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fieldwork.controller.LocalReportController;
import com.fieldwork.controller.LocalReportHtmlController;
import com.fieldwork.controller.ReportMapTileController;
import com.fieldwork.entity.*;
import com.fieldwork.repository.*;
import com.fieldwork.service.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(classes = {ReleaseAuthIntegrationTest.TestConfig.class, LocalReportSecurityTest.Config.class},
        properties = "spring.config.location=classpath:/auth-test.properties")
@AutoConfigureMockMvc(print = org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint.NONE)
class LocalReportSecurityTest {
    @TempDir static Path temporary;
    @DynamicPropertySource static void properties(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", () -> "jdbc:h2:mem:localreports;MODE=PostgreSQL;DB_CLOSE_DELAY=-1");
        properties.add("fieldwork.upload.base-dir", () -> temporary.toString());
    }
    @TestConfiguration @Import({LocalReportController.class, LocalReportService.class,
            LocalReportHtmlController.class, LocalReportHtmlService.class, ProgressReportEditService.class, CompiledReportService.class,
            ReportMapTileController.class})
    static class Config {
        @Bean ProjectService projects() { return mock(ProjectService.class); }
        @Bean ReportHtmlRenderer renderer() { return mock(ReportHtmlRenderer.class); }
        @Bean ReportMapTileService tiles() { return mock(ReportMapTileService.class); }
    }
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired TaskRepository tasks;
    @Autowired TaskProgressRepository records;
    @Autowired PasswordEncoder passwords;
    @Autowired AiReportService ai;
    @Autowired ReportHtmlRenderer renderer;
    @Autowired ProjectService projects;
    @Autowired ReportMapTileService tiles;

    private User user() {
        User value = new User(); value.setLoginId("local" + UUID.randomUUID().toString().replace("-", ""));
        value.setName("Synthetic User"); value.setPassword(passwords.encode("synthetic-password")); value.setRole("USER");
        return users.saveAndFlush(value);
    }
    private String token(User user) throws Exception {
        var response = mvc.perform(post("/api/auth/login").header("X-Auth-Client", "native").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsBytes(Map.of("loginId", user.getLoginId(), "password", "synthetic-password"))))
                .andExpect(status().isOk()).andReturn().getResponse();
        return "Bearer " + json.readTree(response.getContentAsString()).get("accessToken").asText();
    }
    @Test void localInputAndPhotosRequireAuthorizationWithoutStartingPython() throws Exception {
        User owner = user(), outsider = user();
        Task task = new Task(); task.setCreatedBy(owner); task.setCurrentAssignee(owner); task.setDetailAddress("합성 현장"); task.setTaskStatus("complete");
        task = tasks.saveAndFlush(task);
        Path photo = temporary.resolve(task.getTaskId().toString()).resolve("photo.jpg");
        Files.createDirectories(photo.getParent()); Files.write(photo, new byte[]{1, 2, 3});
        TaskProgress record = new TaskProgress(); record.setTask(task); record.setPerformedByUserId(owner.getUserId());
        record.setProgressStatus("complete"); record.setFieldPhotos(List.of(Map.of("path", photo.toString(), "comment", "작업 전|사진")));
        record = records.saveAndFlush(record);
        when(ai.buildPayload(any(), any())).thenAnswer(call -> new HashMap<>(Map.of("main_comment", "합성 메모")));
        when(projects.authorName(any(), anyMap())).thenReturn("합성 작성자");
        String url = "/api/local-reports/progress/" + record.getProgressId();
        mvc.perform(get(url)).andExpect(status().isUnauthorized());
        String otherToken = token(outsider), ownerToken = token(owner);
        mvc.perform(get(url).header("Authorization", otherToken)).andExpect(status().isForbidden());
        var response = mvc.perform(get(url).header("Authorization", ownerToken)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse();
        assertFalse(response.getContentAsString().contains(temporary.toString().replace("\\", "\\\\")));
        var body = json.readTree(response.getContentAsString());
        String photoUrl = body.get("assets").get(1).get("url").asText();
        mvc.perform(get(photoUrl).header("Authorization", otherToken)).andExpect(status().isForbidden());
        mvc.perform(get(photoUrl).header("Authorization", ownerToken)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"));
        mvc.perform(get(url + "/map").header("Authorization", otherToken)).andExpect(status().isForbidden());
        mvc.perform(get(url + "/html-data")).andExpect(status().isUnauthorized());
        mvc.perform(get(url + "/html-data").header("Authorization", otherToken)).andExpect(status().isForbidden());
        var html = mvc.perform(get(url + "/html-data").header("Authorization", ownerToken))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andReturn().getResponse();
        var htmlData = json.readTree(html.getContentAsString());
        assertEquals("html", htmlData.get("format").asText());
        assertEquals("/work/assets/0.jpg", htmlData.at("/payload/sections/0/items/0/photos/0/url").asText());
        mvc.perform(get(url + "/overview").header("Authorization", otherToken)).andExpect(status().isForbidden());
        verify(renderer, never()).render(anyMap());
        verify(renderer, never()).singleMap(any(), any());
        verify(renderer, never()).overviewMap(anyMap());
        assertTrue(body.at("/assets/0").has("map"));
        assertFalse(body.at("/assets/0").has("url"));
        String tileUrl = "/api/local-report-map/tiles/17/1/2";
        mvc.perform(get(tileUrl)).andExpect(status().isUnauthorized());
        when(tiles.get(17, 1, 2, "")).thenReturn(new ReportMapTileService.Tile(new byte[]{1, 2}, "image/png", "© Synthetic tiles"));
        mvc.perform(get(tileUrl).header("Authorization", ownerToken)).andExpect(status().isOk())
                .andExpect(header().string("X-Map-Attribution", "© Synthetic tiles"))
                .andExpect(header().string("Cache-Control", "max-age=604800, private"));
        assertNull(records.findById(record.getProgressId()).orElseThrow().getReportFilePath());
        verify(ai, never()).generatePayload(any(), any());
        mvc.perform(get("/report-runtime/index.html")).andExpect(status().isOk()).andExpect(header().doesNotExist("X-Frame-Options"));
    }
}
