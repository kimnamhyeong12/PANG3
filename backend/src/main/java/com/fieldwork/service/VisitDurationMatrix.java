package com.fieldwork.service;

import java.util.*;
import java.util.concurrent.*;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.web.client.*;

/** Collect only missing directed legs. The order solver never calls an API. */
final class VisitDurationMatrix {
    private record Edge(int from, int to, String key) {}
    private final RestTemplate http;
    private final KakaoWalkingClient walking;
    private final ExecutorService workers;
    private final VisitDurationCache cache;
    VisitDurationMatrix(RestTemplate http, KakaoWalkingClient walking, ExecutorService workers, VisitDurationCache cache) {
        this.http=http; this.walking=walking; this.workers=workers; this.cache=cache;
    }
    double[][] collect(Map<String,Object> start, List<Map<String,Object>> visits, Map<String,Object> home,
            String mode, String providerKey, Long owner, String scope, boolean guidanceStart) {
        return cache.use(owner,scope,mode,providerKey,snapshot -> {
            String today=cache.day();
            // Midnight alone does nothing; an actual guidance start requests freshness.
            if (guidanceStart) cache.beginGuidance(snapshot,mode);
            Map<String,Object> origin=start;
            if (snapshot.origin!=null && VisitOrderService.distance(start,snapshot.origin)<("car".equals(mode)?30:10))
                origin=snapshot.origin;
            if(snapshot.origin==null || !VisitDurationCache.coordinate(snapshot.origin).equals(VisitDurationCache.coordinate(origin)))snapshot.dirty=true;
            snapshot.origin=Map.of("lat",origin.get("lat"),"lng",origin.get("lng"));
            List<Map<String,Object>> points=new ArrayList<>();points.add(origin);points.addAll(visits);if(home!=null)points.add(home);
            LinkedHashMap<String,Edge> required=new LinkedHashMap<>();
            for(int a=0;a<=visits.size();a++)for(int b=1;b<points.size();b++) {
                if(VisitOrderService.distance(points.get(a),points.get(b))<1)continue;
                String key=VisitDurationCache.legKey(points.get(a),points.get(b));
                required.putIfAbsent(key,new Edge(a,b,key));
            }
            List<Edge> missing=required.values().stream().filter(e -> snapshot.get(e.key)==null).toList();
            long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(25);
            List<Callable<Void>> jobs="walk".equals(mode)?walkingJobs(missing,points,providerKey,snapshot,deadline)
                    :carJobs(missing,points,providerKey,snapshot,deadline);
            List<Future<Void>> futures=new ArrayList<>();
            try {
                // Bound queued batches too: four callers must not enqueue hundreds of jobs each.
                var completion=new ExecutorCompletionService<Void>(workers);
                int submitted=0;
                ExecutionException failure=null;
                while(submitted<Math.min(4,jobs.size()))futures.add(completion.submit(jobs.get(submitted++)));
                for(int finished=0;finished<submitted;finished++) {
                    Future<Void> next=completion.poll(Math.max(1,deadline-System.nanoTime()),TimeUnit.NANOSECONDS);
                    if(next==null)throw new IllegalStateException("Duration lookup timed out");
                    try { next.get(); } catch(ExecutionException error) {if(failure==null)failure=error;}
                    // Finish batches already sent, preserving their valid results, but don't fan out after a failure.
                    if(failure==null && submitted<jobs.size())futures.add(completion.submit(jobs.get(submitted++)));
                }
                if(failure!=null)throw failure;
                double[][] result=new double[points.size()][points.size()];
                for(int a=0;a<=visits.size();a++)for(int b=1;b<points.size();b++) {
                    if(VisitOrderService.distance(points.get(a),points.get(b))<1)continue;
                    Double seconds=snapshot.get(VisitDurationCache.legKey(points.get(a),points.get(b)));
                    if(seconds==null)throw new IllegalStateException("Missing duration");
                    result[a][b]=seconds;
                }
                if(guidanceStart && "car".equals(mode) && !today.equals(snapshot.lastGuidanceDay)) {snapshot.lastGuidanceDay=today;snapshot.dirty=true;}
                return result;
            } catch(InterruptedException error) { Thread.currentThread().interrupt();throw new IllegalStateException("Recommendation interrupted",error); }
            catch(ExecutionException error) {
                if(error.getCause() instanceof Error fatal)throw fatal;
                throw new IllegalStateException("Duration lookup failed",error.getCause());
            } finally {
                futures.forEach(future->{if(!future.isDone())future.cancel(true);});
                // Keep active legs at the tail so capacity eviction removes completed/old origins first.
                synchronized(snapshot) {
                    for(String key:required.keySet()) {
                        var leg=snapshot.legs.remove(key);if(leg!=null)snapshot.legs.put(key,leg);
                    }
                }
            }
        });
    }
    private List<Callable<Void>> carJobs(List<Edge> missing,List<Map<String,Object>> points,String key,
            VisitDurationCache.Snapshot snapshot,long deadline) {
        List<Callable<Void>> jobs=new ArrayList<>();List<Edge> left=new ArrayList<>(missing);
        while(!left.isEmpty()) {
            Map<Integer,List<Edge>> rows=new LinkedHashMap<>(),columns=new LinkedHashMap<>();
            for(Edge edge:left) {rows.computeIfAbsent(edge.from,i->new ArrayList<>()).add(edge);columns.computeIfAbsent(edge.to,i->new ArrayList<>()).add(edge);}
            List<Edge> best=rows.values().stream().max(Comparator.comparingInt(List::size)).orElseThrow();boolean column=false;
            if(snapshot.originsSupported)for(List<Edge> candidate:columns.values())if(candidate.size()>best.size()) {best=candidate;column=true;}
            List<Edge> batch=List.copyOf(best);boolean incoming=column;
            jobs.add(()->{
                try { carBatch(batch,incoming,points,key,snapshot,deadline); }
                catch(HttpClientErrorException error) {
                    int status=error.getStatusCode().value();
                    if(!incoming || !(status==403 || status==404 || status==405))throw error;
                    snapshot.originsSupported=false;
                    snapshot.dirty=true;
                    // A key without the multi-origin entitlement can still reuse all known legs.
                    for(Edge edge:batch)carBatch(List.of(edge),false,points,key,snapshot,deadline);
                }
                return null;
            });
            left.removeAll(batch);
        }
        return jobs;
    }
    private void carBatch(List<Edge> batch,boolean incoming,List<Map<String,Object>> points,String key,
            VisitDurationCache.Snapshot snapshot,long deadline) {
        checkDeadline(deadline);
        List<Map<String,Object>> many=new ArrayList<>();
        for(Edge edge:batch) {
            int index=incoming?edge.from:edge.to;var point=points.get(index);
            var anchor=points.get(incoming?edge.to:edge.from);
            if(VisitOrderService.distance(point,anchor)>10000)throw new IllegalStateException("Outside matrix radius");
            many.add(Map.of("x",point.get("lng"),"y",point.get("lat"),"key",String.valueOf(index)));
        }
        var anchor=points.get(incoming?batch.get(0).to:batch.get(0).from);
        Map<String,Object> request=Map.of(incoming?"origins":"destinations",many,incoming?"destination":"origin",
                Map.of("x",anchor.get("lng"),"y",anchor.get("lat")),"radius",10000,"priority","TIME");
        HttpHeaders headers=new HttpHeaders();headers.setContentType(MediaType.APPLICATION_JSON);headers.set("Authorization","KakaoAK "+key);
        Map<String,Object> body=http.exchange("https://apis-navi.kakaomobility.com/v1/"+(incoming?"origins":"destinations")+"/directions",
                HttpMethod.POST,new HttpEntity<>(request,headers),new ParameterizedTypeReference<Map<String,Object>>(){}).getBody();
        if(body==null || !(body.get("routes") instanceof List<?> routes))throw new IllegalStateException("Missing routes");
        Map<String,Double> values=new HashMap<>();
        for(Object raw:routes) {
            if(!(raw instanceof Map<?,?> route) || !(route.get("result_code") instanceof Number code) || code.intValue()!=0)continue;
            if(!(route.get("summary") instanceof Map<?,?> summary) || !(summary.get("duration") instanceof Number seconds))continue;
            if(!Double.isFinite(seconds.doubleValue()) || seconds.doubleValue()<0)continue;
            values.put(String.valueOf(route.get("key")),seconds.doubleValue());
        }
        for(Edge edge:batch)if(!values.containsKey(String.valueOf(incoming?edge.from:edge.to)))throw new IllegalStateException("Incomplete duration batch");
        checkDeadline(deadline);
        for(Edge edge:batch)snapshot.put(edge.key,values.get(String.valueOf(incoming?edge.from:edge.to)),cache.now());
    }
    private List<Callable<Void>> walkingJobs(List<Edge> missing,List<Map<String,Object>> points,String key,
            VisitDurationCache.Snapshot snapshot,long deadline) {
        List<Callable<Void>> jobs=new ArrayList<>();List<Edge> left=new ArrayList<>(missing);
        while(!left.isEmpty()) {
            Map<String,Integer> outgoing=new LinkedHashMap<>(),incoming=new HashMap<>();
            for(Edge edge:left) {
                outgoing.merge(VisitDurationCache.coordinate(points.get(edge.from)),1,Integer::sum);
                incoming.merge(VisitDurationCache.coordinate(points.get(edge.to)),1,Integer::sum);
            }
            String at=outgoing.keySet().stream().max(Comparator.comparingInt(p -> outgoing.get(p)-incoming.getOrDefault(p,0))).orElseThrow();
            List<Edge> trail=new ArrayList<>();
            while(true) {
                final String from=at;
                Edge next=left.stream().filter(e->VisitDurationCache.coordinate(points.get(e.from)).equals(from)).findFirst().orElse(null);
                if(next==null)break;
                left.remove(next);trail.add(next);at=VisitDurationCache.coordinate(points.get(next.to));
            }
            for(int offset=0;offset<trail.size();) {
                int end=Math.min(offset+6,trail.size());
                // Same start/end may be rejected even when the intermediate points differ.
                while(end>offset+1 && VisitDurationCache.coordinate(points.get(trail.get(offset).from))
                        .equals(VisitDurationCache.coordinate(points.get(trail.get(end-1).to))))end--;
                List<Edge> batch=List.copyOf(trail.subList(offset,end));offset=end;
                jobs.add(()->{
                    checkDeadline(deadline);
                    List<Map<String,Object>> path=new ArrayList<>();path.add(points.get(batch.get(0).from));
                    for(Edge edge:batch)path.add(points.get(edge.to));
                    List<Double> times=walking.durations(path,key);checkDeadline(deadline);
                    for(int i=0;i<batch.size();i++)snapshot.put(batch.get(i).key,times.get(i),cache.now());
                    return null;
                });
            }
        }
        return jobs;
    }
    private static void checkDeadline(long deadline) {
        if(Thread.currentThread().isInterrupted() || System.nanoTime()>deadline)throw new IllegalStateException("Duration lookup timed out");
    }
}
