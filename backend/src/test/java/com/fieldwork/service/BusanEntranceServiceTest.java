package com.fieldwork.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.zip.GZIPInputStream;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.proj4j.CRSFactory;
import org.locationtech.proj4j.CoordinateTransform;
import org.locationtech.proj4j.CoordinateTransformFactory;
import org.locationtech.proj4j.ProjCoordinate;

public class BusanEntranceServiceTest {
    private static final String RESOURCE = "busan-entrances.jsonl.gz";

    public static void main(String[] args) throws Exception {
        Path resource = Path.of("data", RESOURCE);
        if (!Files.isRegularFile(resource)) return;
        ObjectMapper mapper = new ObjectMapper();
        BusanEntranceService service = new BusanEntranceService(mapper);
        new BusanEntranceServiceTest().assertGroupMatchesPreparedEntrance(service, mapper, resource, "5830");
        new BusanEntranceServiceTest().assertGroupMatchesPreparedEntrance(service, mapper, resource, "4137");
        if (service.find(37.5, 127.0).isPresent()) throw new AssertionError("Non-Busan location matched");
    }

    private void assertGroupMatchesPreparedEntrance(BusanEntranceService service, ObjectMapper mapper,
                                                     Path resource, String group) throws Exception {
        JsonNode site = null;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                new GZIPInputStream(Files.newInputStream(resource)), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                JsonNode candidate = mapper.readTree(line);
                if ("26380".equals(candidate.path("sig").asText()) && group.equals(candidate.path("group").asText())) {
                    site = candidate;
                    break;
                }
            }
        }
        if (site == null) throw new AssertionError("Prepared target group missing: " + group);
        JsonNode ring = site.path("rings").get(0);
        Coordinate[] boundary = new Coordinate[ring.size()];
        for (int i = 0; i < ring.size(); i++) {
            boundary[i] = new Coordinate(ring.get(i).get(0).asDouble(), ring.get(i).get(1).asDouble());
        }
        Coordinate interior = new GeometryFactory().createPolygon(boundary).getInteriorPoint().getCoordinate();
        CoordinateTransform toWgs84 = toWgs84();
        ProjCoordinate marker = new ProjCoordinate();
        toWgs84.transform(new ProjCoordinate(interior.x, interior.y), marker);
        BusanEntranceService.Entrance found = service.find(marker.y, marker.x).orElseThrow();

        JsonNode entrance = site.path("entrances").get(0);
        ProjCoordinate expected = new ProjCoordinate();
        toWgs84.transform(new ProjCoordinate(entrance.get(0).asDouble(), entrance.get(1).asDouble()), expected);
        if (Math.abs(expected.y - found.latitude()) >= 0.000001 ||
                Math.abs(expected.x - found.longitude()) >= 0.000001) {
            throw new AssertionError("Prepared entrance mismatch: " + group);
        }

        RouteService routes = new RouteService();
        Field dataField = RouteService.class.getDeclaredField("busanEntranceService");
        dataField.setAccessible(true);
        dataField.set(routes, service);
        Method makePoints = RouteService.class.getDeclaredMethod("makeRoutePoints", Map.class, List.class);
        makePoints.setAccessible(true);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> points = (List<Map<String, Object>>) makePoints.invoke(routes, null,
                List.of(Map.of("lat", marker.y, "lng", marker.x)));
        Map<String, Object> endpoint = points.get(0);
        if (!endpoint.containsKey("markerLatitude") ||
                Math.abs(((Number) endpoint.get("lat")).doubleValue() - expected.y) >= 0.000001) {
            throw new AssertionError("Route did not use the prepared entrance: " + group);
        }
        Method makeSegment = RouteService.class.getDeclaredMethod("makeSegment", int.class, Map.class,
                Map.class, List.class, String.class);
        makeSegment.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, Object> segment = (Map<String, Object>) makeSegment.invoke(routes, 0,
                Map.of("lat", marker.y, "lng", marker.x), endpoint,
                List.of(Map.of("latitude", found.latitude(), "longitude", found.longitude())), "car");
        @SuppressWarnings("unchecked")
        List<Map<String, Double>> connector = (List<Map<String, Double>>) segment.get("connectorPath");
        if (connector == null || connector.size() != 2 ||
                Math.abs(connector.get(1).get("latitude") - marker.y) >= 0.000001) {
            throw new AssertionError("Dashed connector was not returned: " + group);
        }
    }

    private CoordinateTransform toWgs84() {
        CRSFactory factory = new CRSFactory();
        return new CoordinateTransformFactory().createTransform(
                factory.createFromParameters("EPSG:5179", "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 " +
                        "+x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs"),
                factory.createFromParameters("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs"));
    }
}
