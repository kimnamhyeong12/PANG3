package com.fieldwork.controller;

import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

/** Only browser-public settings belong here; never return REST/native keys. */
@RestController
public class ClientConfigController {
    private final String mapKey;
    public ClientConfigController(@Value("${KAKAO_JAVASCRIPT_KEY:}") String mapKey){this.mapKey=mapKey;}
    @GetMapping("/api/client-config")
    public ResponseEntity<Map<String,String>> read(){
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("kakaoMapKey",mapKey));
    }
}
