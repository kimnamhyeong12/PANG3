// Real web UI + isolated server/stream fixtures. Never writes production data.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {mockMaps,mockChangeStream}=require('./map-app-browser-test.cjs');
const assert=require('node:assert/strict');
const day=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
const user={userId:1,loginId:'sync-test',name:'연동 확인',role:'USER'};
const groups=[{groupId:7,groupName:'개인',personal:true}];
const row=id=>({taskId:id,assigneeUserId:1,detailAddress:`연동 방문지 ${id}`,roadAddress:'부산 사하구',lat:35.1+id/10000,lng:128.96,status:'pending',workDate:day,scheduledDate:day});
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
 try{
  const context=await browser.newContext({viewport:{width:1360,height:940}});
  await context.addInitScript(mockMaps);await context.addInitScript(mockChangeStream);
  await context.addInitScript(()=>{localStorage.setItem('pang3.groupId','7');navigator.permissions.query=async()=>({state:'denied'});});
  let tasks=[row(1)],fullReads=0,deltaReads=0,failDelta=false,failSnapshot=false;
  await context.route('**/api/**',async route=>{
   const req=route.request(),u=new URL(req.url()),p=u.pathname;if(!p.startsWith('/api/'))return route.continue();
   const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(p==='/api/auth/refresh')return json({...user,accessToken:'test-only',expiresAt:'2099-01-01T00:00:00Z'});
   if(p==='/api/sync/me')return json(user);
   if(p==='/api/groups/user/1')return json(groups);
   if(p==='/api/locations/group/7'){fullReads++;if(failSnapshot){failSnapshot=false;return json({message:'일시적 조회 실패'},503);}return json(tasks);}
   if(p==='/api/sync/tasks'){
    deltaReads++;if(failDelta){failDelta=false;return json({message:'일시적 조회 실패'},503);}
    const ids=u.searchParams.get('ids').split(',').map(Number);return json({items:tasks.filter(t=>ids.includes(t.taskId)),removedIds:ids.filter(id=>!tasks.some(t=>t.taskId===id))});
   }
   if(p.includes('boundaries'))return json({type:'FeatureCollection',features:[]});
   if(p==='/api/routes/order')return json({optimizedLocations:req.postDataJSON().locations});
   if(p.includes('inquiries')||p.includes('facility-applications'))return json({items:[],hasMore:false});
   return json([]);
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.MAP_QA_URL||'http://localhost:5173/map');
  const sidebar=page.locator('.app-map-sidebar');await sidebar.getByText('연동 방문지 1',{exact:true}).waitFor();await page.waitForTimeout(150);
  const initial=fullReads;
  // Simulate a committed app-side registration, then its server notification.
  tasks.push(row(2));await page.evaluate(()=>window.qaSyncSend({id:'created-2',topics:['tasks'],groups:[7],taskIds:[2]}));
  await sidebar.getByText('연동 방문지 2',{exact:true}).waitFor();assert.equal(fullReads,initial);assert.equal(deltaReads,1);
  console.log('PASS 앱 등록 알림 → 변경 방문지만 수신, 전체 목록 재조회 없음');
  await page.evaluate(()=>window.qaSyncSend({id:'created-2',topics:['tasks'],groups:[7],taskIds:[2]}));await page.waitForTimeout(100);assert.equal(deltaReads,1);
  tasks=tasks.filter(t=>t.taskId!==1);await page.evaluate(()=>window.qaSyncSend({topics:['tasks'],groups:[7],taskIds:[1]}));
  await sidebar.getByText('연동 방문지 1',{exact:true}).waitFor({state:'hidden'});assert.equal(fullReads,initial);
  console.log('PASS 중복 알림 중복 조회 방지·삭제 방문지 제거');
  await page.clock.install();await page.clock.fastForward(61_000);assert.equal(fullReads,initial);assert.equal(deltaReads,2);await page.clock.resume();
  console.log('PASS 61초 동안 변경 없으면 방문지 서버 조회 없음');
  tasks.push(row(3));await page.evaluate(()=>window.qaSyncDisconnect());
  await sidebar.getByText('연동 방문지 3',{exact:true}).waitFor();assert.ok(fullReads>initial);
  console.log('PASS 알림을 못 받은 동안 추가된 방문지: 재연결 시 복구');
  const readsBeforeFailure=fullReads;tasks.push(row(4));failDelta=true;failSnapshot=true;
  await page.evaluate(()=>window.qaSyncSend({topics:['tasks'],groups:[7],taskIds:[4]}));
  await sidebar.getByText('연동 방문지 4',{exact:true}).waitFor({timeout:15000});assert.ok(fullReads>=readsBeforeFailure+2);
  console.log('PASS 변경 조회·복구 조회가 연속 실패해도 재연결 후 저장된 방문지 복구');
  await page.getByRole('button',{name:'지도 선택',exact:true}).click();
  await page.getByLabel('위도 직접 입력').fill('35.106');await page.getByLabel('경도 직접 입력').fill('128.966');await page.getByRole('button',{name:'이 위치 선택',exact:true}).click();
  const form=page.getByRole('dialog',{name:'방문지 추가'});await form.waitFor();
  await form.getByLabel('방문지 이름',{exact:true}).fill('아직 저장하지 않은 입력');
  tasks.push(row(5));await page.evaluate(()=>window.qaSyncSend({topics:['tasks'],groups:[7],taskIds:[5]}));
  await sidebar.getByText('연동 방문지 5',{exact:true}).waitFor();assert.equal(await form.getByLabel('방문지 이름',{exact:true}).inputValue(),'아직 저장하지 않은 입력');
  console.log('PASS 외부 변경을 반영해도 작성 중인 방문지 입력 유지');
  assert.deepEqual(errors,[]);await context.close();console.log('PASS live sync browser checks');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
