package com.fieldwork.dto;

import java.util.List;

public record BulkLocationRequest(
        Long createdByUserId,
        Long groupId,
        List<Row> locations
) {
    public record Row(
            Integer rowNumber,
            String address, // Previous clients: optional road-address alias.
            String lat,
            String lng,
            String roadAddress,
            String detailAddress,
            String name
    ) {}
}
