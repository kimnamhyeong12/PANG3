import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../../frontend/utils/changeSync.js',import.meta.url),'utf8');
const {createChangeSync}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const tick=()=>new Promise(r=>setImmediate(r));
async function until(check){for(let i=0;i<500;i++){if(check())return;await tick();}throw Error('condition timed out');}

test('unchanged lists are reused; one delta updates all/my caches and ignores duplicate events',async()=>{
 const calls=[],sync=createChangeSync({request:async path=>{calls.push(path);return json({items:[{taskId:2,assigneeUserId:1,name:'new'}],removedIds:[3]});}});
 let reads=0;const load=async()=>{reads++;return [{taskId:1,assigneeUserId:1},{taskId:3,assigneeUserId:2}];};
 await sync.tasks(7,null,load);await sync.tasks(7,1,async()=>[{taskId:1,assigneeUserId:1}]);
 await sync.tasks(7,null,load);assert.equal(reads,1);
 const event={id:'committed-1',topics:['tasks'],groups:[7],taskIds:[2,3]};
 await sync.receive(event);await sync.receive(event);
 assert.equal(calls.length,1);assert.match(calls[0],/ids=2,3/);
 assert.deepEqual((await sync.tasks(7,null,load)).map(r=>r.taskId),[1,2]);
 assert.deepEqual((await sync.tasks(7,1,load)).map(r=>r.taskId),[1,2]);assert.equal(reads,1);
});
test('task reassignment removes it from the previous owner cache',async()=>{
 const sync=createChangeSync({request:async()=>json({items:[{taskId:1,assigneeUserId:2}],removedIds:[]})});
 await sync.tasks(7,1,async()=>[{taskId:1,assigneeUserId:1}]);
 await sync.receive({topics:['tasks'],groups:[7],taskIds:[1]});
 assert.deepEqual(await sync.tasks(7,1,()=>assert.fail('full reload')),[]);
});
test('other groups and non-task changes do not reload visits',async()=>{
 let calls=0;const sync=createChangeSync({request:()=>{calls++;throw Error('unexpected');}});
 let loads=0;const load=async()=>{loads++;return [{taskId:1}];};await sync.tasks(7,null,load);
 await sync.receive({topics:['support']});await sync.receive({topics:['tasks'],groups:[8],taskIds:[2]});
 await sync.tasks(7,null,load);assert.equal(loads,1);assert.equal(calls,0);
});
test('reconciliation after reconnect replaces snapshots, including deleted visits',async()=>{
 const sync=createChangeSync({request:()=>assert.fail('unexpected delta')});let rows=[{taskId:1}],loads=0;
 const load=async()=>{loads++;return rows;};await sync.tasks(7,null,load);rows=[{taskId:2}];
 await sync.receive({topics:['resync']});assert.deepEqual(await sync.tasks(7,null,load),rows);assert.equal(loads,2);
});
test('changes racing an initial snapshot cannot be overwritten by the old response',async()=>{
 const sync=createChangeSync({request:async()=>json({items:[{taskId:2}],removedIds:[]})});
 let resolve,reads=0;const load=()=>++reads===1?new Promise(r=>resolve=r):Promise.resolve([{taskId:1},{taskId:2}]);
 const pending=sync.tasks(7,null,load);await sync.receive({topics:['tasks'],groups:[7],taskIds:[2]});resolve([{taskId:1}]);
 assert.deepEqual((await pending).map(r=>r.taskId),[1,2]);assert.equal(reads,2);
});
test('a delta failure reconnects and reconciles without repeating registration',async()=>{
 let connection=0,reader,loads=0,received=0;const states=[];
 const sync=createChangeSync({delay:async()=>{},onState:s=>states.push(s),request:async path=>{
  if(path.includes('/tasks?'))return new Response('',{status:503});
  assert.equal(path,'/api/sync/events');connection++;
  return new Response(new ReadableStream({start(c){reader=c;c.enqueue(new TextEncoder().encode('event: sync\r\ndata: {"topics":["resync"]}\r\n\r\n'));}}),{headers:{'Content-Type':'text/event-stream'}});
 }});
 sync.subscribe(e=>{received++;if(e.topics.includes('resync'))void sync.tasks(7,null,async()=>{loads++;return loads===1?[{taskId:1}]:[{taskId:1},{taskId:2}];});});
 sync.start();await until(()=>loads===1);reader.enqueue(new TextEncoder().encode('data: {"topics":["tasks"],"groups":[7],"taskIds":[2]}\n\n'));
 await until(()=>loads===2);assert.equal(connection,2);assert.ok(states.includes('reconnecting'));assert.equal(received,2);
 assert.deepEqual((await sync.tasks(7,null,()=>assert.fail('unnecessary reload'))).map(r=>r.taskId),[1,2]);sync.stop();reader.close();
});
test('idle connection makes no periodic list requests and resumes with reconciliation',async()=>{
 let calls=0,stream;const sync=createChangeSync({request:async(path,{signal})=>{calls++;assert.equal(path,'/api/sync/events');return new Response(new ReadableStream({start(c){stream=c;signal.addEventListener('abort',()=>c.close(),{once:true});}}),{headers:{'Content-Type':'text/event-stream'}});}});
 sync.start();await until(()=>calls===1);for(let i=0;i<25;i++)await tick();assert.equal(calls,1);
 sync.pause();sync.resume();await until(()=>calls===2);sync.stop();
});
test('logging out rejects in-flight snapshots and prevents stale notifications',async()=>{
 let resolve;const sync=createChangeSync({request:()=>assert.fail('unexpected')});
 const pending=sync.tasks(7,null,()=>new Promise(r=>resolve=r));sync.stop();resolve([{taskId:1}]);
 await assert.rejects(pending,/계정/);assert.deepEqual(await sync.tasks(7,null,async()=>[{taskId:99}]),[{taskId:99}]);
});
test('a silent broken stream reconnects when keep-alives stop arriving',async()=>{
 let connections=0;
 const sync=createChangeSync({idleTimeoutMs:5,delay:async()=>{},request:async(path,{signal})=>{
  connections++;return new Response(new ReadableStream({start(c){signal.addEventListener('abort',()=>c.close(),{once:true});}}),{headers:{'Content-Type':'text/event-stream'}});
 }});
 sync.start();await new Promise(r=>setTimeout(r,25));sync.stop();assert.ok(connections>=2);
});
test('local successful mutations reuse returned visit data without another full fetch',async()=>{
 const sync=createChangeSync({request:()=>assert.fail('unexpected')});await sync.tasks(7,null,async()=>[{taskId:1,status:'pending'}]);
 sync.noteMutation('POST','/api/locations',{taskId:2,groupId:7,status:'pending'});
 sync.noteMutation('PATCH','/api/task-progress/1',{taskId:1,taskStatus:'complete'});
 sync.noteMutation('DELETE','/api/locations/2',null);
 assert.deepEqual(await sync.tasks(7,null,()=>assert.fail('unnecessary reload')),[{taskId:1,status:'complete',lat:undefined,lng:undefined,reportName:undefined}]);
});
