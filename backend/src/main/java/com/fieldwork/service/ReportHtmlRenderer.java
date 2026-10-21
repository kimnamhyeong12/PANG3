package com.fieldwork.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fieldwork.config.FieldworkProperties;
import com.fieldwork.util.ProjectPaths;
import org.springframework.stereotype.Component;

import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * REPORT_SCHEMA v1 JSON -> 단일 HTML 문자열 (인라인 CSS, 사진은 축소 JPEG data URI).
 * 지도는 window.REPORT_KAKAO_KEY 가 주입된 경우에만 카카오 SDK 로 그리고, 위치 표는 항상 출력한다.
 */
@Component
public class ReportHtmlRenderer {
    private static final int MAX_PHOTO_PX = 480;
    private static final long MAX_PIXELS = 40_000_000L;
    private static final long MAX_FILE_BYTES = 25L * 1024 * 1024;
    private static final Pattern FILE_URL = Pattern.compile("^/api/files/(\\d+)/([^/\\\\]+)$");
    private static final String[] SECTION_COLORS = {
            "#2477F3", "#12A9A5", "#BE9446", "#E34D59", "#4F9588", "#1551A6", "#C87973", "#078A88"};
    private static final Map<String, String> GROUP_BY_LABELS = Map.of(
            "adminDong", "행정동", "year", "연도", "author", "작성자", "category", "분류");

    private final Path uploadBase;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ReportHtmlRenderer(FieldworkProperties properties) {
        this.uploadBase = ProjectPaths.resolve(properties.getUpload().getBaseDir()).toAbsolutePath().normalize();
    }

