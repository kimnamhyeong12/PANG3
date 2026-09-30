package com.fieldwork.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.zip.GZIPInputStream;
import org.locationtech.proj4j.CRSFactory;
import org.locationtech.proj4j.CoordinateReferenceSystem;
import org.locationtech.proj4j.CoordinateTransform;
import org.locationtech.proj4j.CoordinateTransformFactory;
import org.locationtech.proj4j.ProjCoordinate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** Reads the locally prepared 부산 building-group entrances without exposing the source archive to the app. */
@Service
public class BusanEntranceService {
    private static final Logger log = LoggerFactory.getLogger(BusanEntranceService.class);
    private static final String DATA_FILE = "busan-entrances.jsonl.gz";
    private final List<Site> sites;
    private final CoordinateTransform toProjected;
    private final CoordinateTransform toWgs84;

    public BusanEntranceService(ObjectMapper mapper) {
        CRSFactory factory = new CRSFactory();
        CoordinateReferenceSystem projected = factory.createFromParameters("EPSG:5179",
                "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 " +
                        "+x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs");
        CoordinateReferenceSystem wgs84 = factory.createFromParameters("EPSG:4326",
                "+proj=longlat +datum=WGS84 +no_defs");
        CoordinateTransformFactory transforms = new CoordinateTransformFactory();
        toProjected = transforms.createTransform(wgs84, projected);
        toWgs84 = transforms.createTransform(projected, wgs84);
        sites = load(mapper);
    }

    public record Entrance(double latitude, double longitude) {}

    public Optional<Entrance> find(double latitude, double longitude) {
        if (sites.isEmpty() || !Double.isFinite(latitude) || !Double.isFinite(longitude) ||
                latitude < 34 || latitude > 36 || longitude < 128 || longitude > 130) {
            return Optional.empty();
        }
        ProjCoordinate projected = new ProjCoordinate();
        toProjected.transform(new ProjCoordinate(longitude, latitude), projected);
        Site selected = null;
        double smallestArea = Double.POSITIVE_INFINITY;
        for (Site site : sites) {
            if (site.contains(projected.x, projected.y)) {
                double area = (site.maxX - site.minX) * (site.maxY - site.minY);
                if (area < smallestArea) {
                    selected = site;
                    smallestArea = area;
                }
            }
        }
        if (selected == null) return Optional.empty();
        double[] point = selected.nearestEntrance(projected.x, projected.y);
        ProjCoordinate wgs = new ProjCoordinate();
        toWgs84.transform(new ProjCoordinate(point[0], point[1]), wgs);
        return Optional.of(new Entrance(wgs.y, wgs.x));
    }

    private List<Site> load(ObjectMapper mapper) {
        Path source = dataPath();
        if (source == null) {
            log.warn("부산 출입구 자료가 없어 기존 방문지 좌표로 경로를 계산합니다.");
            return List.of();
        }
        List<Site> loaded = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                new GZIPInputStream(Files.newInputStream(source)), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                JsonNode data = mapper.readTree(line);
                List<double[]> rings = new ArrayList<>();
                double minX = Double.POSITIVE_INFINITY, minY = Double.POSITIVE_INFINITY;
                double maxX = Double.NEGATIVE_INFINITY, maxY = Double.NEGATIVE_INFINITY;
                for (JsonNode ring : data.path("rings")) {
                    double[] coordinates = new double[ring.size() * 2];
                    for (int i = 0; i < ring.size(); i++) {
                        double x = ring.get(i).get(0).asDouble();
                        double y = ring.get(i).get(1).asDouble();
                        coordinates[i * 2] = x;
                        coordinates[i * 2 + 1] = y;
                        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
                        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
                    }
                    if (ring.size() >= 4) rings.add(coordinates);
                }
                List<double[]> entrances = new ArrayList<>();
                for (JsonNode entrance : data.path("entrances")) {
                    entrances.add(new double[] { entrance.get(0).asDouble(), entrance.get(1).asDouble() });
                }
                if (!rings.isEmpty() && !entrances.isEmpty()) {
                    loaded.add(new Site(minX, minY, maxX, maxY, rings, entrances));
                }
            }
        } catch (IOException | RuntimeException error) {
            throw new IllegalStateException("부산 출입구 자료를 읽지 못했습니다.", error);
        }
        log.info("부산 출입구 건물군 {}개를 불러왔습니다.", loaded.size());
        return List.copyOf(loaded);
    }

    private Path dataPath() {
        String configured = System.getenv("BUSAN_ENTRANCE_DATA_PATH");
        if (configured != null && !configured.isBlank()) {
            Path path = Path.of(configured);
            if (!Files.isRegularFile(path)) {
                throw new IllegalStateException("설정한 부산 출입구 자료를 찾지 못했습니다.");
            }
            return path;
        }
        for (Path candidate : List.of(Path.of("data", DATA_FILE), Path.of("backend", "data", DATA_FILE))) {
            if (Files.isRegularFile(candidate)) return candidate;
        }
        return null;
    }

    private record Site(double minX, double minY, double maxX, double maxY,
                        List<double[]> rings, List<double[]> entrances) {
        boolean contains(double x, double y) {
            if (x < minX || x > maxX || y < minY || y > maxY) return false;
            boolean inside = false;
            for (double[] ring : rings) {
                int last = ring.length / 2 - 1;
                for (int i = 0; i < ring.length / 2; last = i++) {
                    double xi = ring[i * 2], yi = ring[i * 2 + 1];
                    double xj = ring[last * 2], yj = ring[last * 2 + 1];
                    if ((yi > y) != (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
                        inside = !inside;
                    }
                }
            }
            return inside;
        }

        double[] nearestEntrance(double x, double y) {
            double[] nearest = entrances.get(0);
            double distance = Double.POSITIVE_INFINITY;
            for (double[] candidate : entrances) {
                double dx = candidate[0] - x, dy = candidate[1] - y;
                double current = dx * dx + dy * dy;
                if (current < distance) {
                    nearest = candidate;
                    distance = current;
                }
            }
            return nearest;
        }
    }
}
