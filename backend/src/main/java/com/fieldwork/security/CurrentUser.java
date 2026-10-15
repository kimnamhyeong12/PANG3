package com.fieldwork.security;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

public final class CurrentUser {
    private CurrentUser() {}
    public static Long id() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof Long userId)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
        }
        return userId;
    }
    public static Long require(Long claimed) {
        Long actual = id();
        if (claimed != null && !actual.equals(claimed)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "다른 사용자의 권한으로 요청할 수 없습니다.");
        }
        return actual;
    }
    public static Long require(Object claimed) {
        try { return require(claimed == null ? null : Long.valueOf(claimed.toString())); }
        catch (NumberFormatException ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "사용자 정보가 올바르지 않습니다."); }
    }
}
