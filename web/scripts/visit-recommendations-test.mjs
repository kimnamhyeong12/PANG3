import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendationPayload, applyVisitRecommendation } from '../src/lib/visitRecommendations.js';
const tasks=[
  {taskId:1,assigneeUserId:10,status:'pending',lat:35.1,lng:129.1},
  {taskId:2,assigneeUserId:11,status:'working',lat:35.2,lng:129.2},
  {taskId:3,assigneeUserId:10,status:'complete',lat:35.3,lng:129.3},
  {taskId:4,assigneeUserId:10,status:'working',lat:null,lng:129.4},
  {taskId:5,assigneeUserId:10,status:'working',lat:35.5,lng:129.5}
];
test('a route recommendation requires an actual, valid current position',()=>{
  for(const position of [null,{lat:NaN,lng:129},{lat:91,lng:129}])assert.throws(()=>recommendationPayload(tasks,10,position,'car',1),/현재 위치/);
});
test('personal route never includes another member, completed work, or missing coordinates',()=>{
  const payload=recommendationPayload(tasks,10,{lat:35,lng:129},'walk',1);
  assert.deepEqual(payload.locations.map(row=>row.id),[1,5]);
  assert.deepEqual(payload.currentLocation,{lat:35,lng:129});
  assert.equal(payload.transportMode,'walk');assert.equal(payload.guidanceStart,false);
});
test('server recommendation numbers both list items and pins without losing completed records',()=>{
  const result=applyVisitRecommendation(tasks,[{id:5},{id:1}]);
  assert.deepEqual(result.slice(0,2).map(row=>[row.taskId,row.markerNumber]),[[5,1],[1,2]]);
  assert.equal(result.length,tasks.length);assert.equal(result.find(row=>row.taskId===3).markerNumber,null);
  assert.equal(tasks[0].markerNumber,undefined);
});
