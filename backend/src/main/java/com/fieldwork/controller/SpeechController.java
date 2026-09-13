package com.fieldwork.controller;

import com.fieldwork.service.SpeechService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
@RequestMapping("/api/speech")
public class SpeechController {

    private final SpeechService speechService;

    public SpeechController(SpeechService speechService) {
        this.speechService = speechService;
    }

    @PostMapping(value = "/transcribe", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> transcribe(
            @RequestPart("audio") MultipartFile audio
    ) {
        Map<String, Object> result = speechService.transcribe(audio);
        boolean ok = Boolean.TRUE.equals(result.get("ok"));
        return ok ? ResponseEntity.ok(result) : ResponseEntity.badRequest().body(result);
    }
}
