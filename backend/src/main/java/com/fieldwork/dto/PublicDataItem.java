package com.fieldwork.dto;

public record PublicDataItem(
        Long id,
        String detailAddress,
        String roadAddress,
        Double lat,
        Double lng,
        String task,
        String sido,
        String sigungu,
        String adminDong
) {
}