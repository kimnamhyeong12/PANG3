package com.fieldwork.service;

import java.util.List;
import java.util.Map;

/** No database required: stage memos survive saves even without an image. */
public class PhotoSlotsMemoTest {
    public static void main(String[] args) {
        var slots = List.<Map<String, Object>>of(
            Map.of("type", "before", "action", "delete", "comment", ""),
            Map.of("type", "during", "action", "delete", "comment", "진행 기록"),
            Map.of("type", "after", "action", "delete", "comment", "마무리 기록"));
        var saved = PhotoSlots.merge(slots, List.of(Map.of("type", "after", "path", "/old.jpg")), List.of());
        assert saved.size() == 2;
        assert saved.get(1).get("type").equals("after");
        assert saved.get(1).get("comment").equals("작업 후|마무리 기록");
        assert !saved.get(1).containsKey("path") : "Deleting an image must not retain its old path";
        assert PhotoSlots.merge(slots, saved, List.of()).equals(saved) : "A second save must preserve memos";
        var cleared = List.<Map<String, Object>>of(
            Map.of("type", "before", "action", "delete"),
            Map.of("type", "during", "action", "delete", "comment", "   "),
            Map.of("type", "after", "action", "delete", "comment", ""));
        assert PhotoSlots.merge(cleared, saved, List.of()).isEmpty();
        System.out.println("Photo slot memo checks passed");
    }
}