    @SuppressWarnings("unchecked")
    public String render(Map<String, Object> json) {
        Map<String, Object> report = map(json.get("report"));
        Map<String, Object> project = map(json.get("project"));
        Map<String, Object> summary = map(json.get("summary"));
        Map<String, Object> period = map(summary.get("period"));
        List<Map<String, Object>> sections = (List<Map<String, Object>>) (List<?>) list(json.get("sections"));
        Map<String, String> photoCache = new HashMap<>();

        StringBuilder html = new StringBuilder(64 * 1024);
        html.append("<!DOCTYPE html>\n<html lang=\"ko\">\n<head>\n<meta charset=\"UTF-8\">\n")
                .append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n")
                .append("<title>").append(esc(report.get("title"))).append("</title>\n")
                .append("<style>").append(CSS).append("</style>\n</head>\n<body>\n<main class=\"rp\">\n");

        // title block
        html.append("<header class=\"rp-head\">")
                .append("<div class=\"rp-kicker\">").append(esc(project.get("groupName"))).append("</div>")
                .append("<h1>").append(esc(report.get("title"))).append("</h1>")
                .append("<div class=\"rp-sub\">").append(esc(project.get("name")));
        if ("DRAFT".equals(report.get("status"))) html.append(" <span class=\"rp-badge\">초안</span>");
        else if (report.get("status") != null) html.append(" <span class=\"rp-badge rp-final\">확정 v").append(esc(report.get("version"))).append("</span>");
        html.append("</div></header>\n");

        // overview
        String groupBy = Objects.toString(report.get("groupBy"), "adminDong");
        List<Object> authors = list(summary.get("authors"));
        html.append("<section class=\"rp-sec\"><h2>개요</h2><table class=\"rp-table rp-overview\"><tbody>")
                .append(row("프로젝트", esc(project.get("name"))))
                .append(row("사업 기간", esc(range(project.get("startDate"), project.get("endDate")))))
                .append(row("기간", esc(range(period.get("from"), period.get("to")))))
                .append(row("총 건수", esc(summary.get("totalCount")) + "건"))
                .append(row("분류 기준", esc(GROUP_BY_LABELS.getOrDefault(groupBy, groupBy))))
                .append(row("작성자", esc(authors.isEmpty() ? "-" : String.join(", ", authors.stream().map(String::valueOf).toList()))))
                .append("</tbody></table>");
        List<Object> bySection = list(summary.get("bySection"));
        if (!bySection.isEmpty()) {
            html.append("<table class=\"rp-table\"><thead><tr><th>")
                    .append(esc(GROUP_BY_LABELS.getOrDefault(groupBy, "섹션"))).append("</th><th class=\"rp-num\">건수</th></tr></thead><tbody>");
            for (Object raw : bySection) {
                Map<String, Object> s = map(raw);
                html.append("<tr><td>").append(esc(s.get("label"))).append("</td><td class=\"rp-num\">")
                        .append(esc(s.get("count"))).append("</td></tr>");
            }
            html.append("</tbody></table>");
        }
        html.append("</section>\n");

        // location map + table (numbering follows section order)
        List<Map<String, Object>> markers = new ArrayList<>();
        StringBuilder locationRows = new StringBuilder();
        int number = 0;
        for (int s = 0; s < sections.size(); s++) {
            Map<String, Object> section = sections.get(s);
            String color = SECTION_COLORS[s % SECTION_COLORS.length];
            for (Object raw : list(section.get("items"))) {
                Map<String, Object> item = map(raw);
                number++;
                locationRows.append("<tr><td class=\"rp-num\">").append(number).append("</td><td>")
                        .append(esc(orDash(item.get("address")))).append("</td><td><span class=\"rp-dot\" style=\"background:")
                        .append(color).append("\"></span>").append(esc(section.get("label"))).append("</td><td>")
                        .append(esc(date(item.get("completedAt")))).append("</td></tr>");
                if (item.get("lat") instanceof Number lat && item.get("lng") instanceof Number lng) {
                    Map<String, Object> marker = new LinkedHashMap<>();
                    marker.put("n", number);
                    marker.put("lat", lat.doubleValue());
                    marker.put("lng", lng.doubleValue());
                    marker.put("color", color);
                    marker.put("label", Objects.toString(section.get("label"), ""));
                    markers.add(marker);
                }
            }
        }
        html.append("<section class=\"rp-sec\"><h2>위치도</h2>")
                .append("<div id=\"report-map\" class=\"rp-map\"></div>")
                .append("<script type=\"application/json\" id=\"report-markers\">").append(scriptJson(markers)).append("</script>")
                .append("<table class=\"rp-table\"><thead><tr><th class=\"rp-num\">번호</th><th>위치</th><th>")
                .append(esc(GROUP_BY_LABELS.getOrDefault(groupBy, "섹션"))).append("</th><th>완료일</th></tr></thead><tbody>");
        if (number == 0) locationRows.append("<tr><td colspan=\"4\" class=\"rp-empty\">담긴 항목이 없습니다.</td></tr>");
        html.append(locationRows).append("</tbody></table></section>\n");

        // sections
        number = 0;
        for (int s = 0; s < sections.size(); s++) {
            Map<String, Object> section = sections.get(s);
            String color = SECTION_COLORS[s % SECTION_COLORS.length];
            List<Object> rows = list(section.get("items"));
            html.append("<section class=\"rp-sec\"><h2><span class=\"rp-dot\" style=\"background:").append(color).append("\"></span>")
                    .append(esc(section.get("label"))).append(" <small>").append(rows.size()).append("건</small></h2>");
            html.append("<table class=\"rp-table\"><thead><tr><th class=\"rp-num\">번호</th><th>위치</th><th>완료일</th><th>작성자</th></tr></thead><tbody>");
            int first = number;
            for (Object raw : rows) {
                Map<String, Object> item = map(raw);
                number++;
                html.append("<tr><td class=\"rp-num\">").append(number).append("</td><td>").append(esc(orDash(item.get("address"))))
                        .append("</td><td>").append(esc(date(item.get("completedAt")))).append("</td><td>")
                        .append(esc(map(item.get("author")).get("name"))).append("</td></tr>");
            }
            html.append("</tbody></table>");
            number = first;
            for (Object raw : rows) {
                number++;
                appendCard(html, map(raw), number, photoCache);
            }
            html.append("</section>\n");
        }

        html.append("<footer class=\"rp-foot\">생성 ")
                .append(esc(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"))))
                .append(" · 보고서 #").append(esc(report.get("reportId"))).append("</footer>\n</main>\n")
                .append("<script>").append(MAP_SCRIPT).append("</script>\n</body>\n</html>\n");
        return html.toString();
    }

    private void appendCard(StringBuilder html, Map<String, Object> item, int number, Map<String, String> photoCache) {
        Map<String, Object> author = map(item.get("author"));
        html.append("<article class=\"rp-card\"><div class=\"rp-card-head\"><span class=\"rp-no\">").append(number)
                .append("</span><strong>").append(esc(orDash(item.get("address")))).append("</strong></div>")
                .append("<dl class=\"rp-meta\">")
                .append("<dt>완료일</dt><dd>").append(esc(date(item.get("completedAt")))).append("</dd>")
                .append("<dt>작성자</dt><dd>").append(esc(author.get("name"))).append("</dd>");
        if (item.get("category") != null) html.append("<dt>분류</dt><dd>").append(esc(item.get("category"))).append("</dd>");
        if (item.get("adminDong") != null) html.append("<dt>행정동</dt><dd>").append(esc(item.get("adminDong"))).append("</dd>");
        html.append("</dl>");
        String comment = Objects.toString(item.get("comment"), "").trim();
        html.append("<div class=\"rp-label\">작업 내용</div><p class=\"rp-text\">")
                .append(comment.isEmpty() ? "-" : multiline(comment)).append("</p>");
        String ai = Objects.toString(item.get("aiRefinedContent"), "").trim();
        if (!ai.isEmpty()) {
            html.append("<div class=\"rp-label\">AI 정리</div><p class=\"rp-text rp-ai\">").append(multiline(ai)).append("</p>");
        }
        StringBuilder photos = new StringBuilder();
        for (Object raw : list(item.get("photos"))) {
            Map<String, Object> photo = map(raw);
            String src = embed(Objects.toString(photo.get("url"), null), photoCache);
            if (src == null) continue;
            String caption = (Objects.toString(photo.get("slot"), "") + " " + Objects.toString(photo.get("comment"), "")).trim();
            photos.append("<figure><img src=\"").append(src).append("\" alt=\"").append(esc(caption)).append("\">");
            if (!caption.isEmpty()) photos.append("<figcaption>").append(esc(caption)).append("</figcaption>");
            photos.append("</figure>");
        }
        String mapImage = embed(Objects.toString(item.get("locationMapImage"), null), photoCache);
        if (mapImage != null) {
            photos.append("<figure><img src=\"").append(mapImage).append("\" alt=\"위치도\"><figcaption>위치도</figcaption></figure>");
        }
        if (!photos.isEmpty()) html.append("<div class=\"rp-photos\">").append(photos).append("</div>");
        html.append("</article>\n");
    }

    /** /api/files/{taskId}/{name} -> downscaled JPEG data URI, or null on any failure. */
    String embed(String url, Map<String, String> cache) {
        if (url == null) return null;
        if (cache.containsKey(url)) return cache.get(url);
        String result = null;
        try {
            Path file = resolveFile(url);
            BufferedImage source = file == null ? null : readDownscaled(file);
            if (source != null) result = "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(toJpeg(source));
        } catch (Exception | OutOfMemoryError ignored) {
            result = null;
        }
        cache.put(url, result);
        return result;
    }

    /** Maps a public /api/files/{taskId}/{name} URL to the stored file (same rules as FileController), or null. */
    public Path resolveFile(String url) {
        if (url == null) return null;
        try {
            Matcher m = FILE_URL.matcher(url);
            if (!m.matches() || m.group(2).equals("..") || m.group(2).equals(".")) return null;
            Path dir = uploadBase.resolve(m.group(1)).normalize();
            Path file = dir.resolve(m.group(2)).normalize();
            if (!file.startsWith(dir) || !Files.isRegularFile(file)) return null;
            Path realDir = dir.toRealPath();
            if (!realDir.startsWith(uploadBase.toRealPath()) || !file.toRealPath().startsWith(realDir)) return null;
            return file;
        } catch (Exception ex) {
            return null;
        }
    }

    /** Reads the header first; skips huge files/images and subsamples while decoding. */
    private static BufferedImage readDownscaled(Path file) throws java.io.IOException {
        if (Files.size(file) > MAX_FILE_BYTES) return null;
        try (ImageInputStream in = ImageIO.createImageInputStream(file.toFile())) {
            if (in == null) return null;
            Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) return null;
            ImageReader reader = readers.next();
            try {
                reader.setInput(in, true, true);
                int w = reader.getWidth(0), h = reader.getHeight(0);
                if (w <= 0 || h <= 0 || (long) w * h > MAX_PIXELS) return null;
                ImageReadParam param = reader.getDefaultReadParam();
                int step = Math.max(1, Math.max(w, h) / MAX_PHOTO_PX);
                if (step > 1) param.setSourceSubsampling(step, step, 0, 0);
                return reader.read(0, param);
            } finally {
                reader.dispose();
            }
        }
    }

    private static byte[] toJpeg(BufferedImage source) throws java.io.IOException {
        int w = source.getWidth(), h = source.getHeight();
        double scale = Math.min(1.0, (double) MAX_PHOTO_PX / Math.max(w, h));
        int tw = Math.max(1, (int) Math.round(w * scale)), th = Math.max(1, (int) Math.round(h * scale));
        BufferedImage target = new BufferedImage(tw, th, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = target.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, tw, th);
            g.drawImage(source, 0, 0, tw, th, null);
        } finally {
            g.dispose();
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        if (!ImageIO.write(target, "jpg", out)) throw new java.io.IOException("no jpeg writer");
        return out.toByteArray();
    }

    // ---------- small helpers ----------

    public static String esc(Object value) {
        if (value == null) return "";
        String text = value.toString();
        StringBuilder out = new StringBuilder(text.length() + 16);
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            switch (c) {
                case '&' -> out.append("&amp;");
                case '<' -> out.append("&lt;");
                case '>' -> out.append("&gt;");
                case '"' -> out.append("&quot;");
                case '\'' -> out.append("&#39;");
                default -> out.append(c);
            }
        }
        return out.toString();
    }

