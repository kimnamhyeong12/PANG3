package com.fieldwork.controller;

import com.fieldwork.security.CurrentUser;
import com.fieldwork.service.ReportMapTileService;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.time.Duration;

@RestController
@RequestMapping("/api/local-report-map/tiles")
public class ReportMapTileController {
    private final ReportMapTileService tiles;
    private final com.fieldwork.security.RequestBudget budget = new com.fieldwork.security.RequestBudget();
    public ReportMapTileController(ReportMapTileService tiles) { this.tiles = tiles; }
    @GetMapping("/{z}/{x}/{y}")
    public ResponseEntity<byte[]> tile(@PathVariable int z, @PathVariable int x, @PathVariable int y,
            @RequestHeader(value = "Referer", defaultValue = "") String referer) {
        Long userId = CurrentUser.id();
        if (!budget.allow("map-tiles:" + userId, 4096, 300000, System.currentTimeMillis()))
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "위치도 요청이 많습니다. 잠시 후 다시 시도해 주세요.");
        var tile = tiles.get(z, x, y, referer);
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(ReportMapTileService.CACHE_SECONDS)).cachePrivate())
                .header("X-Map-Attribution", tile.attribution()).contentType(MediaType.parseMediaType(tile.contentType())).body(tile.bytes());
    }
}
