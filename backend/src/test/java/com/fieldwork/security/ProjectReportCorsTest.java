package com.fieldwork.security;

import com.fieldwork.config.CorsConfig;
import com.fieldwork.config.SecurityConfig;
import com.fieldwork.controller.CompiledReportController;
import com.fieldwork.service.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.Map;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = CompiledReportController.class,
        properties = "fieldwork.auth.allowed-origins=https://web.example.test")
@Import({SecurityConfig.class, CorsConfig.class})
class ProjectReportCorsTest {
    private static final String ORIGIN = "https://web.example.test";
    private static final String URL = "/api/compiled-reports/51/items";
    @Autowired MockMvc mvc;
    @MockitoBean AuthSessionService sessions;
    @MockitoBean CompiledReportService reports;
    @MockitoBean ReportHtmlRenderer renderer;
    @MockitoBean CompiledReportHwpxService hwpx;
    @MockitoBean ReportWorkGate gate;

    @BeforeEach void authenticate() { when(sessions.authenticate("test-token")).thenReturn(1L); }

    @Test void browserCanPreflightReportSelectionReplacement() throws Exception {
        mvc.perform(options(URL).header("Origin", ORIGIN)
                .header("Access-Control-Request-Method", "PUT")
                .header("Access-Control-Request-Headers", "authorization,content-type"))
            .andExpect(status().isOk())
            .andExpect(header().string("Access-Control-Allow-Origin", ORIGIN));
        verifyNoInteractions(reports);
    }

    @Test void authenticatedBrowserCanApplyFilteredRecords() throws Exception {
        when(reports.replaceItems(eq(51L), eq(1L), anyMap())).thenReturn(Map.of("reportId", 51, "itemCount", 1));
        mvc.perform(put(URL).header("Origin", ORIGIN).header("Authorization", "Bearer test-token")
                .contentType("application/json").content("{\"userId\":1,\"progressIds\":[21]}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.itemCount").value(1))
            .andExpect(header().string("Access-Control-Allow-Origin", ORIGIN));
        verify(reports).replaceItems(eq(51L), eq(1L), argThat(body -> body.containsKey("progressIds")));
    }

    @Test void allowingPutDoesNotAllowUntrustedOrigins() throws Exception {
        mvc.perform(options(URL).header("Origin", "https://untrusted.test")
                .header("Access-Control-Request-Method", "PUT"))
            .andExpect(status().isForbidden());
        verifyNoInteractions(reports);
    }

    @Test void allowingPutDoesNotBypassAuthentication() throws Exception {
        mvc.perform(put(URL).header("Origin", ORIGIN).contentType("application/json")
                .content("{\"userId\":1,\"progressIds\":[21]}"))
            .andExpect(status().isUnauthorized());
        verifyNoInteractions(reports);
    }
}