    private static String multiline(String text) {
        return esc(text).replace("\r\n", "\n").replace("\n", "<br>");
    }

    private String scriptJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value)
                    .replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026");
        } catch (Exception ex) {
            return "[]";
        }
    }

    private static String row(String label, String valueHtml) {
        return "<tr><th>" + label + "</th><td>" + valueHtml + "</td></tr>";
    }

    private static String range(Object from, Object to) {
        if (from == null && to == null) return "-";
        return Objects.toString(from, "") + " ~ " + Objects.toString(to, "");
    }

    private static String date(Object value) {
        String text = Objects.toString(value, "");
        if (text.isEmpty()) return "-";
        return text.length() >= 10 ? text.substring(0, 10) : text;
    }

    private static Object orDash(Object value) {
        return value == null || value.toString().isBlank() ? "-" : value;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object value) {
        return value instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
    }

    @SuppressWarnings("unchecked")
    private static List<Object> list(Object value) {
        return value instanceof List<?> l ? (List<Object>) l : List.of();
    }

    private static final String CSS = """
            *{box-sizing:border-box}
            body{margin:0;background:#F4F8FF;color:#10285B;font-family:'Pretendard','Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif;font-size:14px;line-height:1.6;-webkit-text-size-adjust:100%}
            .rp{max-width:880px;margin:0 auto;padding:24px 16px 40px}
            .rp-head{background:#FFFFFF;border:1px solid #DCE7F5;border-radius:16px;padding:22px 20px;margin-bottom:16px;border-top:5px solid #2477F3}
            .rp-kicker{color:#607195;font-size:13px}
            .rp-head h1{margin:4px 0 6px;font-size:24px;line-height:1.3;word-break:keep-all}
            .rp-sub{color:#607195}
            .rp-badge{display:inline-block;margin-left:6px;padding:1px 9px;border-radius:999px;background:#F8F2E7;color:#866320;font-size:12px;font-weight:600}
            .rp-badge.rp-final{background:#ECF5F2;color:#326F64}
            .rp-sec{background:#FFFFFF;border:1px solid #DCE7F5;border-radius:16px;padding:18px 16px;margin-bottom:16px}
            .rp-sec h2{margin:0 0 12px;font-size:18px;display:flex;align-items:center;gap:8px}
            .rp-sec h2 small{color:#607195;font-weight:500;font-size:13px}
            .rp-table{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:13px}
            .rp-table th,.rp-table td{border:1px solid #DCE7F5;padding:7px 9px;text-align:left;vertical-align:top;word-break:break-all}
            .rp-table thead th{background:#E8F2FF;color:#1551A6;font-weight:600}
            .rp-overview th{width:110px;background:#F4F8FF;color:#607195;font-weight:600}
            .rp-num{text-align:center !important;width:56px;white-space:nowrap}
            .rp-empty{text-align:center !important;color:#93A1BA}
            .rp-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:middle}
            .rp-map{display:none;width:100%;height:360px;border-radius:12px;border:1px solid #DCE7F5;margin-bottom:12px;overflow:hidden}
            .rp-pin{width:24px;height:24px;border-radius:50%;color:#FFFFFF;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #FFFFFF;box-shadow:0 1px 4px rgba(16,40,91,.35)}
            .rp-card{border:1px solid #DCE7F5;border-radius:12px;padding:14px;margin-top:12px;break-inside:avoid;page-break-inside:avoid}
            .rp-card-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
            .rp-no{flex:none;min-width:26px;height:26px;padding:0 6px;border-radius:999px;background:#2477F3;color:#FFFFFF;font-size:12px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
            .rp-meta{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin:0 0 8px;font-size:13px}
            .rp-meta dt{color:#607195}
            .rp-meta dd{margin:0}
            .rp-label{font-size:12px;font-weight:700;color:#1551A6;margin-top:6px}
            .rp-text{margin:2px 0 6px;white-space:normal;word-break:break-all}
            .rp-ai{background:#F4F8FF;border-radius:8px;padding:8px 10px}
            .rp-photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin-top:8px}
            .rp-photos figure{margin:0;border:1px solid #DCE7F5;border-radius:8px;overflow:hidden;background:#F4F8FF}
            .rp-photos img{display:block;width:100%;height:auto}
            .rp-photos figcaption{font-size:12px;color:#607195;padding:4px 8px}
            .rp-foot{text-align:center;color:#93A1BA;font-size:12px;margin-top:8px}
            @media (max-width:520px){.rp-head h1{font-size:20px}.rp-overview th{width:84px}.rp-photos{grid-template-columns:repeat(2,1fr)}}
            @page{size:A4;margin:14mm}
            @media print{body{background:#FFFFFF;font-size:12px}.rp{max-width:none;padding:0}.rp-head,.rp-sec{border:none;border-radius:0;padding:0;margin-bottom:14px}.rp-head{border-top:4px solid #2477F3;padding-top:8px}.rp-map{display:none !important}.rp-sec h2{break-after:avoid;page-break-after:avoid}.rp-table thead{display:table-header-group}.rp-table tr{break-inside:avoid;page-break-inside:avoid}.rp-photos{grid-template-columns:repeat(3,1fr)}.rp-foot{display:none}}
            """;

    private static final String MAP_SCRIPT = """
            (function(){var el=document.getElementById('report-map');if(!el)return;var data=[];
            try{data=JSON.parse(document.getElementById('report-markers').textContent||'[]');}catch(e){data=[];}
            var key=window.REPORT_KAKAO_KEY;if(!key||!data.length){el.style.display='none';return;}
            el.style.display='block';var s=document.createElement('script');
            s.src='https://dapi.kakao.com/v2/maps/sdk.js?appkey='+encodeURIComponent(key)+'&autoload=false';
            s.onerror=function(){el.style.display='none';};
            s.onload=function(){if(!window.kakao||!kakao.maps){el.style.display='none';return;}kakao.maps.load(function(){
            var map=new kakao.maps.Map(el,{center:new kakao.maps.LatLng(data[0].lat,data[0].lng),level:5});
            var bounds=new kakao.maps.LatLngBounds();
            data.forEach(function(m){var pos=new kakao.maps.LatLng(m.lat,m.lng);bounds.extend(pos);
            var pin=document.createElement('div');pin.className='rp-pin';pin.style.background=m.color;pin.title=m.label;pin.textContent=String(m.n);
            new kakao.maps.CustomOverlay({position:pos,content:pin,yAnchor:0.5,map:map});});
            if(data.length>1)map.setBounds(bounds);});};
            document.head.appendChild(s);})();
            """;
}
