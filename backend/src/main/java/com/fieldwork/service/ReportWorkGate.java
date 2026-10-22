package com.fieldwork.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.concurrent.Callable;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/**
 * 통합 HWPX · 보고서 HTML 처럼 무거운 작업(지도 타일·사진 수십 장·Python)을 서버 전체에서 한 번에 하나씩만 돌린다.
 * 작은 운영 서버(DB·Java·Python 한 대)에서 여러 번 눌러 동시에 돌면 메모리가 모자라 서버가 멈췄다 (2026-10-22).
 * DB 를 읽기 전에 들어와야 기다리는 동안 DB 연결을 붙잡지 않는다.
 */
@Component
public class ReportWorkGate {
    private static final long WAIT_SECONDS = 120;
    private final Semaphore permits = new Semaphore(1, true);

    public <T> T run(Callable<T> work) throws Exception {
        if (!permits.tryAcquire(WAIT_SECONDS, TimeUnit.SECONDS)) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "다른 보고서를 만드는 중입니다. 잠시 뒤 다시 시도해 주세요.");
        }
        try {
            return work.call();
        } finally {
            permits.release();
        }
    }
}
