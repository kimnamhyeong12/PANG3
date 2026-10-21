package com.fieldwork.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fieldwork.config.FieldworkProperties;
import com.fieldwork.entity.*;
import com.fieldwork.repository.*;
import com.fieldwork.service.AiReportService;
import com.fieldwork.util.ProjectPaths;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import javax.imageio.ImageIO;
import javax.xml.parsers.DocumentBuilderFactory;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.*;
import java.util.zip.ZipInputStream;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real controller/security/database/Java->Python/file bytes. No TCP, phone or visual viewer. */
@SpringBootTest(classes = {ReleaseAuthIntegrationTest.TestConfig.class, ReportDownloadPilotTest.PilotConfig.class},
        properties = "spring.config.location=classpath:/auth-test.properties")
@AutoConfigureMockMvc(print = org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint.NONE)
@EnabledIfSystemProperty(named = "pang3.pilot.output", matches = ".+")
class ReportDownloadPilotTest {
    @TempDir static Path temporary;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:h2:mem:reportpilot;MODE=PostgreSQL;DB_CLOSE_DELAY=-1");
        registry.add("fieldwork.upload.base-dir", () -> temporary.resolve("uploads").toString());
        registry.add("fieldwork.ai.output-dir", () -> temporary.resolve("reports").toString());
        registry.add("fieldwork.ai.script-path", () -> ProjectPaths.projectRoot().resolve("ai/app.py").toString());
        registry.add("fieldwork.ai.python-path", () -> System.getProperty("pang3.report.python", "python"));
        registry.add("gemini.api-key", () -> "");
        registry.add("logging.level.org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration", () -> "ERROR");
    }

    @TestConfiguration
    static class PilotConfig {
        @Bean @Primary AiReportService realReportEngine(FieldworkProperties properties) {
            return new AiReportService(properties);
        }
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired WorkGroupRepository groups;
    @Autowired GroupMemberRepository members;
    @Autowired TaskRepository tasks;
    @Autowired TaskProgressRepository progress;
    @Autowired PasswordEncoder encoder;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    User user() {
        User user = new User();
        user.setLoginId("pilot" + UUID.randomUUID().toString().replace("-", ""));
        user.setPassword(encoder.encode("synthetic-test-password"));
        user.setName("Synthetic Pilot"); user.setRole("USER");
        return users.saveAndFlush(user);
    }

    String login(User user) throws Exception {
        var result = mvc.perform(post("/api/auth/login").header("X-Auth-Client", "native")
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(
                        Map.of("loginId", user.getLoginId(), "password", "synthetic-test-password"))))
                .andExpect(status().isOk()).andReturn().getResponse();
        return "Bearer " + json.readTree(result.getContentAsString()).get("accessToken").asText();
    }

    TaskProgress record(WorkGroup group, User owner, String label, String status, Color color, LocalDateTime created) throws Exception {
        Task task = new Task(); task.setGroup(group); task.setCreatedBy(owner); task.setCurrentAssignee(owner);
        task.setDetailAddress(label); task.setTaskCategory("PILOT-CATEGORY"); task.setTaskStatus(status);
        task = tasks.saveAndFlush(task);
        Path photo = temporary.resolve("uploads").resolve(task.getTaskId().toString()).resolve("photo.png");
        Files.createDirectories(photo.getParent());
        BufferedImage image = new BufferedImage(240, 180, BufferedImage.TYPE_INT_RGB);
        var graphics = image.createGraphics(); graphics.setColor(color); graphics.fillRect(0, 0, 240, 180); graphics.dispose();
        ImageIO.write(image, "png", photo.toFile());
        TaskProgress report = new TaskProgress(); report.setTask(task); report.setPerformedByUserId(owner.getUserId());
        report.setProgressStatus(status); report.setFieldMemo(label + "-MEMO"); report.setMainComment(label + "-COMMENT");
        report.setFieldPhotos(List.of(Map.of("path", photo.toString(), "comment", "작업 후|" + label + "-PHOTO")));
        report = progress.saveAndFlush(report);
        // CreationTimestamp deliberately assigns insertion time. Backdate only this isolated H2 fixture,
        // then re-read it so the API and expected value both use the actual persisted date.
        jdbc.update("update task_progress set created_at = ? where progress_id = ?",
                java.sql.Timestamp.valueOf(created), report.getProgressId());
        report = progress.findById(report.getProgressId()).orElseThrow();
        assertEquals(created.toLocalDate(), report.getCreatedAt().toLocalDate());
        return report;
    }

    byte[] prepareAndDownload(TaskProgress report, User user, String token) throws Exception {
        var response = mvc.perform(post("/api/task-progress/" + report.getProgressId() + "/report/prepare")
                .param("userId", user.getUserId().toString()).header("Authorization", token))
                .andExpect(status().isOk()).andReturn().getResponse();
        JsonNode prepared = json.readTree(response.getContentAsString());
        var downloaded = mvc.perform(get(prepared.get("reportDownloadUrl").asText()).header("Authorization", token))
                .andExpect(status().isOk()).andReturn().getResponse();
        assertTrue(downloaded.getHeader("Content-Disposition").contains(".hwpx"));
        assertTrue(downloaded.getHeader("Content-Disposition").contains("filename*=UTF-8''"));
        return downloaded.getContentAsByteArray();
    }

    Map<String, byte[]> contents(byte[] bytes) throws Exception {
        Map<String, byte[]> entries = new HashMap<>();
        try (var zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            java.util.zip.ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                entries.put(entry.getName(), zip.readAllBytes());
                zip.closeEntry(); // also checks CRC
            }
        }
        assertTrue(entries.containsKey("Contents/section0.xml"), "Must download an actual HWPX package");
        return entries;
    }

    String text(Map<String, byte[]> entries) throws Exception {
        StringBuilder result = new StringBuilder();
        var factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        for (var entry : entries.entrySet()) {
            if (entry.getKey().startsWith("Contents/") && entry.getKey().endsWith(".xml"))
                result.append(factory.newDocumentBuilder().parse(new ByteArrayInputStream(entry.getValue())).getDocumentElement().getTextContent());
        }
        return result.toString();
    }

    @Test void twoActualDownloadsRetainContentAndEnforceAccess() throws Exception {
        assertEquals("1", System.getenv("PYTHON_DOTENV_DISABLED"), "Run this opt-in pilot through the workflow runner (offline env)");
        System.out.println("[PILOT] Creating isolated synthetic records");
        User owner = user(), member = user(), outsider = user();
        WorkGroup group = new WorkGroup(); group.setName("Synthetic pilot group"); group.setLeader(owner); group = groups.saveAndFlush(group);
        for (User user : List.of(owner, member)) {
            GroupMember membership = new GroupMember(); membership.setGroup(group); membership.setUser(user); membership.setRole("MEMBER");
            members.saveAndFlush(membership);
        }
        LocalDateTime firstDate = LocalDateTime.now().minusDays(2), secondDate = firstDate.plusDays(1);
        TaskProgress first = record(group, owner, "REPORT-A", "complete", Color.RED, firstDate);
        TaskProgress second = record(group, owner, "REPORT-B", "complete", Color.BLUE, secondDate);
        TaskProgress pending = record(group, owner, "REPORT-PENDING", "pending", Color.GREEN, secondDate);
        String ownerToken = login(owner), memberToken = login(member), outsiderToken = login(outsider);
        System.out.println("[PILOT] Generating and downloading report A through real Python");
        byte[] a = prepareAndDownload(first, owner, ownerToken);
        System.out.println("[PILOT] Generating and downloading report B through real Python");
        byte[] b = prepareAndDownload(second, owner, ownerToken);
        var aEntries = contents(a); var bEntries = contents(b);
        String aText = text(aEntries), bText = text(bEntries);
        for (String suffix : List.of("", "-MEMO", "-COMMENT", "-PHOTO")) {
            assertTrue(aText.contains("REPORT-A" + suffix)); assertTrue(bText.contains("REPORT-B" + suffix));
        }
        assertFalse(aText.contains("REPORT-B")); assertFalse(bText.contains("REPORT-A"));
        assertTrue(aText.contains(firstDate.toLocalDate().toString()));
        assertTrue(bText.contains(secondDate.toLocalDate().toString()));
        var aImage = aEntries.entrySet().stream().filter(e -> e.getKey().startsWith("BinData/") && e.getKey().endsWith(".jpg")).findFirst().orElseThrow().getValue();
        var bImage = bEntries.entrySet().stream().filter(e -> e.getKey().startsWith("BinData/") && e.getKey().endsWith(".jpg")).findFirst().orElseThrow().getValue();
        Color red = new Color(ImageIO.read(new ByteArrayInputStream(aImage)).getRGB(800, 550));
        Color blue = new Color(ImageIO.read(new ByteArrayInputStream(bImage)).getRGB(800, 550));
        assertTrue(red.getRed() > red.getBlue() + 100); assertTrue(blue.getBlue() > blue.getRed() + 100);
        String firstPath = progress.findById(first.getProgressId()).orElseThrow().getReportFilePath();
        String secondPath = progress.findById(second.getProgressId()).orElseThrow().getReportFilePath();
        assertNotEquals(firstPath, secondPath);
        assertArrayEquals(a, Files.readAllBytes(Path.of(firstPath)), "Second generation must not overwrite first file");
        System.out.println("[PILOT] Verifying report/photo access and pending-state rejection");
        for (TaskProgress report : List.of(first, second)) {
            String download = "/api/task-progress/" + report.getProgressId() + "/report/download";
            mvc.perform(get(download)).andExpect(status().isUnauthorized());
            mvc.perform(get(download).header("Authorization", outsiderToken)).andExpect(status().isForbidden());
            mvc.perform(get(download).header("Authorization", memberToken)).andExpect(status().isOk());
            mvc.perform(post("/api/task-progress/" + report.getProgressId() + "/report/prepare")
                    .param("userId", outsider.getUserId().toString()).header("Authorization", outsiderToken)).andExpect(status().isForbidden());
            String photo = "/api/files/" + report.getTask().getTaskId() + "/photo.png";
            mvc.perform(get(photo)).andExpect(status().isUnauthorized());
            mvc.perform(get(photo).header("Authorization", outsiderToken)).andExpect(status().isForbidden());
            mvc.perform(get(photo).header("Authorization", ownerToken)).andExpect(status().isOk());
        }
        mvc.perform(post("/api/task-progress/" + pending.getProgressId() + "/report/prepare")
                .param("userId", owner.getUserId().toString()).header("Authorization", ownerToken)).andExpect(status().isConflict());
        mvc.perform(get("/api/task-progress/" + pending.getProgressId() + "/report/download")
                .header("Authorization", ownerToken)).andExpect(status().isConflict());
        Path evidence = Path.of(System.getProperty("pang3.pilot.output", temporary.resolve("evidence").toString()));
        Files.createDirectories(evidence);
        Files.write(evidence.resolve("report-a.hwpx"), a); Files.write(evidence.resolve("report-b.hwpx"), b);
        json.writerWithDefaultPrettyPrinter().writeValue(evidence.resolve("pilot-summary.json").toFile(), Map.of(
                "environment", "H2/MockMvc/offline real Python; no phone, TCP or Postgres",
                "acceptancePassed", List.of("AC-001", "AC-002", "AC-003", "AC-004"),
                "checks", List.of("two-downloads", "visit-date-memo-comment", "red-blue-photos", "no-overwrite",
                        "401-anonymous", "403-outsider", "member-download", "photo-access", "409-pending"),
                "bytes", Map.of("report-a", a.length, "report-b", b.length)));
    }
}
