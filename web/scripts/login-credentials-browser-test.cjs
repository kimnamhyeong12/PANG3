const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {mockChangeStream}=require('./map-app-browser-test.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const output=path.resolve(__dirname,'../../output/login-credentials-2026-11-02');
const base=process.env.MAP_QA_URL||'http://localhost:5173';
(async()=>{
 await fs.mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport:{width:1560,height:1100}});await context.addInitScript(mockChangeStream);await context.addInitScript(()=>localStorage.setItem('pang3.groupId','7'));
 const generated='social-12345678-1234-1234-1234-123456789abc';
 let user={userId:1,name:'간편가입 회원',loginId:generated,passwordLoginEnabled:false,loginSetupRequired:true,role:'USER'},socialDenied=true,failSave=true;
 const writes=[],errors=[];
 await context.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
 await context.route('**/api/**',async route=>{
  const req=route.request(),p=new URL(req.url()).pathname;
  if(!p.startsWith('/api/'))return route.continue();
  const json=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
  if(p==='/api/auth/refresh')return json({...user,accessToken:'fixture',expiresAt:'2099-01-01T00:00:00Z'});
  if(p==='/api/sync/me')return json(user);if(p==='/api/groups/user/1')return json([{groupId:7,groupName:'내 개인 업무',personal:true}]);
  if(p==='/api/auth/social/providers')return json({google:true,kakao:true});if(p==='/api/auth/social/identities')return json(['google','kakao']);
  if(/^\/api\/auth\/social\/(google|kakao)\/verify$/.test(p))return json({flowId:'flow',pollToken:'poll',authorizationUrl:'about:blank'});
  if(p==='/api/auth/social/poll')return json(socialDenied?{error:'현재 앱 계정에 연결된 소셜 계정으로 인증해 주세요.'}:{verificationToken:'social:own-account'});
  if(p==='/api/auth/login-id/availability'){const id=new URL(req.url()).searchParams.get('loginId');return json({loginId:id,available:id!=='taken'});}
  if(p==='/api/users/1/login-credentials'){
   const body=req.postDataJSON();writes.push(body);
   if(failSave){failSave=false;return json({message:'이미 사용 중인 아이디입니다.'},400);}
   if(body.credential==='wrong')return json({message:'현재 비밀번호를 확인해 주세요.'},400);
   user={...user,loginId:body.loginId,passwordLoginEnabled:true,loginSetupRequired:false};return json({...user,requiresLogin:true});
  }
  return json([]);
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
 const goto=()=>page.goto(new URL('/settings',base).href);
 try{
  await goto();const card=page.locator('.account-password-card');await card.getByRole('heading',{name:'아이디·비밀번호 설정',exact:true}).waitFor();
  assert.equal(await page.getByText(generated,{exact:false}).count(),0);assert.equal(await card.getByLabel('현재 비밀번호',{exact:true}).count(),0);
  const id=card.getByLabel('설정할 아이디',{exact:true}),password=card.getByLabel('설정할 비밀번호',{exact:true}),confirm=card.getByLabel('설정할 비밀번호 확인',{exact:true}),check=card.getByRole('button',{name:'중복 확인',exact:true}),save=card.getByRole('button',{name:'아이디·비밀번호 설정',exact:true});
  await id.fill('taken');await check.click();await card.getByRole('status').filter({hasText:'이미 사용 중'}).waitFor();assert.equal(await save.isDisabled(),true);
  await id.fill('chosen-id');await password.fill('new-password');await confirm.fill('mismatch');await check.click();await card.getByRole('status').filter({hasText:'사용할 수'}).waitFor();assert.equal(await save.isDisabled(),true);await confirm.fill('new-password');assert.equal(await save.isEnabled(),true);
  await id.fill('new-id');assert.equal(await save.isDisabled(),true);await check.click();await card.getByRole('status').filter({hasText:'사용할 수'}).waitFor();
  await save.click();const auth=page.getByRole('dialog',{name:'연결된 계정으로 인증',exact:true});await auth.waitFor();assert.equal(await page.locator('form form').count(),0);
  await auth.getByRole('button',{name:'Google 본인 인증',exact:true}).click();await auth.getByText('현재 앱 계정에 연결된 소셜 계정으로 인증해 주세요.',{exact:true}).waitFor();assert.equal(writes.length,0);
  socialDenied=false;await auth.getByRole('button',{name:'카카오 본인 인증',exact:true}).click();await auth.getByRole('alert').filter({hasText:'이미 사용 중'}).waitFor();assert.equal(await id.inputValue(),'new-id');assert.equal(await password.inputValue(),'new-password');
  await auth.getByRole('button',{name:'닫기',exact:true}).click();assert.ok(await save.evaluate(button=>{const range=document.createRange();range.selectNodeContents(button);const text=range.getBoundingClientRect(),box=button.getBoundingClientRect();return Math.abs(text.x+text.width/2-box.x-box.width/2)<2;}));await page.screenshot({path:path.join(output,'social-setup.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await card.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(output,'social-setup-mobile.png'),fullPage:true});await page.setViewportSize({width:1560,height:1100});
  await save.click();await auth.getByRole('button',{name:'Google 본인 인증',exact:true}).click();await page.getByRole('button',{name:'로그인',exact:true}).waitFor();assert.equal(writes.at(-1).loginId,'new-id');assert.equal(writes.at(-1).password,'new-password');assert.equal(writes.at(-1).credential,'social:own-account');
  console.log('PASS 웹 간편가입: 내부 아이디 숨김·중복/불일치 차단·다른 소셜계정 미저장·실패 후 입력 유지·설정 후 재로그인');
  user={...user,name:'기존 회원',loginId:'old-id',loginSetupRequired:false};await goto();const change=page.locator('.account-login-id'),newId=change.getByLabel('변경할 아이디',{exact:true});await newId.waitFor();assert.equal(await newId.inputValue(),'old-id');await page.getByRole('heading',{name:'비밀번호 변경',exact:true}).waitFor();
  await newId.fill('renamed-id');await change.getByRole('button',{name:'중복 확인',exact:true}).click();await change.getByRole('status').filter({hasText:'사용할 수'}).waitFor();await change.getByRole('button',{name:'아이디 변경',exact:true}).click();
  const rename=page.getByRole('dialog',{name:'인증 후 아이디 변경',exact:true});await rename.getByLabel('현재 비밀번호',{exact:true}).fill('wrong');await rename.getByRole('button',{name:'인증 후 아이디 변경',exact:true}).click();await rename.getByRole('alert').waitFor();assert.equal(user.loginId,'old-id');
  await rename.getByLabel('현재 비밀번호',{exact:true}).fill('old-password');await rename.getByRole('button',{name:'인증 후 아이디 변경',exact:true}).click();await page.getByRole('button',{name:'로그인',exact:true}).waitFor();assert.equal(writes.at(-1).password,undefined);assert.equal(writes.at(-1).credential,'old-password');
  console.log('PASS 웹 기존 사용자: 아이디 변경 재인증·잘못된 비밀번호 미변경·기존 비밀번호 유지·변경 후 재로그인');
  await goto();await page.screenshot({path:path.join(output,'existing-id-change.png'),fullPage:true});assert.deepEqual(errors,[]);
 }catch(error){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});await fs.writeFile(path.join(output,'failure.txt'),error.stack+'\n'+errors.join('\n')+'\n'+await page.locator('body').innerText());throw error;}
 finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
