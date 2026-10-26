package com.fieldwork.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.http.client.*;
import org.springframework.web.client.RestTemplate;

/** Real HTTP through the unchanged production missing-leg collector and solver. */
public class RestSdkLiveBenchmark {
  public static void main(String[] args) throws Exception {
    Path folder=Path.of(args[0]);var json=new ObjectMapper();
    List<Map<String,Object>> points=json.readValue(folder.resolve("points.json").toFile(),List.class);
    String key=Files.readAllLines(Path.of(args[1])).stream().filter(l->l.startsWith("KAKAO_REST_API_KEY="))
        .findFirst().orElseThrow().split("=",2)[1].trim().replaceAll("^[\"']|[\"']$","");
    var factory=new SimpleClientHttpRequestFactory();factory.setConnectTimeout(3000);factory.setReadTimeout(5000);
    var http=new RestTemplate(factory);List<Map<String,Object>> calls=Collections.synchronizedList(new ArrayList<>());
    http.setInterceptors(List.of(new ProviderQuotaInterceptor(),(request,body,execution)->{
      long tick=System.nanoTime();Map<String,Object> row=new LinkedHashMap<>();
      row.put("endpoint",request.getURI().getPath());
      try {var response=execution.execute(request,body);row.put("status",response.getStatusCode().value());return response;}
      finally {row.put("ms",(System.nanoTime()-tick)/1e6);calls.add(row);}
    }));
    var workers=Executors.newFixedThreadPool(4);var cache=new VisitDurationCache();
    var collector=new VisitDurationMatrix(http,new KakaoWalkingClient(),workers,cache);
    List<Map<String,Object>> stages=new ArrayList<>();Map<String,Object> report=new LinkedHashMap<>();report.put("engine","REST");report.put("stages",stages);report.put("calls",calls);
    try {
      for(int n=1;n<=20;n++) {
        int before=calls.size();long tick=System.nanoTime();Map<String,Object> stage=new LinkedHashMap<>();stage.put("n",n);
        if(n>1) {
          double[][] matrix=collector.collect(points.get(0),points.subList(1,n+1),null,"car",key,1L,"live-benchmark",false);
          long solveTick=System.nanoTime();List<Integer> order=VisitOrderService.solve(matrix,n,false,-1);
          stage.put("solve_ms",(System.nanoTime()-solveTick)/1e6);stage.put("matrix",matrix);
          stage.put("order",order.stream().map(i->i+1).toList());stage.put("seconds",VisitOrderService.cost(order,matrix,n,false));
        }
        stage.put("ms",(System.nanoTime()-tick)/1e6);stage.put("new_calls",calls.size()-before);stage.put("cumulative_calls",calls.size());stages.add(stage);
        json.writerWithDefaultPrettyPrinter().writeValue(folder.resolve("rest.json").toFile(),report);
        System.out.println("REST n="+n+" new="+stage.get("new_calls")+" total="+calls.size()+" ms="+stage.get("ms"));
      }
      for(int n:new int[]{5,10,20}) {
        int before=calls.size();long tick=System.nanoTime();collector.collect(points.get(0),points.subList(1,n+1),null,"car",key,1L,"live-benchmark",false);
        System.out.println("REST repeat n="+n+" calls="+(calls.size()-before)+" ms="+(System.nanoTime()-tick)/1e6);
      }
    } catch(Throwable e) {report.put("error",e.getClass().getSimpleName());json.writerWithDefaultPrettyPrinter().writeValue(folder.resolve("rest.json").toFile(),report);throw new IllegalStateException("Benchmark stopped; see sanitized report",null);}
    finally{workers.shutdownNow();}
  }
}
