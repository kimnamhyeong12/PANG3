package com.fieldwork.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Layout in image pixels: coordinates remain fixed; only crowded number labels move. */
public final class ReportMarkerLayout {
    public static final double RADIUS = 15;
    public record Point(int n, double x, double y) {}
    public record Label(Point point, double x, double y, boolean moved) {}

    public static List<Label> arrange(List<Point> input, int width, int height) {
        List<Point> points = input.stream().sorted(Comparator.comparingInt(Point::n)).toList();
        boolean[] crowded = new boolean[points.size()];
        for (int i = 0; i < points.size(); i++) for (int j = i + 1; j < points.size(); j++) {
            if (Math.abs(points.get(i).x - points.get(j).x) < 40
                    && Math.abs(points.get(i).y - points.get(j).y) < 50) crowded[i] = crowded[j] = true;
        }
        List<Label> labels = new ArrayList<>();
        for (int i = 0; i < points.size(); i++) if (!crowded[i]) {
            Point p = points.get(i);
            labels.add(new Label(p, p.x, p.y - 24, false));
        }
        for (int i = 0; i < points.size(); i++) if (crowded[i]) {
            Point p = points.get(i);
            double cx = 0, cy = 0; int count = 0;
            for (Point other : points) if (Math.hypot(other.x - p.x, other.y - p.y) < 100) {
                cx += other.x; cy += other.y; count++;
            }
            double direction = Math.hypot(p.x - cx / count, p.y - cy / count) < 0.1
                    ? -Math.PI / 2 + i * 2.399963229728653 : Math.atan2(p.y - cy / count, p.x - cx / count);
            Label best = null; double bestScore = Double.POSITIVE_INFINITY;
            int rings = (int) Math.ceil(Math.hypot(width, height) / 20);
            for (int ring = 0; ring < rings; ring++) {
                double radius = 48 + ring * 20;
                int steps = Math.max(24, (int) Math.ceil(2 * Math.PI * radius / 18));
                for (int step = 0; step < steps; step++) {
                    double angle = direction + 2 * Math.PI * step / steps;
                    double x = p.x + radius * Math.cos(angle), y = p.y + radius * Math.sin(angle);
                    if (x < 20 || x > width - 20 || y < 20 || y > height - 36) continue;
                    boolean blocked = false;
                    for (Point anchor : points) if (Math.hypot(x - anchor.x, y - anchor.y) < 25) { blocked = true; break; }
                    if (blocked) continue;
                    for (Label other : labels) {
                        double bottom = other.moved ? other.y + 18 : other.point.y + 4;
                        if (x > other.x - 38 && x < other.x + 38 && y > other.y - 38 && y < bottom + 20) {
                            blocked = true; break;
                        }
                    }
                    if (blocked) continue;
                    double score = radius + 10 * (1 - Math.cos(angle - direction));
                    for (Label other : labels) if (other.moved && crosses(p.x, p.y, x, y,
                            other.point.x, other.point.y, other.x, other.y)) score += 1000;
                    if (score < bestScore) { bestScore = score; best = new Label(p, x, y, true); }
                }
                if (best != null && bestScore < radius + 20) break;
            }
            // An image can contain more labels than fit. Keep every report represented.
            labels.add(best != null ? best : new Label(p, Math.max(20, Math.min(width - 20, p.x)),
                    Math.max(20, Math.min(height - 36, p.y - 48)), true));
        }
        labels.sort(Comparator.comparingInt(label -> label.point.n));
        return labels;
    }

    private static boolean crosses(double ax, double ay, double bx, double by, double cx, double cy, double dx, double dy) {
        double a = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        double b = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
        double c = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
        double d = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
        return a * b < 0 && c * d < 0;
    }
    private ReportMarkerLayout() {}
}
