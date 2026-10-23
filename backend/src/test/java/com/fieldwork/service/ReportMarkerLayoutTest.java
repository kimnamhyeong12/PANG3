package com.fieldwork.service;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import javax.imageio.ImageIO;
import static org.junit.jupiter.api.Assertions.*;

class ReportMarkerLayoutTest {
    @org.junit.jupiter.api.Test void collisionCases() throws Exception { main(new String[0]); }

    private static void check(List<ReportMarkerLayout.Point> points) {
        var labels = ReportMarkerLayout.arrange(points, 960, 560);
        assertEquals(points.size(), labels.size());
        for (var label : labels) {
            assertTrue(points.contains(label.point()), "Actual coordinate must never move");
            if (label.moved()) {
                assertTrue(label.x() >= 20 && label.x() <= 940);
                assertTrue(label.y() >= 20 && label.y() <= 524);
            }
            for (var other : labels) if (label.point().n() != other.point().n()) {
                assertTrue(Math.hypot(label.x() - other.x(), label.y() - other.y()) >= 36,
                        "Number circles must remain separate");
            }
        }
        var reversed = new ArrayList<>(points); Collections.reverse(reversed);
        assertEquals(labels, ReportMarkerLayout.arrange(reversed, 960, 560), "Stable report numbers determine layout");
    }

    public static void main(String[] args) throws Exception {
        check(List.of(new ReportMarkerLayout.Point(1, 300, 300)));
        var far = List.of(new ReportMarkerLayout.Point(1, 100, 100), new ReportMarkerLayout.Point(2, 800, 450));
        check(far);
        assertTrue(ReportMarkerLayout.arrange(far, 960, 560).stream().noneMatch(ReportMarkerLayout.Label::moved));
        var close = List.of(new ReportMarkerLayout.Point(1, 462, 282), new ReportMarkerLayout.Point(2, 464, 310),
                new ReportMarkerLayout.Point(3, 480, 288), new ReportMarkerLayout.Point(4, 740, 180));
        check(close);
        assertEquals(3, ReportMarkerLayout.arrange(close, 960, 560).stream().filter(ReportMarkerLayout.Label::moved).count());
        for (double[] corner : new double[][]{{22, 46}, {938, 46}, {22, 522}, {938, 522}, {480, 280}}) {
            var duplicates = new ArrayList<ReportMarkerLayout.Point>();
            for (int i = 1; i <= 12; i++) duplicates.add(new ReportMarkerLayout.Point(i, corner[0], corner[1]));
            check(duplicates);
        }
        assertTrue(ReportMarkerLayout.arrange(List.of(), 960, 560).isEmpty());
        // Render the real production drawing code without network tile requests.
        var image = new BufferedImage(960, 560, BufferedImage.TYPE_INT_RGB);
        var g = image.createGraphics();
        g.setColor(new Color(0xF3F6F2)); g.fillRect(0, 0, 960, 560);
        g.setColor(Color.WHITE); g.setStroke(new java.awt.BasicStroke(24));
        for (int x = 80; x < 960; x += 160) g.drawLine(x, 0, x + 100, 560);
        for (int y = 80; y < 560; y += 130) g.drawLine(0, y, 960, y + 30);
        var markers = new LinkedHashMap<Integer, StaticMapService.Marker>();
        for (var p : close) markers.put(p.n(), new StaticMapService.Marker(p.n(), 35, 129, "#2477F3"));
        StaticMapService.drawMarkers(g, ReportMarkerLayout.arrange(close, 960, 560), markers);
        g.dispose();
        Path preview = Path.of("target/location-map-preview.png");
        Files.createDirectories(preview.getParent()); ImageIO.write(image, "png", preview.toFile());
        System.out.println("Marker layout passed: isolated, nearby, identical coordinates, boundaries, numbering; preview: " + preview);
    }
}
