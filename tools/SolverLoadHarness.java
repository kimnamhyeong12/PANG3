import com.google.ortools.Loader;
import com.google.ortools.sat.*;
import java.util.*;
import java.util.concurrent.*;
import java.nio.file.*;
import java.lang.management.*;

/** Offline research harness. Production solve/cost methods are injected at compile time. */
public class SolverLoadHarness {
 static int DP_LIMIT;
 static String algorithm;
 static double limit;
 static int solverWorkers;
 record Solution(List<Integer> order,String status,double bound) {}
 static List<Integer> greedy(double[][] c) {
  Set<Integer> left=new LinkedHashSet<>();for(int i=1;i<c.length;i++)left.add(i);
  List<Integer> order=new ArrayList<>();int at=0;
  while(!left.isEmpty()){final int from=at;int next=left.stream().min(Comparator.comparingDouble(i->c[from][i])).orElseThrow();order.add(next);left.remove(next);at=next;}
  return order;
 }
 static double score(List<Integer> order,double[][] c){double total=0;int at=0;for(int b:order){total+=c[at][b];at=b;}return total;}
 static Solution cp(double[][] c) {
  int n=c.length;CpModel model=new CpModel();CircuitConstraint circuit=model.addCircuit();
  BoolVar[][] edges=new BoolVar[n][n];LinearExprBuilder objective=LinearExpr.newBuilder();
  List<Integer> seed=algorithm.equals("cpseed")?solve(c,c.length-1,false,-1).stream().map(i->i+1).toList():greedy(c);Set<String> hint=new HashSet<>();int before=0;
  for(int to:seed){hint.add(before+":"+to);before=to;}hint.add(before+":0");
  for(int a=0;a<n;a++)for(int b=0;b<n;b++)if(a!=b){
   BoolVar v=model.newBoolVar("e"+a+"_"+b);edges[a][b]=v;circuit.addArc(a,b,v);
   if(b!=0)objective.addTerm(v,Math.round(c[a][b]));
   model.addHint(v,hint.contains(a+":"+b)?1:0);
  }
  model.minimize(objective);CpSolver solver=new CpSolver();
  solver.getParameters().setMaxTimeInSeconds(limit).setNumSearchWorkers(solverWorkers).setRandomSeed(17);
  CpSolverStatus status=solver.solve(model);
  if(status==CpSolverStatus.MODEL_INVALID||status==CpSolverStatus.INFEASIBLE)throw new IllegalStateException(status.toString());
  if(status!=CpSolverStatus.OPTIMAL&&status!=CpSolverStatus.FEASIBLE)return new Solution(seed,status+"_SEED_FALLBACK",solver.bestObjectiveBound());
  List<Integer> order=new ArrayList<>();int at=0;
  for(int i=0;i<n-1;i++){int next=-1;for(int j=1;j<n;j++)if(edges[at][j]!=null&&solver.booleanValue(edges[at][j])){next=j;break;}if(next<0)throw new IllegalStateException("Invalid route");order.add(next);at=next;}
  if(algorithm.equals("cpseed")&&score(seed,c)<score(order,c))return new Solution(seed,"SEED_PRESERVED",solver.bestObjectiveBound());
  return new Solution(order,status.toString(),solver.bestObjectiveBound());
 }
 static Solution execute(double[][] c) {
  if(algorithm.startsWith("cp"))return cp(c);
  List<Integer> order=solve(c,c.length-1,false,-1).stream().map(i->i+1).toList();
  return new Solution(order,algorithm.equals("dp")?"OPTIMAL":"HEURISTIC",algorithm.equals("dp")?score(order,c):0);
 }
 static long gcCount(){return ManagementFactory.getGarbageCollectorMXBeans().stream().mapToLong(g->Math.max(0,g.getCollectionCount())).sum();}
 static long gcTime(){return ManagementFactory.getGarbageCollectorMXBeans().stream().mapToLong(g->Math.max(0,g.getCollectionTime())).sum();}
 public static void main(String[] args)throws Exception {
  algorithm=args[0];DP_LIMIT=algorithm.equals("dp")?29:0;
  int clients=Integer.parseInt(args[2]),repeats=Integer.parseInt(args[3]),parallelism=Integer.parseInt(args[4]);
  limit=Double.parseDouble(args[5]);solverWorkers=Integer.parseInt(args[6]);
  Scanner input=new Scanner(Files.newBufferedReader(Path.of(args[1])));int n=input.nextInt(),samples=input.nextInt();
  double[][][] matrices=new double[samples][n+1][n+1];for(int s=0;s<samples;s++)for(int i=0;i<=n;i++)for(int j=0;j<=n;j++)matrices[s][i][j]=input.nextDouble();input.close();
  Loader.loadNativeLibraries();
  double[][] warm=new double[9][9];for(int a=0;a<9;a++)for(int b=0;b<9;b++)warm[a][b]=a==b?0:1+Math.abs(a-b)*10+(a*7+b*11)%17;
  for(int i=0;i<8;i++)execute(warm);
  System.gc();Thread.sleep(50);
  System.out.println("{\"event\":\"READY\",\"processors\":"+Runtime.getRuntime().availableProcessors()+",\"max_heap_bytes\":"+Runtime.getRuntime().maxMemory()+"}");System.out.flush();
  new Scanner(System.in).nextLine();
  long gcBefore=gcCount(),gcMsBefore=gcTime(),start=System.nanoTime();
  ExecutorService pool=Executors.newFixedThreadPool(Math.min(clients,parallelism));
  List<String> results=new ArrayList<>();
  try {
   for(int repetition=0;repetition<repeats;repetition++)for(int sample=0;sample<samples;sample++){
    List<Future<String>> tasks=new ArrayList<>();CountDownLatch gate=new CountDownLatch(1);
    for(int id=0;id<clients;id++){
     final int si=(sample+id)%samples;final int request=repetition*samples*clients+sample*clients+id;
     final long queued=System.nanoTime();
     tasks.add(pool.submit(()->{gate.await();long tick=System.nanoTime();
      try{
       Solution solution=execute(matrices[si]);
       if(solution.order.size()!=n||new HashSet<>(solution.order).size()!=n)throw new IllegalStateException("Missing visits");
       return "{\"request\":"+request+",\"sample\":"+si+",\"status\":\""+solution.status+"\",\"solve_ms\":"+(System.nanoTime()-tick)/1e6+",\"latency_ms\":"+(System.nanoTime()-queued)/1e6+",\"cost\":"+score(solution.order,matrices[si])+",\"bound\":"+solution.bound+",\"order\":"+solution.order+"}";
      }catch(OutOfMemoryError e){return "{\"request\":"+request+",\"sample\":"+si+",\"status\":\"OUT_OF_MEMORY\",\"latency_ms\":"+(System.nanoTime()-queued)/1e6+"}";}
     }));
    }
    gate.countDown();for(Future<String> future:tasks)results.add(future.get());
    System.out.println("{\"event\":\"BURST\",\"done\":"+results.size()+"}");System.out.flush();
   }
  }finally{pool.shutdownNow();}
  System.out.println("{\"event\":\"RESULT\",\"elapsed_ms\":"+(System.nanoTime()-start)/1e6+",\"gc_count\":"+(gcCount()-gcBefore)+",\"gc_ms\":"+(gcTime()-gcMsBefore)+",\"rows\":["+String.join(",",results)+"]}");
 }
 // PRODUCTION_METHODS
}
