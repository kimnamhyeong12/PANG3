package com.fieldwork.service;

import com.fieldwork.security.RequestBudget;
import org.springframework.http.*;
import org.springframework.http.client.*;
import org.springframework.web.server.ResponseStatusException;
import java.io.IOException;

/** Counts actual upstream requests, including matrix fan-out and fallback calls. */
final class ProviderQuotaInterceptor implements ClientHttpRequestInterceptor {
    private static final RequestBudget BUDGET = new RequestBudget();
    private static final ThreadLocal<Long> DEADLINE = new ThreadLocal<>();
    static void begin() { DEADLINE.set(System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(45)); }
    static void end() { DEADLINE.remove(); }
    @Override public ClientHttpResponse intercept(HttpRequest request, byte[] body, ClientHttpRequestExecution execution) throws IOException {
        if (DEADLINE.get() != null && System.nanoTime() >= DEADLINE.get())
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "경로 계산 시간이 초과되었습니다. 방문지 수를 줄여 다시 시도해 주세요.");
        if (!BUDGET.allow("kakao-upstream", 300, 60000, System.currentTimeMillis()))
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "경로 서비스 사용량이 많습니다. 잠시 후 다시 시도해 주세요.");
        return execution.execute(request, body);
    }
}
