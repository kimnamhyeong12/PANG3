package com.fieldwork.service;
import com.fasterxml.jackson.databind.*;
import java.nio.file.*;
import java.util.*;
/** Reuses the exact production solver and evaluates both orders on each matrix. */
public class CompareRestSdkResults {
  static double evaluate(List<Integer> order,double[][] m){double s=0;int at=0;for(int next:order){s+=m[at][next];at=next;}return s;}
  public static void main(String[] args)throws Exception{
    var json=new ObjectMapper();Path p=Path.of(args[0]);var rest=json.readTree(p.resolve("rest.json").toFile());var sdk=json.readTree(p.resolve("sdk.json").toFile());var pts=json.readTree(p.resolve("points.json").toFile());
    List<Map<String,Object>> summaries=new ArrayList<>();
    for(int n:new int[]{5,10,20}){
      double[][] a=json.convertValue(rest.get("stages").get(n-1).get("matrix"),double[][].class),b=new double[n+1][n+1];
      for(var r:sdk.get("records")){int f=r.get("from").asInt(),t=r.get("to").asInt();if(f<=n&&t<=n)b[f][t]=r.get("seconds").asDouble();}
      for(int f=0;f<=n;f++)for(int t=1;t<=n;t++)if(f!=t&&b[f][t]<=0)throw new IllegalStateException("Missing SDK matrix");
      long tick=System.nanoTime();var ai=VisitOrderService.solve(a,n,false,-1);double ams=(System.nanoTime()-tick)/1e6;
      tick=System.nanoTime();var bi=VisitOrderService.solve(b,n,false,-1);double bms=(System.nanoTime()-tick)/1e6;
      List<Integer> ao=ai.stream().map(i->i+1).toList(),bo=bi.stream().map(i->i+1).toList();Map<String,Object> row=new LinkedHashMap<>();row.put("n",n);row.put("rest_order",ao);row.put("sdk_order",bo);row.put("same_order",ao.equals(bo));row.put("rest_solve_ms",ams);row.put("sdk_solve_ms",bms);
      row.put("rest_order_names",ao.stream().map(i->pts.get(i).get("name").asText()).toList());row.put("sdk_order_names",bo.stream().map(i->pts.get(i).get("name").asText()).toList());
      row.put("rest_order_rest_seconds",evaluate(ao,a));row.put("sdk_order_rest_seconds",evaluate(bo,a));row.put("rest_order_sdk_seconds",evaluate(ao,b));row.put("sdk_order_sdk_seconds",evaluate(bo,b));
      double totalDiff=0;int edges=0,changed=0;for(int f=0;f<=n;f++)for(int t=1;t<=n;t++)if(f!=t){edges++;totalDiff+=Math.abs(b[f][t]-a[f][t]);if(a[f][t]!=b[f][t])changed++;}
      row.put("edges",edges);row.put("changed_duration_edges",changed);row.put("mean_abs_duration_difference_seconds",totalDiff/edges);summaries.add(row);
    }
    json.writerWithDefaultPrettyPrinter().writeValue(p.resolve("comparison.json").toFile(),summaries);
    System.out.println(json.writerWithDefaultPrettyPrinter().writeValueAsString(summaries));
  }
}
