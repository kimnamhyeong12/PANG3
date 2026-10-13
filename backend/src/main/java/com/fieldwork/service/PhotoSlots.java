package com.fieldwork.service;

import java.util.*;

/** Explicit snapshots: absent photos are deleted only when their slot says delete. */
public final class PhotoSlots {
    private static final List<String> TYPES = List.of("before", "during", "after");
    private static final List<String> LABELS = List.of("작업 전", "작업 중", "작업 후");
    private PhotoSlots() {}

    public static String typeOf(Map<String, Object> photo, int index) {
        String explicit = Objects.toString(photo.get("type"), "");
        if (TYPES.contains(explicit)) return explicit;
        String comment = Objects.toString(photo.get("comment"), "");
        for (int i = 0; i < TYPES.size(); i++) if (comment.startsWith(LABELS.get(i) + "|")) return TYPES.get(i);
        return index < TYPES.size() ? TYPES.get(index) : "";
    }

    public static List<Map<String, Object>> merge(List<Map<String, Object>> slots,
            List<Map<String, Object>> previous, List<Map<String, Object>> uploads) {
        if (slots == null || slots.size() != 3) throw new IllegalArgumentException("사진 단계 정보가 필요합니다.");
        Set<String> seen = new HashSet<>();
        Set<Integer> used = new HashSet<>();
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> slot : slots) {
            String type = Objects.toString(slot.get("type"), "");
            if (!TYPES.contains(type) || !seen.add(type)) throw new IllegalArgumentException("사진 단계가 올바르지 않습니다.");
            String action = Objects.toString(slot.get("action"), "");
            if ("delete".equals(action)) continue;
            Map<String, Object> photo;
            if ("upload".equals(action)) {
                int index = Integer.parseInt(Objects.toString(slot.get("uploadIndex"), "-1"));
                if (index < 0 || index >= uploads.size() || !used.add(index)) throw new IllegalArgumentException("사진 파일이 일치하지 않습니다.");
                photo = new HashMap<>(uploads.get(index));
            } else if ("keep".equals(action)) {
                String path = Objects.toString(slot.get("path"), "");
                photo = null;
                for (int i = 0; previous != null && i < previous.size(); i++) {
                    Map<String, Object> old = previous.get(i);
                    if (type.equals(typeOf(old, i)) && !path.isBlank() && path.equals(old.get("path"))) photo = new HashMap<>(old);
                }
                if (photo == null) throw new IllegalArgumentException("기존 사진이 변경되었습니다. 다시 불러와 주세요.");
            } else throw new IllegalArgumentException("사진 처리 정보가 올바르지 않습니다.");
            photo.put("type", type);
            photo.put("comment", LABELS.get(TYPES.indexOf(type)) + "|" + Objects.toString(slot.get("comment"), ""));
            result.add(photo);
        }
        result.sort(Comparator.comparingInt(photo -> TYPES.indexOf(photo.get("type"))));
        return result;
    }
}
