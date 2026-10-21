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
    /** 앱 지도 핀과 같은 규칙: 핀 채움 = 상태(완료), 테두리 = 작성자. */
    private static final String[] AUTHOR_COLORS = {
            "#2477F3", "#12A9A5", "#BE9446", "#7A5BD6", "#E34D59", "#1551A6", "#C87973", "#078A88"};
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
        Map<String, String> authorColors = new LinkedHashMap<>();

        StringBuilder html = new StringBuilder(64 * 1024);
        html.append("<!DOCTYPE html>\n<html lang=\"ko\">\n<head>\n<meta charset=\"UTF-8\">\n")
                .append("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n")
                .append("<title>").append(esc(report.get("title"))).append("</title>\n")
                .append("<style>").append(CSS).append("</style>\n</head>\n<body>\n<main class=\"rp\">\n");

        // title block + one-line overview
        String groupBy = Objects.toString(report.get("groupBy"), "adminDong");
        List<Object> authors = list(summary.get("authors"));
        html.append("<header class=\"rp-head\">")
                .append("<div class=\"rp-kicker\">").append(esc(project.get("groupName"))).append(" · ")
                .append(esc(project.get("name"))).append("</div>")
                .append("<h1>").append(esc(report.get("title"))).append("</h1>")
                .append("<div class=\"rp-sub\">");
        if ("DRAFT".equals(report.get("status"))) html.append("<span class=\"rp-badge\">초안</span> ");
        else if (report.get("status") != null) html.append("<span class=\"rp-badge rp-final\">확정 v").append(esc(report.get("version"))).append("</span> ");
        html.append("기간 ").append(esc(range(period.get("from"), period.get("to"))))
                .append(" · 총 ").append(esc(summary.get("totalCount"))).append("건")
                .append(" · ").append(esc(GROUP_BY_LABELS.getOrDefault(groupBy, groupBy))).append("별")
                .append(" · 작성자 ").append(esc(authors.isEmpty() ? "-" : String.join(", ", authors.stream().map(String::valueOf).toList())))
                .append("</div></header>\n");

        // map (pins numbered like cards) + location table fallback
        List<Map<String, Object>> markers = new ArrayList<>();
        StringBuilder locationRows = new StringBuilder();
        int number = 0;
        for (Map<String, Object> section : sections) {
            for (Object raw : list(section.get("items"))) {
                Map<String, Object> item = map(raw);
                number++;
                String color = authorColor(authorColors, map(item.get("author")));
                locationRows.append("<tr><td class=\"rp-num\">").append(number).append("</td><td>")
                        .append(esc(orDash(item.get("address")))).append("</td><td>").append(esc(section.get("label")))
                        .append("</td><td>").append(esc(date(item.get("completedAt")))).append("</td></tr>");
                if (item.get("lat") instanceof Number lat && item.get("lng") instanceof Number lng) {
                    Map<String, Object> marker = new LinkedHashMap<>();
                    marker.put("n", number);
                    marker.put("lat", lat.doubleValue());
                    marker.put("lng", lng.doubleValue());
                    marker.put("color", color);
                    marker.put("title", Objects.toString(item.get("title"), ""));
                    markers.add(marker);
                }
            }
        }
        html.append("<section class=\"rp-sec rp-mapbox\">")
                .append("<div id=\"report-map\" class=\"rp-map\"></div>")
                .append("<script type=\"application/json\" id=\"report-markers\">").append(scriptJson(markers)).append("</script>");
        if (!authorColors.isEmpty()) {
            html.append("<div class=\"rp-legend\">");
            authorColors.forEach((name, color) -> html.append("<span><i style=\"border-color:").append(color).append("\"></i>")
                    .append(esc(name)).append("</span>"));
            html.append("</div>");
        }
        html.append("<div id=\"report-fallback\"><table class=\"rp-table\"><thead><tr><th class=\"rp-num\">번호</th><th>위치</th><th>")
                .append(esc(GROUP_BY_LABELS.getOrDefault(groupBy, "섹션"))).append("</th><th>완료일</th></tr></thead><tbody>");
        if (number == 0) locationRows.append("<tr><td colspan=\"4\" class=\"rp-empty\">담긴 항목이 없습니다.</td></tr>");
        html.append(locationRows).append("</tbody></table></div></section>\n");

        // sections -> cards
        number = 0;
        for (int s = 0; s < sections.size(); s++) {
            Map<String, Object> section = sections.get(s);
            String color = SECTION_COLORS[s % SECTION_COLORS.length];
            List<Object> rows = list(section.get("items"));
            html.append("<section class=\"rp-group\"><h2 style=\"border-left-color:").append(color).append("\">")
                    .append(esc(section.get("label"))).append(" <small>").append(rows.size()).append("건</small></h2>");
            for (Object raw : rows) {
                number++;
                Map<String, Object> item = map(raw);
                appendCard(html, item, number, authorColor(authorColors, map(item.get("author"))), photoCache);
            }
            html.append("</section>\n");
        }

        html.append("<footer class=\"rp-foot\">생성 ")
                .append(esc(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"))))
                .append(" · 보고서 #").append(esc(report.get("reportId"))).append("</footer>\n</main>\n")
                .append("<script>").append(MAP_SCRIPT).append("</script>\n</body>\n</html>\n");
        return html.toString();
    }

    private void appendCard(StringBuilder html, Map<String, Object> item, int number, String color, Map<String, String> photoCache) {
        Map<String, Object> author = map(item.get("author"));
        String title = Objects.toString(item.get("title"), "").trim();
        html.append("<article class=\"rp-card\" id=\"item-").append(number).append("\"><div class=\"rp-card-head\">")
                .append("<span class=\"rp-no\" style=\"border-color:").append(color).append("\">").append(number).append("</span><div>")
                .append("<h3>").append(esc(title.isEmpty() ? orDash(item.get("address")) : title)).append("</h3>")
                .append("<div class=\"rp-meta\">").append(esc(orDash(item.get("address"))))
                .append(" · ").append(esc(date(item.get("completedAt"))))
                .append(" · ").append(esc(author.get("name")));
        if (item.get("category") != null) html.append(" · ").append(esc(item.get("category")));
        html.append("</div></div></div>");
        StringBuilder photos = new StringBuilder();
        for (Object raw : list(item.get("photos"))) {
            Map<String, Object> photo = map(raw);
            String src = embed(Objects.toString(photo.get("url"), null), photoCache);
            if (src == null) continue;
            String slot = Objects.toString(photo.get("slot"), "");
            String caption = Objects.toString(photo.get("comment"), "").trim();
            photos.append("<figure><div class=\"rp-img\"><img src=\"").append(src).append("\" alt=\"")
                    .append(esc((slot + " " + caption).trim())).append("\">");
            if (!slot.isEmpty()) photos.append("<span class=\"rp-slot rp-slot-").append(slotClass(slot)).append("\">").append(esc(slot)).append("</span>");
            photos.append("</div>");
            if (!caption.isEmpty()) photos.append("<figcaption>").append(multiline(caption)).append("</figcaption>");
            photos.append("</figure>");
        }
        if (!photos.isEmpty()) html.append("<div class=\"rp-photos\">").append(photos).append("</div>");
        String comment = Objects.toString(item.get("comment"), "").trim();
        html.append("<div class=\"rp-label\">본문</div><p class=\"rp-text\">")
                .append(comment.isEmpty() ? "-" : multiline(comment)).append("</p>");
        String ai = Objects.toString(item.get("aiRefinedContent"), "").trim();
        if (!ai.isEmpty()) {
            html.append("<div class=\"rp-label\">AI 정리</div><p class=\"rp-text rp-ai\">").append(multiline(ai)).append("</p>");
        }
        html.append("</article>\n");
    }

    private static String authorColor(Map<String, String> colors, Map<String, Object> author) {
        String name = Objects.toString(author.get("name"), "-");
        return colors.computeIfAbsent(name, key -> AUTHOR_COLORS[colors.size() % AUTHOR_COLORS.length]);
    }

    private static String slotClass(String slot) {
        return switch (slot) {
            case "작업 전" -> "before";
            case "작업 중" -> "during";
            case "작업 후" -> "after";
            default -> "etc";
        };
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
            .rp{max-width:920px;margin:0 auto;padding:24px 16px 40px}
            .rp-head{background:#FFFFFF;border:1px solid #DCE7F5;border-radius:16px;padding:22px 20px;margin-bottom:16px;border-top:5px solid #2477F3}
            .rp-kicker{color:#607195;font-size:13px}
            .rp-head h1{margin:4px 0 6px;font-size:24px;line-height:1.3;word-break:keep-all}
            .rp-sub{color:#607195;font-size:13px}
            .rp-badge{display:inline-block;padding:1px 9px;border-radius:999px;background:#F8F2E7;color:#866320;font-size:12px;font-weight:600}
            .rp-badge.rp-final{background:#ECF5F2;color:#326F64}
            .rp-sec{background:#FFFFFF;border:1px solid #DCE7F5;border-radius:16px;padding:16px;margin-bottom:16px}
            .rp-map{display:none;width:100%;height:420px;border-radius:12px;border:1px solid #DCE7F5;overflow:hidden}
            .rp-legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin:10px 2px 0;font-size:12px;color:#607195}
            .rp-legend i{display:inline-block;width:12px;height:12px;border-radius:50%;background:#4F9588;border:3px solid #94A3B8;margin-right:5px;vertical-align:-1px}
            .rp-table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
            .rp-table th,.rp-table td{border:1px solid #DCE7F5;padding:7px 9px;text-align:left;vertical-align:top;word-break:break-all}
            .rp-table thead th{background:#E8F2FF;color:#1551A6;font-weight:600}
            .rp-num{text-align:center !important;width:56px;white-space:nowrap}
            .rp-empty{text-align:center !important;color:#93A1BA}
            .rp-pin{position:relative;width:30px;height:38px;cursor:pointer;filter:drop-shadow(0 2px 3px rgba(0,0,0,.3))}
            .rp-pin-body{position:absolute;left:1px;top:1px;width:28px;height:28px;border-radius:50% 50% 50% 0;border:4px solid #94A3B8;background:#4F9588;transform:rotate(-45deg);box-shadow:0 0 0 1px rgba(255,255,255,.95)}
            .rp-pin-n{position:absolute;left:0;top:7px;width:30px;text-align:center;color:#FFFFFF;font-size:11px;font-weight:800;line-height:14px}
            .rp-group h2{margin:22px 0 10px;padding:8px 12px;font-size:17px;background:#FFFFFF;border:1px solid #DCE7F5;border-left:6px solid #2477F3;border-radius:10px}
            .rp-group h2 small{color:#607195;font-weight:500;font-size:13px}
            .rp-card{background:#FFFFFF;border:1px solid #DCE7F5;border-radius:16px;padding:16px;margin-bottom:12px;break-inside:avoid;page-break-inside:avoid;scroll-margin-top:12px;transition:box-shadow .3s}
            .rp-card.rp-hit{box-shadow:0 0 0 3px #7A5BD6}
            .rp-card-head{display:flex;align-items:flex-start;gap:10px;margin-bottom:12px}
            .rp-card-head h3{margin:0;font-size:17px;line-height:1.35;word-break:keep-all}
            .rp-no{flex:none;width:30px;height:30px;border-radius:50%;background:#4F9588;border:3px solid #94A3B8;color:#FFFFFF;font-size:12px;font-weight:800;display:inline-flex;align-items:center;justify-content:center}
            .rp-meta{color:#607195;font-size:12px;margin-top:2px}
            .rp-photos{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
            .rp-photos figure{margin:0}
            .rp-img{position:relative;border-radius:10px;overflow:hidden;background:#D5E0EC;aspect-ratio:4/3}
            .rp-img img{display:block;width:100%;height:100%;object-fit:cover}
            .rp-slot{position:absolute;left:8px;top:8px;padding:1px 8px;border-radius:6px;color:#FFFFFF;font-size:11px;font-weight:700;background:#607195}
            .rp-slot-before{background:#E34D59}.rp-slot-during{background:#BE9446}.rp-slot-after{background:#4F9588}
            .rp-photos figcaption{font-size:13px;color:#10285B;padding:6px 2px 0;word-break:break-all}
            .rp-label{font-size:12px;font-weight:700;color:#1551A6;margin-top:12px}
            .rp-text{margin:2px 0 4px;word-break:break-all}
            .rp-ai{background:#F4F8FF;border-radius:8px;padding:8px 10px}
            .rp-foot{text-align:center;color:#93A1BA;font-size:12px;margin-top:8px}
            @media (max-width:520px){.rp-head h1{font-size:20px}.rp-map{height:300px}.rp-photos{grid-template-columns:repeat(2,1fr)}}
            @page{size:A4;margin:14mm}
            @media print{body{background:#FFFFFF;font-size:12px}.rp{max-width:none;padding:0}.rp-head,.rp-sec{border:none;border-radius:0;padding:0;margin-bottom:14px}.rp-head{border-top:4px solid #2477F3;padding-top:8px}.rp-map,.rp-legend{display:none !important}#report-fallback{display:block !important}.rp-group h2{break-after:avoid;page-break-after:avoid}.rp-table thead{display:table-header-group}.rp-table tr{break-inside:avoid;page-break-inside:avoid}.rp-card{border:1px solid #DCE7F5}.rp-foot{display:none}}
            """;

    private static final String MAP_SCRIPT = """
            (function(){var el=document.getElementById('report-map');if(!el)return;var data=[];
            try{data=JSON.parse(document.getElementById('report-markers').textContent||'[]');}catch(e){data=[];}
            var key=window.REPORT_KAKAO_KEY;if(!key||!data.length)return;
            var fallback=document.getElementById('report-fallback');
            function fail(){el.style.display='none';if(fallback)fallback.style.display='';}
            el.style.display='block';var s=document.createElement('script');
            s.src='https://dapi.kakao.com/v2/maps/sdk.js?appkey='+encodeURIComponent(key)+'&autoload=false';
            s.onerror=fail;
            s.onload=function(){if(!window.kakao||!kakao.maps){fail();return;}kakao.maps.load(function(){
            if(fallback)fallback.style.display='none';
            var map=new kakao.maps.Map(el,{center:new kakao.maps.LatLng(data[0].lat,data[0].lng),level:5});
            map.addControl(new kakao.maps.ZoomControl(),kakao.maps.ControlPosition.RIGHT);
            var bounds=new kakao.maps.LatLngBounds();
            data.forEach(function(m){var pos=new kakao.maps.LatLng(m.lat,m.lng);bounds.extend(pos);
            var pin=document.createElement('div');pin.className='rp-pin';pin.title=m.n+'. '+m.title;
            var body=document.createElement('div');body.className='rp-pin-body';body.style.borderColor=m.color;
            var n=document.createElement('span');n.className='rp-pin-n';n.textContent=String(m.n);
            pin.appendChild(body);pin.appendChild(n);
            pin.onclick=function(){var card=document.getElementById('item-'+m.n);if(!card)return;
            card.scrollIntoView({behavior:'smooth',block:'start'});card.classList.add('rp-hit');
            setTimeout(function(){card.classList.remove('rp-hit');},1600);};
            new kakao.maps.CustomOverlay({position:pos,content:pin,yAnchor:1,map:map});});
            if(data.length>1)map.setBounds(bounds);});};
            document.head.appendChild(s);})();
            """;
}
