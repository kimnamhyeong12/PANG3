package com.fieldwork.service;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class VisitOrderServiceTest {
    @Test void providerDurationsIncludeReturnAndCacheRows() throws Exception {
        VisitOrderService service=new VisitOrderService();
        var client=(org.springframework.web.client.RestTemplate) org.springframework.test.util.ReflectionTestUtils.getField(service,"client");
        org.springframework.test.util.ReflectionTestUtils.setField(service,"key","synthetic");
        var server=org.springframework.test.web.client.MockRestServiceServer.bindTo(client).ignoreExpectOrder(true).build();
        var mapper=new com.fasterxml.jackson.databind.ObjectMapper();
        double[][] times={{0,1,2,0},{0,0,1,1},{0,2,0,100},{0,0,0,0}};
        server.expect(org.springframework.test.web.client.ExpectedCount.times(3),org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo("https://apis-navi.kakaomobility.com/v1/destinations/directions"))
            .andRespond(request->{
                var payload=mapper.readTree(((org.springframework.mock.http.client.MockClientHttpRequest)request).getBodyAsString());
                assertEquals(10000,payload.get("radius").asInt()); assertEquals("TIME",payload.get("priority").asText());
                int origin=(int)Math.round((payload.get("origin").get("x").asDouble()-129)*1000);
                List<Map<String,Object>> routes=new ArrayList<>();
                for(var destination:payload.get("destinations")) {
                    int index=Integer.parseInt(destination.get("key").asText());
                    routes.add(Map.of("key",String.valueOf(index),"result_code",0,"summary",Map.of("duration",times[origin][index])));
                }
                var response=new org.springframework.mock.http.client.MockClientHttpResponse(mapper.writeValueAsBytes(Map.of("routes",routes)),org.springframework.http.HttpStatus.OK);
                response.getHeaders().setContentType(org.springframework.http.MediaType.APPLICATION_JSON); return response;
            });
        Map<String,Object> start=Map.of("lat",35,"lng",129), a=Map.of("id",1,"lat",35,"lng",129.001),
                b=Map.of("id",2,"lat",35,"lng",129.002), home=Map.of("lat",35,"lng",129.003);
        try {
            var result=service.recommend(start,List.of(a,b),home,null,"car");
            assertEquals(List.of(b,a),result.get("optimizedLocations")); assertEquals("roadDuration",result.get("basis"));
            assertEquals(5.0,result.get("totalCost"));
            assertEquals(List.of(a,b),service.recommend(start,List.of(a,b),home,"1","car").get("optimizedLocations"));
            server.verify();
        } finally { service.stop(); }
    }
    @Test void returnChangesOrderAndUserChoiceStaysFirst() {
        // Open route favours A->B. B->home is expensive, so the closed route is B->A.
        double[][] c = {{0,1,2,0}, {0,0,1,1}, {0,2,0,100}, {0,0,0,0}};
        assertEquals(List.of(0,1), VisitOrderService.solve(c, 2, false, -1));
        assertEquals(List.of(1,0), VisitOrderService.solve(c, 2, true, -1));
        assertEquals(List.of(0,1), VisitOrderService.solve(c, 2, true, 0));
    }
    @Test void exactSolverMatchesExhaustiveDirectedRoutes() {
        Random random = new Random(17);
        for (int n = 1; n <= 7; n++) {
            double[][] c = new double[n+2][n+2];
            for (double[] row : c) for (int j=0; j<row.length; j++) row[j] = 1 + random.nextInt(1000);
            for (boolean home : List.of(false,true)) for (int pinned : List.of(-1,0)) {
                List<Integer> actual = VisitOrderService.solve(c,n,home,pinned);
                assertEquals(n, new HashSet<>(actual).size());
                assertEquals(brute(new ArrayList<>(), c,n,home,pinned), VisitOrderService.cost(actual,c,n,home));
                if (pinned>=0) assertEquals(pinned, actual.get(0));
            }
        }
    }
    private double brute(List<Integer> order,double[][] c,int n,boolean home,int pinned) {
        if (order.size()==n) return VisitOrderService.cost(order,c,n,home);
        double best=Double.POSITIVE_INFINITY;
        for(int i=0;i<n;i++) if(!order.contains(i) && !(order.isEmpty() && pinned>=0 && i!=pinned)) {
            order.add(i); best=Math.min(best,brute(order,c,n,home,pinned)); order.remove(order.size()-1);
        }
        return best;
    }
    @Test void largeListsPreserveAllVisitsAndPinnedDestination() {
        int n=25; double[][] c=new double[n+2][n+2]; Random random=new Random(5);
        for(double[] row:c) for(int i=0;i<row.length;i++) row[i]=1+random.nextInt(100);
        List<Integer> order=VisitOrderService.solve(c,n,true,8);
        assertEquals(8,order.get(0)); assertEquals(n,new HashSet<>(order).size());
        assertTrue(Double.isFinite(VisitOrderService.cost(order,c,n,true)));
    }
}
