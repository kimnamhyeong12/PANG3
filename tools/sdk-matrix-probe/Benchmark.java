package com.pang3.dasunprobe;

import android.os.Bundle;
import java.lang.reflect.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.json.*;

/** Bounded four-request SDK benchmark with a directed scalar cache. */
public class Benchmark extends Probe {
  String input;Object startTemplate,goalTemplate;AtomicInteger requests=new AtomicInteger();
  Map<String,JSONObject> cache=new LinkedHashMap<>();JSONArray records=new JSONArray(),stages=new JSONArray();
  public void onCreate(Bundle args){input=args.getString("points");super.onCreate(args);}
  Object point(JSONObject p) throws Exception {
    Object xy=call(sdk,"convertWGS84ToKATEC",p.getDouble("lng"),p.getDouble("lat"));
    int x=(int)Math.round(((Number)call(xy,"getX")).doubleValue()),y=(int)Math.round(((Number)call(xy,"getY")).doubleValue());
    for(Constructor<?> c:goalTemplate.getClass().getConstructors())if(c.getParameterCount()==8)
      return c.newInstance(p.getString("name"),x,y,"",null,call(goalTemplate,"getRpFlag"),null,call(goalTemplate,"getLinkFilterType"));
    throw new Exception("KNPOI constructor unavailable");
  }
  JSONObject route(JSONArray points,int a,int b) throws Exception {
    JSONObject row=new JSONObject();row.put("from",a);row.put("to",b);long tick=System.nanoTime();
    Object from=point(points.getJSONObject(a)),goal=point(points.getJSONObject(b));
    CountDownLatch done=new CountDownLatch(1);String[] failure=new String[1];
    Object callback=fn(2,args->{
      if(args[0]!=null||args[1]==null){failure[0]="makeTrip error "+args[0];done.countDown();return;}
      Object trip=args[1];Object routeCallback=fn(2,result->{
        try{
          if(result[0]!=null||result[1]==null||((List<?>)result[1]).isEmpty()){failure[0]="route error "+result[0];return;}
          Object r=((List<?>)result[1]).get(0);List<?> path=(List<?>)call(r,"routePolylineWGS84");
          row.put("seconds",call(r,"getTotalTime"));row.put("meters",call(r,"getTotalDist"));
          row.put("arrival",new JSONObject((Map<?,?>)path.get(path.size()-1)));
          row.put("departure",new JSONObject((Map<?,?>)path.get(0)));
        }catch(Exception e){failure[0]=e.toString();}finally{done.countDown();}
      });
      Class<?> priority=Class.forName("com.kakaomobility.knsdk.KNRoutePriority",true,loader);
      call(trip,"routeWithPriority",priority.getField("KNRoutePriority_Time").get(null),0,routeCallback);
    });
    runOnMainSync(()->{try{requests.incrementAndGet();call(sdk,"makeTripWithStart",from,goal,null,null,callback);}catch(Exception e){failure[0]=e.toString();done.countDown();}});
    if(!done.await(45,TimeUnit.SECONDS))failure[0]="timeout";
    row.put("ms",(System.nanoTime()-tick)/1e6);
    if(failure[0]!=null)row.put("error",failure[0]);return row;
  }
  public void onStart(){
    ExecutorService pool=Executors.newFixedThreadPool(4);Bundle output=new Bundle();
    try{
      JSONArray points=new JSONArray(new String(android.util.Base64.decode(input,0),java.nio.charset.StandardCharsets.UTF_8));
      loader=getTargetContext().getClassLoader();unit=Class.forName("kotlin.Unit",true,loader).getField("INSTANCE").get(null);
      engine=Class.forName("expo.modules.kakaonavigation.KakaoRouteEngine",true,loader).getField("INSTANCE").get(null);
      sdk=Class.forName("com.kakaomobility.knsdk.KNSDK",true,loader).getField("INSTANCE").get(null);
      JSONObject origin=points.getJSONObject(0),first=points.getJSONObject(1);Map<String,Object> req=new HashMap<>();
      req.put("name",first.getString("name"));req.put("lat",first.getDouble("lat"));req.put("lng",first.getDouble("lng"));
      req.put("startLat",origin.getDouble("lat"));req.put("startLng",origin.getDouble("lng"));req.put("routePriority","TIME");
      CountDownLatch init=new CountDownLatch(1);Object[] prepared=new Object[1];String[] error=new String[1];long warmTick=System.nanoTime();
      call(engine,"preview",getTargetContext(),req,fn(1,a->{Map<?,?> m=(Map<?,?>)a[0];prepared[0]=call(engine,"get",m.get("sdkPreviewId"));call(engine,"discard",m.get("sdkPreviewId"));init.countDown();}),fn(1,a->{error[0]=String.valueOf(a[0]);init.countDown();}));
      if(!init.await(60,TimeUnit.SECONDS)||prepared[0]==null)throw new Exception("warmup failed "+error[0]);
      output.putDouble("warmup_ms",(System.nanoTime()-warmTick)/1e6);output.putInt("warmup_routes",1);
      Object trip=call(prepared[0],"getTrip");goalTemplate=call(trip,"getGoal");
      for(int n=1;n<=20;n++){
        int before=requests.get();long tick=System.nanoTime();List<int[]> missing=new ArrayList<>();
        if(n>1)for(int a=0;a<=n;a++)for(int b=1;b<=n;b++)if(a!=b&&!cache.containsKey(a+">"+b))missing.add(new int[]{a,b});
        // Submit in windows of four, avoiding an unbounded queue of requests.
        for(int offset=0;offset<missing.size();offset+=4){
          List<Future<JSONObject>> pending=new ArrayList<>();
          for(int i=offset;i<Math.min(offset+4,missing.size());i++){int[] edge=missing.get(i);pending.add(pool.submit(()->route(points,edge[0],edge[1])));}
          for(Future<JSONObject> task:pending){JSONObject row=task.get();records.put(row);Bundle s=new Bundle();s.putString("edge",row.toString());sendStatus(0,s);if(row.has("error"))throw new Exception("SDK edge failed "+row.getString("error"));cache.put(row.getInt("from")+">"+row.getInt("to"),row);}
        }
        JSONObject stage=new JSONObject();stage.put("n",n);stage.put("ms",(System.nanoTime()-tick)/1e6);stage.put("new_calls",requests.get()-before);stage.put("cumulative_calls",requests.get());stages.put(stage);
        Bundle s=new Bundle();s.putString("stage",stage.toString());sendStatus(0,s);
      }
      // Revisiting the same lists finds no missing directed edges; no SDK call is made.
      output.putString("stages",stages.toString());output.putString("records",records.toString());output.putInt("recommendation_requests",requests.get());finish(-1,output);
    }catch(Throwable e){output.putString("failure",android.util.Log.getStackTraceString(e));output.putString("stages",stages.toString());output.putString("records",records.toString());finish(0,output);}
    finally{pool.shutdownNow();}
  }
}
