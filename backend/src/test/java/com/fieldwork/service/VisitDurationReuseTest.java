package com.fieldwork.service;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fieldwork.entity.VisitDurationSnapshot;
import com.fieldwork.repository.VisitDurationSnapshotRepository;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.mock.http.client.*;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.*;
import org.springframework.web.client.RestTemplate;

class VisitDurationReuseTest {
    @org.junit.jupiter.api.BeforeEach void trace(org.junit.jupiter.api.TestInfo info) { System.out.println("Reuse check: "+info.getDisplayName()); }
    static class Time extends Clock {
        long millis=Instant.parse("2026-10-26T02:00:00Z").toEpochMilli();
        public ZoneId getZone(){return ZoneOffset.UTC;}
        public Clock withZone(ZoneId zone){return Clock.fixed(instant(),zone);}
        public Instant instant(){return Instant.ofEpochMilli(millis);}
        public long millis(){return millis;}
        void advance(long seconds){millis+=seconds*1000;}
    }
    static Map<String,Object> point(int id){return Map.of("id",String.valueOf(id),"lat",35.0,"lng",129.0+id*.001);}
    static List<Map<String,Object>> visits(int n){List<Map<String,Object>> result=new ArrayList<>();for(int i=1;i<=n;i++)result.add(point(i));return result;}
    static class Fixture implements AutoCloseable {
        final VisitOrderService service;
        final AtomicInteger car=new AtomicInteger(),walk=new AtomicInteger();
        final List<String> queried=Collections.synchronizedList(new ArrayList<>());
        final List<String> endpoints=Collections.synchronizedList(new ArrayList<>());
        final AtomicBoolean failIncoming=new AtomicBoolean();
        final ObjectMapper json=new ObjectMapper();
        final MockRestServiceServer carServer,walkServer;
        Fixture(VisitDurationCache cache) {
            service=new VisitOrderService(cache);ReflectionTestUtils.setField(service,"key","synthetic");
            carServer=MockRestServiceServer.bindTo((RestTemplate)ReflectionTestUtils.getField(service,"client")).ignoreExpectOrder(true).build();
            Object walking=ReflectionTestUtils.getField(service,"walkingClient");
            walkServer=MockRestServiceServer.bindTo((RestTemplate)ReflectionTestUtils.getField(walking,"http")).ignoreExpectOrder(true).build();
            carServer.expect(ExpectedCount.manyTimes(),r->{}).andRespond(request->{
                car.incrementAndGet();String endpoint=request.getURI().getPath();endpoints.add(endpoint);
                boolean incoming=endpoint.contains("/origins/");
                var input=json.readTree(((MockClientHttpRequest)request).getBodyAsString());
                List<Map<String,Object>> routes=new ArrayList<>();
                int fixed=(int)Math.round((input.get(incoming?"destination":"origin").get("x").asDouble()-129)*1000);
                for(var variable:input.get(incoming?"origins":"destinations")) {
                    int other=(int)Math.round((variable.get("x").asDouble()-129)*1000);
                    int from=incoming?other:fixed,to=incoming?fixed:other;queried.add(from+">"+to);
                    routes.add(Map.of("key",variable.get("key").asText(),"result_code",0,"summary",Map.of("duration",100*from+to+1)));
                }
                if(incoming&&failIncoming.get())routes.clear();
                return response(Map.of("routes",routes));
            });
            walkServer.expect(ExpectedCount.manyTimes(),r->{}).andRespond(request->{
                walk.incrementAndGet();return VisitOrderServiceTest.walkingBatchResponse(request,(a,b)->100*a+b+1);
            });
        }
        ClientHttpResponse response(Object body)throws java.io.IOException {
            var response=new MockClientHttpResponse(json.writeValueAsBytes(body),HttpStatus.OK);
            response.getHeaders().setContentType(MediaType.APPLICATION_JSON);return response;
        }
        Map<String,Object> recommend(Map<String,Object> origin,List<Map<String,Object>> visits,String mode,boolean guide) {
            return service.recommend(origin,visits,null,null,mode,"synthetic",7L,"workspace",guide);
        }
        public void close(){if(car.get()>0)carServer.verify();if(walk.get()>0)walkServer.verify();service.stop();}
    }
    @Test void slowSequentialRegistrationKeepsAllOldDirectedLegs() {
        Time time=new Time();var cache=new VisitDurationCache(null,time);
        try(var f=new Fixture(cache)) {
            f.recommend(point(0),visits(1),"car",false);assertEquals(0,f.car.get());
            assertEquals("roadDuration",f.recommend(point(0),visits(2),"car",false).get("basis"));assertEquals(3,f.car.get());
            time.advance(601);
            f.recommend(point(0),visits(3),"car",false);assertEquals(5,f.car.get());
            time.advance(172800); // Crossing midnight during registration must not invalidate the snapshot.
            f.recommend(point(0),visits(4),"car",false);assertEquals(7,f.car.get());
            f.recommend(point(0),visits(5),"car",false);assertEquals(9,f.car.get());
            assertEquals(25,new HashSet<>(f.queried).size());assertEquals(25,f.queried.size());
            assertEquals(3,f.endpoints.stream().filter(p->p.contains("/origins/")).count());
            f.service.recommend(point(0),visits(5),null,"3","car","synthetic",7L,"workspace",false);
            assertEquals(9,f.car.get(),"manual first stop recalculates only the CPU order");
            for(int n=6;n<=20;n++) {
                f.recommend(point(0),visits(n),"car",false);
                if(n==10)assertEquals(19,f.car.get());
            }
            assertEquals(39,f.car.get());assertEquals(400,f.queried.size());
        }
    }
    @Test void completedStopAndUndoReuseLegsAndMovementQueriesOnlyTheOrigin() {
        try(var f=new Fixture(new VisitDurationCache())) {
            f.recommend(point(0),visits(5),"car",false);int before=f.car.get();
            f.recommend(point(1),visits(5).subList(1,5),"car",false);assertEquals(before,f.car.get());
            f.recommend(point(0),visits(5),"car",false);assertEquals(before,f.car.get(),"undo uses preserved directed times");
            int edges=f.queried.size();
            f.recommend(point(20),visits(5),"car",false);assertEquals(before+1,f.car.get());
            assertTrue(f.queried.subList(edges,f.queried.size()).stream().allMatch(p->p.startsWith("20>")));
            f.recommend(Map.of("lat",35.000001,"lng",129.02),visits(5),"car",false);assertEquals(before+1,f.car.get(),"GPS noise reuses the origin");
        }
    }
    @Test void newDayRefreshesOnlyAtGuidanceStartAndOnlyOnce() {
        Time time=new Time();
        try(var f=new Fixture(new VisitDurationCache(null,time))) {
            f.recommend(point(0),visits(3),"car",false);int before=f.car.get();
            f.recommend(point(0),visits(3),"car",true);assertEquals(before,f.car.get(),"today's registration times are already fresh");
            time.advance(86400);
            f.recommend(point(0),visits(3),"car",false);assertEquals(before,f.car.get(),"date alone does not fetch");
            f.recommend(point(0),visits(3),"car",true);assertEquals(before+4,f.car.get());
            f.recommend(point(0),visits(3),"car",true);assertEquals(before+4,f.car.get());
        }
    }
    @Test void modeUserAndWorkspaceAreIsolatedAndWalkingUsesBatches() {
        Time time=new Time();
        try(var f=new Fixture(new VisitDurationCache(null,time))) {
            f.recommend(point(0),visits(5),"car",false);int before=f.car.get();
            f.recommend(point(0),visits(5),"walk",false);int walking=f.walk.get();
            assertTrue(walking>0&&walking<=8,"25 walking legs are batched, not 25 calls");
            time.advance(601);
            f.recommend(point(0),visits(5),"walk",false);assertEquals(walking,f.walk.get());
            f.recommend(point(0),visits(5),"car",false);assertEquals(before,f.car.get());
            f.service.recommend(point(0),visits(2),null,null,"car","synthetic",8L,"workspace",false);
            assertEquals(before+3,f.car.get());
            f.service.recommend(point(0),visits(2),null,null,"car","synthetic",7L,"other",false);
            assertEquals(before+6,f.car.get());
        }
    }
    @Test void simultaneousChangedRequestsDoNotDuplicateProviderLegs() throws Exception {
        try(var f=new Fixture(new VisitDurationCache())) {
            ExecutorService callers=Executors.newFixedThreadPool(4);
            try {
                List<Future<?>> jobs=new ArrayList<>();for(int i=0;i<4;i++)jobs.add(callers.submit(()->f.recommend(point(0),visits(3),"car",false)));
                for(Future<?> job:jobs)job.get(10,TimeUnit.SECONDS);
                assertEquals(4,f.car.get());assertEquals(9,f.queried.size());
            } finally {callers.shutdownNow();}
        }
    }
    @Test void walkingSequentialRegistrationKeepsTheWholeMatrixWithSmallBatches() {
        Time time=new Time();
        try(var f=new Fixture(new VisitDurationCache(null,time))) {
            for(int n=1;n<=20;n++) {
                assertNotEquals("distance",f.recommend(point(0),visits(n),"walk",false).get("basis"));
                time.advance(601);
                if(n==5)assertEquals(7,f.walk.get());
                if(n==10)assertEquals(22,f.walk.get());
            }
            assertEquals(77,f.walk.get(),"all 400 directed times are preserved across slow registrations");
            f.recommend(point(0),visits(20),"walk",false);assertEquals(77,f.walk.get());
        }
    }
    @Test void incompleteBatchCannotPoisonAlreadyKnownTimes() {
        try(var f=new Fixture(new VisitDurationCache())) {
            f.recommend(point(0),visits(2),"car",false);int before=f.car.get();
            f.failIncoming.set(true);assertEquals("distance",f.recommend(point(0),visits(3),"car",false).get("basis"));
            f.failIncoming.set(false);int retry=f.car.get();
            assertEquals("roadDuration",f.recommend(point(0),visits(3),"car",false).get("basis"));
            assertEquals(retry+1,f.car.get(),"retry fetches only the failed incoming column");
            assertEquals(1,Collections.frequency(f.queried,"1>2"));assertTrue(f.car.get()>before);
        }
    }
    @Test void serializedSnapshotSurvivesNewServiceInstance() {
        Map<String,VisitDurationSnapshot> database=new ConcurrentHashMap<>();
        var repo=(VisitDurationSnapshotRepository)java.lang.reflect.Proxy.newProxyInstance(getClass().getClassLoader(),new Class<?>[]{VisitDurationSnapshotRepository.class},(proxy,method,args)->{
            return switch(method.getName()) {
                case "findById" -> Optional.ofNullable(database.get(args[0]));
                case "save" -> {var row=(VisitDurationSnapshot)args[0];database.put(row.id,row);yield row;}
                case "findByOwnerIdOrderByTouchedAtDesc" -> database.values().stream().filter(r->r.ownerId.equals(args[0])).toList();
                case "recentIds" -> database.values().stream().filter(r->r.ownerId.equals(args[0])).map(r->r.id).toList();
                case "touch" -> 1;
                default -> throw new UnsupportedOperationException(method.getName());
            };
        });
        Time time=new Time();
        try(var first=new Fixture(new VisitDurationCache(repo,time))) {first.recommend(point(0),visits(3),"car",false);assertEquals(4,first.car.get());}
        time.advance(86400*3);
        try(var restored=new Fixture(new VisitDurationCache(repo,time))) {
            assertEquals("roadDuration",restored.recommend(point(0),visits(3),"car",false).get("basis"));assertEquals(0,restored.car.get());
        }
        assertEquals(1,database.size());
    }
}
