package com.fieldwork.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.Ellipse2D;
import java.awt.geom.Path2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 보고서용 정적 위치도 (D29): 지도 타일을 서버에서 이어 붙이고 번호 핀을 그려 JPEG 로 만든다.
 * 내려받은 HTML 은 도메인 없이 열리므로 지도 SDK 를 쓸 수 없어 이미지로 넣는다. HWPX 도 같은 이미지를 쓴다.
 * 타일: VWorld 키가 있으면 VWorld 배경지도, 없으면 OpenStreetMap(로컬 확인용). 실패하면 null → 위치 표만 나간다.
 */
@Service
public class StaticMapService {
    private static final int TILE = 256;
    private static final int MAX_ZOOM = 18;
    private static final int MIN_ZOOM = 7;
    private static final int PAD = 56;
    private static final int TILE_CACHE = 48; // 타일 1장 ~256KB(디코딩). 400장이면 ~100MB 라 작은 운영 서버 메모리를 압박했다

    /** 핀 위치(이미지 기준 0~1 비율)와 JPEG. */
    public record MapImage(byte[] jpeg, int width, int height, List<PinSpot> pins) {}

    public record PinSpot(int n, double x, double y) {}

    public record Marker(int n, double lat, double lng, String color) {}

    private final boolean enabled;
    private final String tileUrl;
    private final String referer;
    private final String attribution;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3))
            .followRedirects(HttpClient.Redirect.NORMAL).build();
    private final Map<String, BufferedImage> tiles = new LinkedHashMap<>(64, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String, BufferedImage> eldest) {
            return size() > TILE_CACHE;
        }
    };

    public StaticMapService(@Value("${fieldwork.report-map.enabled:true}") boolean enabled,
            @Value("${fieldwork.report-map.vworld-key:${VWORLD_API_KEY:}}") String vworldKey,
            @Value("${fieldwork.report-map.referer:${fieldwork.auth.public-url:}}") String referer) {
        this.enabled = enabled;
        this.referer = referer == null ? "" : referer.trim();
        String key = vworldKey == null ? "" : vworldKey.trim();
        if (!key.isEmpty()) {
            this.tileUrl = "https://api.vworld.kr/req/wmts/1.0.0/" + key + "/Base/{z}/{y}/{x}.png";
            this.attribution = "© VWorld";
        } else {
            this.tileUrl = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
            this.attribution = "© OpenStreetMap contributors";
        }
    }

    /** 마커가 모두 보이게 맞춘 지도. 좌표가 없거나 타일을 못 받으면 null. */
    public MapImage render(List<Marker> markers, int width, int height) {
        if (!enabled || markers == null || markers.isEmpty()) return null;
        try {
            int zoom = fitZoom(markers, width, height);
            double scale = TILE * Math.pow(2, zoom);
            double minX = Double.MAX_VALUE, maxX = -Double.MAX_VALUE, minY = Double.MAX_VALUE, maxY = -Double.MAX_VALUE;
            for (Marker m : markers) {
                double x = worldX(m.lng(), scale), y = worldY(m.lat(), scale);
                minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            }
            // 핀 머리가 위로 솟아 있으므로 중심을 조금 위로 둔다
            double left = (minX + maxX) / 2 - width / 2.0;
            double top = (minY + maxY) / 2 - height / 2.0 - 14;

            BufferedImage canvas = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = canvas.createGraphics();
            try {
                g.setColor(new Color(0xE8EEF5));
                g.fillRect(0, 0, width, height);
                int max = 1 << zoom;
                int fromTx = (int) Math.floor(left / TILE), toTx = (int) Math.floor((left + width) / TILE);
                int fromTy = (int) Math.floor(top / TILE), toTy = (int) Math.floor((top + height) / TILE);
                for (int ty = fromTy; ty <= toTy; ty++) {
                    if (ty < 0 || ty >= max) continue;
                    for (int tx = fromTx; tx <= toTx; tx++) {
                        BufferedImage tile = tile(zoom, Math.floorMod(tx, max), ty);
                        if (tile == null) return null; // 한 장이라도 못 받으면 깨진 지도 대신 표만
                        g.drawImage(tile, (int) Math.round(tx * TILE - left), (int) Math.round(ty * TILE - top), TILE, TILE, null);
                    }
                }
                g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
                List<PinSpot> spots = new ArrayList<>();
                // 남쪽(아래) 핀이 위에 겹치도록 위도 큰 것부터 그린다
                List<Marker> ordered = new ArrayList<>(markers);
                ordered.sort((a, b) -> Double.compare(b.lat(), a.lat()));
                for (Marker m : ordered) {
                    double x = worldX(m.lng(), scale) - left, y = worldY(m.lat(), scale) - top;
                    drawPin(g, x, y, m.n(), parse(m.color()));
                    spots.add(new PinSpot(m.n(), x / width, y / height));
                }
                drawAttribution(g, width, height);
                spots.sort((a, b) -> Integer.compare(a.n(), b.n()));
                return new MapImage(jpeg(canvas), width, height, spots);
            } finally {
                g.dispose();
            }
        } catch (Exception | OutOfMemoryError ex) {
            return null;
        }
    }

    private static int fitZoom(List<Marker> markers, int width, int height) {
        if (markers.size() == 1) return 17;
        for (int z = MAX_ZOOM - 1; z >= MIN_ZOOM; z--) {
            double scale = TILE * Math.pow(2, z);
            double minX = Double.MAX_VALUE, maxX = -Double.MAX_VALUE, minY = Double.MAX_VALUE, maxY = -Double.MAX_VALUE;
            for (Marker m : markers) {
                double x = worldX(m.lng(), scale), y = worldY(m.lat(), scale);
                minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            }
            if (maxX - minX <= width - 2 * PAD && maxY - minY <= height - 2 * PAD - 30) return z;
        }
        return MIN_ZOOM;
    }

    private static double worldX(double lng, double scale) {
        return (lng + 180.0) / 360.0 * scale;
    }

    private static double worldY(double lat, double scale) {
        double s = Math.sin(Math.toRadians(Math.max(-85, Math.min(85, lat))));
        return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
    }

    private BufferedImage tile(int z, int x, int y) throws Exception {
        String url = tileUrl.replace("{z}", String.valueOf(z)).replace("{x}", String.valueOf(x)).replace("{y}", String.valueOf(y));
        synchronized (tiles) {
            BufferedImage cached = tiles.get(url);
            if (cached != null) return cached;
        }
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(5))
                .header("User-Agent", "PANG3-fieldwork-report/1.0");
        if (!referer.isEmpty()) request.header("Referer", referer);
        HttpResponse<byte[]> response = http.send(request.GET().build(), HttpResponse.BodyHandlers.ofByteArray());
        if (response.statusCode() != 200) return null;
        BufferedImage image = ImageIO.read(new ByteArrayInputStream(response.body()));
        if (image == null) return null;
        synchronized (tiles) {
            tiles.put(url, image);
        }
        return image;
    }

    /** 앱 지도와 같은 뾰족 핀: 채움 = 완료(초록), 테두리 = 작성자 색, 가운데 번호. (x, y) = 핀 끝. */
    private static void drawPin(Graphics2D g, double x, double y, int n, Color border) {
        double r = 15, cy = y - 24;
        Path2D shape = new Path2D.Double();
        shape.append(new Ellipse2D.Double(x - r, cy - r, r * 2, r * 2), false);
        Path2D tail = new Path2D.Double();
        tail.moveTo(x - r * 0.62, cy + r * 0.78);
        tail.lineTo(x, y);
        tail.lineTo(x + r * 0.62, cy + r * 0.78);
        tail.closePath();
        shape.append(tail, false);
        g.setColor(new Color(0, 0, 0, 70));
        g.translate(1.5, 2.5);
        g.fill(shape);
        g.translate(-1.5, -2.5);
        g.setColor(new Color(0x4F9588));
        g.fill(shape);
        g.setStroke(new BasicStroke(4f));
        g.setColor(border);
        g.draw(new Ellipse2D.Double(x - r + 2, cy - r + 2, (r - 2) * 2, (r - 2) * 2));
        g.setStroke(new BasicStroke(1.2f));
        g.setColor(Color.WHITE);
        g.draw(new Ellipse2D.Double(x - r, cy - r, r * 2, r * 2));
        String label = String.valueOf(n);
        g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, label.length() > 2 ? 10 : 12));
        FontMetrics fm = g.getFontMetrics();
        g.drawString(label, (float) (x - fm.stringWidth(label) / 2.0), (float) (cy + (fm.getAscent() - fm.getDescent()) / 2.0));
    }

    private void drawAttribution(Graphics2D g, int width, int height) {
        g.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 11));
        FontMetrics fm = g.getFontMetrics();
        int w = fm.stringWidth(attribution) + 10;
        g.setColor(new Color(255, 255, 255, 200));
        g.fillRect(width - w, height - 16, w, 16);
        g.setColor(new Color(0x40536F));
        g.drawString(attribution, width - w + 5, height - 4);
    }

    private static Color parse(String hex) {
        try {
            return Color.decode(hex);
        } catch (Exception ex) {
            return new Color(0x94A3B8);
        }
    }

    private static byte[] jpeg(BufferedImage image) throws java.io.IOException {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpg").next();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (MemoryCacheImageOutputStream stream = new MemoryCacheImageOutputStream(out)) {
            writer.setOutput(stream);
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(0.82f);
            writer.write(null, new IIOImage(image, null, null), param);
        } finally {
            writer.dispose();
        }
        return out.toByteArray();
    }
}
