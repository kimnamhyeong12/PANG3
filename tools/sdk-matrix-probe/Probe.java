package com.pang3.dasunprobe;

import android.app.Instrumentation;
import android.os.Bundle;
import org.json.*;
import java.lang.reflect.*;
import java.util.*;
import java.util.concurrent.*;

/** Isolated instrumentation: calls public SDK APIs in the existing signed host. */
public class Probe extends Instrumentation {
  ClassLoader loader; Object unit; Object engine; Object sdk;
  interface Callback { void call(Object[] args) throws Exception; }
  Object fn(int arity, Callback callback) throws Exception {
    Class<?> type=Class.forName("kotlin.jvm.functions.Function"+arity,true,loader);
    return Proxy.newProxyInstance(loader,new Class[]{type},(p,m,a)->{
      if(m.getName().equals("invoke")){callback.call(a);return unit;}
      if(m.getName().equals("toString"))return "DasunProbeCallback";
      if(m.getName().equals("hashCode"))return System.identityHashCode(p);
      if(m.getName().equals("equals"))return p==a[0];
      return null;
    });
  }
  static Object call(Object obj,String name,Object... args) throws Exception {
    for(Method m:obj.getClass().getMethods())if(m.getName().equals(name)&&m.getParameterCount()==args.length)return m.invoke(obj,args);
    throw new NoSuchMethodException(name);
  }
  public void onCreate(Bundle args){super.onCreate(args);start();}
  public void onStart(){
    Bundle output=new Bundle();
    try{
      loader=getTargetContext().getClassLoader();
      unit=Class.forName("kotlin.Unit",true,loader).getField("INSTANCE").get(null);
      engine=Class.forName("expo.modules.kakaonavigation.KakaoRouteEngine",true,loader).getField("INSTANCE").get(null);
      sdk=Class.forName("com.kakaomobility.knsdk.KNSDK",true,loader).getField("INSTANCE").get(null);
      HashMap<String,Object> req=new HashMap<>();
      req.put("name","다선초등학교");req.put("address","부산 사하구 다송로 57");
      req.put("startLat",35.0640682);req.put("startLng",128.9837168);
      req.put("lat",35.0636823232284);req.put("lng",128.985493965177);req.put("routePriority","TIME");
      CountDownLatch ready=new CountDownLatch(1);Object[] prepared=new Object[1];String[] error=new String[1];
      Object ok=fn(1,a->{Map<?,?> data=(Map<?,?>)a[0];prepared[0]=call(engine,"get",data.get("sdkPreviewId"));ready.countDown();});
      Object fail=fn(1,a->{error[0]=String.valueOf(a[0]);ready.countDown();});
      call(engine,"preview",getTargetContext(),req,ok,fail);
      if(!ready.await(60,TimeUnit.SECONDS)||prepared[0]==null)throw new Exception("Initialization route failed: "+error[0]);
      Object templateTrip=call(prepared[0],"getTrip"), templateGoal=call(templateTrip,"getGoal"), start=call(templateTrip,"getStart");
      Object pos=call(templateGoal,"getPos");
      JSONArray records=new JSONArray();
      JSONObject baseline=(JSONObject)null;
      // A/B/A: same coordinates, same priority, same RPFlag; only local place ID differs.
      for(String id:new String[]{null,"8223574",null}){
        Object goal=null;
        for(Constructor<?> c:templateGoal.getClass().getConstructors())if(c.getParameterCount()==8)
          goal=c.newInstance("다선초등학교",call(pos,"getX"),call(pos,"getY"),"부산 사하구 다송로 57",id,call(templateGoal,"getRpFlag"),call(templateGoal,"getIndoorInfo"),call(templateGoal,"getLinkFilterType"));
        if(goal==null)throw new Exception("Public KNPOI constructor unavailable");
        final JSONObject record=new JSONObject();record.put("poiId",id==null?JSONObject.NULL:id);record.put("rpFlag",call(goal,"getRpFlag"));record.put("requestedLat",35.0636823232284);record.put("requestedLng",128.985493965177);record.put("timestamp",System.currentTimeMillis());
        CountDownLatch done=new CountDownLatch(1);final String[] failure=new String[1];
        Object cb=fn(2,a->{
          if(a[0]!=null||a[1]==null){failure[0]="makeTrip error "+a[0];done.countDown();return;}
          Object trip=a[1];
          Object routeCallback=fn(2,b->{
            try{
              if(b[0]!=null||b[1]==null||((List<?>)b[1]).isEmpty()){failure[0]="route error "+b[0];return;}
              Object route=((List<?>)b[1]).get(0);List<?> path=(List<?>)call(route,"routePolylineWGS84");
              record.put("meters",call(route,"getTotalDist"));record.put("seconds",call(route,"getTotalTime"));record.put("path",new JSONArray(path));record.put("arrival",new JSONObject((Map<?,?>)path.get(path.size()-1)));
              record.put("tripGoalPoiId",call(call(trip,"getGoal"),"getPoiId"));
            }catch(Exception e){failure[0]=e.toString();}finally{done.countDown();}
          });
          Class<?> priority=Class.forName("com.kakaomobility.knsdk.KNRoutePriority",true,loader);
          call(trip,"routeWithPriority",priority.getField("KNRoutePriority_Time").get(null),0,routeCallback);
        });
        final Object selectedGoal=goal;
        runOnMainSync(()->{try{call(sdk,"makeTripWithStart",start,selectedGoal,null,null,cb);}catch(Exception e){failure[0]=e.toString();done.countDown();}});
        if(!done.await(60,TimeUnit.SECONDS))failure[0]="timed out";
        if(failure[0]!=null)record.put("error",failure[0]);
        records.put(record);
        Bundle status=new Bundle();status.putString("case",record.toString());sendStatus(0,status);
      }
      output.putString("records",records.toString());finish(-1,output);
    }catch(Throwable e){output.putString("failure",android.util.Log.getStackTraceString(e));finish(0,output);}
  }
}
