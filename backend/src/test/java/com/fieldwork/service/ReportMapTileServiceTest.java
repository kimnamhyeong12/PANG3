package com.fieldwork.service;

import com.fieldwork.config.FieldworkProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.server.ResponseStatusException;
import java.nio.file.*;
import java.nio.file.attribute.FileTime;
import static org.junit.jupiter.api.Assertions.*;

class ReportMapTileServiceTest {
    @TempDir Path temporary;
    private class Tiles extends ReportMapTileService {
        byte[] data; int calls; String referer;
        Tiles(byte[] data) { super(true, "synthetic-secret-key", "", config()); this.data = data; }
        @Override protected byte[] fetch(int z, int x, int y, String referer) { calls++; this.referer = referer; return data; }
    }
    private FieldworkProperties config() {
        var config = new FieldworkProperties(); config.getAi().setOutputDir(temporary.toString()); return config;
    }
    private byte[] png(int size) throws Exception {
        var bytes = new java.io.ByteArrayOutputStream();
        javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(size, size, java.awt.image.BufferedImage.TYPE_INT_RGB), "png", bytes);
        return bytes.toByteArray();
    }
    @Test void relaysOriginalBytesAndCachesCompressedTilesWithoutExposingKeys() throws Exception {
        byte[] bytes = png(256); Tiles service = new Tiles(bytes);
        var first = service.get(17, 1, 2);
        assertArrayEquals(bytes, first.bytes()); assertEquals("image/png", first.contentType());
        assertEquals("© VWorld", first.attribution());
        assertFalse(first.toString().contains("synthetic-secret-key"));
        assertArrayEquals(bytes, service.get(17, 1, 2).bytes()); assertEquals(1, service.calls);
        Path cached = temporary.resolve("_map_tiles/vworld-17-1-2.tile");
        Files.setLastModifiedTime(cached, FileTime.fromMillis(System.currentTimeMillis() - (ReportMapTileService.CACHE_SECONDS + 1) * 1000));
        service.get(17, 1, 2); assertEquals(2, service.calls);
        Files.write(cached, new byte[]{1}); service.get(17, 1, 2); assertEquals(3, service.calls);
    }
    @Test void boundsCoordinatesSizesAndFormatsBeforeServing() throws Exception {
        Tiles service = new Tiles(png(256));
        assertThrows(ResponseStatusException.class, () -> service.get(18, 1, 1));
        assertThrows(ResponseStatusException.class, () -> service.get(17, -1, 1));
        assertThrows(ResponseStatusException.class, () -> service.get(17, 1 << 17, 1));
        assertEquals(0, service.calls);
        service.data = new byte[1024 * 1024 + 1];
        assertThrows(ResponseStatusException.class, () -> service.get(17, 1, 1));
        service.data = png(512);
        assertThrows(ResponseStatusException.class, () -> service.get(17, 1, 1));
        service.data = "upstream error with synthetic-secret-key".getBytes();
        var error = assertThrows(ResponseStatusException.class, () -> service.get(17, 1, 1));
        assertFalse(error.getReason().contains("synthetic-secret-key"));
    }
    @Test void preservesWebReferrerWithoutForwardingQueryCredentials() throws Exception {
        Tiles service = new Tiles(png(256));
        service.get(17, 1, 1, "https://web.example/reports?token=private#fragment");
        assertEquals("https://web.example/reports", service.referer);
    }
}
