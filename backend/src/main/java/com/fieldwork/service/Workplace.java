package com.fieldwork.service;

public final class Workplace {
    private Workplace() {}
    public static void validate(String address, Double lat, Double lng) {
        if (address == null || address.isBlank() || address.trim().length() > 255 || lat == null || lng == null
                || !Double.isFinite(lat) || !Double.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            throw new IllegalArgumentException("검색 결과에서 근무지 주소와 위치를 선택해주세요.");
        }
    }
}
