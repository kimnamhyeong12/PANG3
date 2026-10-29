package com.fieldwork.service;

import com.fieldwork.config.FieldworkProperties;
import com.fieldwork.util.ProjectPaths;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/** Relays original tiles only. No ImageIO, bitmap decoding, stitching, pins or API keys in responses. */
@Service
public class ReportMapTileService {
    public static final long CACHE_SECONDS = 7 * 86400;
    private static final int MAX_TILE = 1024 * 1024;
    private final String template, referer, attribution, layer;
    private final boolean enabled;
    private final Path cache;
    private final Semaphore downloads = new Semaphore(4);
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();

    public record Tile(byte[] bytes, String contentType, String attribution) {}
    public ReportMapTileService(@Value("${fieldwork.report-map.enabled:true}") boolean enabled,
            @Value("${fieldwork.report-map.vworld-key:${VWORLD_API_KEY:}}") String key,
            @Value("${fieldwork.report-map.referer:${fieldwork.auth.public-url:}}") String referer,
            FieldworkProperties properties) {
        this.enabled = enabled; this.referer = referer == null ? "" : referer.trim();
        boolean vworld = key != null && !key.isBlank();
        this.template = vworld ? "https://api.vworld.kr/req/wmts/1.0.0/" + key.trim() + "/Base/{z}/{y}/{x}.png"
                : "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
        this.attribution = vworld ? "© VWorld" : "© OpenStreetMap contributors";
        this.layer = vworld ? "vworld" : "osm";
        this.cache = ProjectPaths.resolve(properties.getAi().getOutputDir()).resolve("_map_tiles").toAbsolutePath().normalize();
    }

    public Tile get(int z, int x, int y) {
        return get(z, x, y, "");
    }
    public Tile get(int z, int x, int y, String browserReferer) {
        if (z < 7 || z > 17 || x < 0 || y < 0 || x >= (1 << z) || y >= (1 << z))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "지도 좌표 범위를 확인해 주세요.");
        if (!enabled) throw unavailable();
        Path file = cache.resolve(layer + "-" + z + "-" + x + "-" + y + ".tile");
        try {
            if (Files.isRegularFile(file) && Files.size(file) <= MAX_TILE
                    && Files.getLastModifiedTime(file).toMillis() > System.currentTimeMillis() - CACHE_SECONDS * 1000) {
                try { return tile(Files.readAllBytes(file)); }
                catch (ResponseStatusException corrupt) { Files.deleteIfExists(file); }
            }
            boolean acquired = downloads.tryAcquire(3, TimeUnit.SECONDS);
            if (!acquired) throw unavailable();
            try {
                byte[] bytes = fetch(z, x, y, upstreamReferer(browserReferer));
                Tile result = tile(bytes);
                Files.createDirectories(cache);
                Path temporary = Files.createTempFile(cache, "tile-", ".tmp");
                try { Files.write(temporary, bytes); Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING); }
                finally { Files.deleteIfExists(temporary); }
                trim();
                return result;
            } finally { downloads.release(); }
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt(); throw unavailable();
        } catch (ResponseStatusException error) { throw error; }
        catch (Exception error) { throw unavailable(); } // Never include an upstream URL/key in errors/logs.
    }

    protected byte[] fetch(int z, int x, int y, String sourceReferer) throws Exception {
        String url = template.replace("{z}", "" + z).replace("{x}", "" + x).replace("{y}", "" + y);
        var builder = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(8))
                .header("User-Agent", "PANG3-fieldwork-report/1.0");
        if (!sourceReferer.isBlank()) builder.header("Referer", sourceReferer);
        var response = http.send(builder.GET().build(), HttpResponse.BodyHandlers.ofInputStream());
        try (var stream = response.body()) {
            if (response.statusCode() != 200) throw unavailable();
            return stream.readNBytes(MAX_TILE + 1);
        }
    }
    private String upstreamReferer(String observed) {
        String value = referer.isBlank() ? Objects.toString(observed, "") : referer;
        if (value.length() > 2048) return "";
        try {
            URI uri = URI.create(value);
            if (!Set.of("http", "https").contains(uri.getScheme()) || uri.getHost() == null) return "";
            return new URI(uri.getScheme(), null, uri.getHost(), uri.getPort(), uri.getPath(), null, null).toASCIIString();
        } catch (Exception ignored) { return ""; }
    }
    private Tile tile(byte[] bytes) {
        if (bytes.length == 0 || bytes.length > MAX_TILE) throw unavailable();
        boolean png = bytes.length >= 8 && bytes[0] == (byte) 137 && bytes[1] == 80 && bytes[2] == 78 && bytes[3] == 71
                && bytes[4] == 13 && bytes[5] == 10 && bytes[6] == 26 && bytes[7] == 10;
        if (!png || bytes.length < 24 || java.nio.ByteBuffer.wrap(bytes, 16, 8).getInt() != 256
                || java.nio.ByteBuffer.wrap(bytes, 20, 4).getInt() != 256) throw unavailable();
        return new Tile(bytes, "image/png", attribution);
    }
    private synchronized void trim() throws java.io.IOException {
        try (var stream = Files.list(cache)) {
            var files = stream.filter(p -> p.getFileName().toString().matches("(?:osm|vworld)-[0-9]+-[0-9]+-[0-9]+\\.tile"))
                    .sorted(Comparator.comparingLong(p -> p.toFile().lastModified())).toList();
            long total = 0;
            for (Path path : files) total += Files.size(path);
            int remaining = files.size();
            for (Path path : files) {
                if (remaining <= 512 && total <= 128L * 1024 * 1024) break;
                total -= Files.size(path); Files.deleteIfExists(path); remaining--;
            }
        }
    }
    private static ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "위치도 배경을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
}
