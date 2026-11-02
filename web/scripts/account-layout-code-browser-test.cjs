const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {mockChangeStream}=require('./map-app-browser-test.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const output=path.resolve(__dirname,'../../output/account-code-2026-11-02');
(async()=>{
 await fs.mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport:{width:1560,height:1100}});await context.addInitScript(mockChangeStream);await context.addInitScript(()=>localStorage.setItem('pang3.groupId','7'));
 const user={userId:1,name:'김현장',loginId:'account-test',role:'USER',email:'old@example.test',workSido:'부산광역시',workSigungu:'사하구',workplaceAddress:'부산 사하구 근무지',workplaceLat:35.1,workplaceLng:128.96};
 const requests=[],checks=[],saves=[];let challenge=0,socialDenied=true;
 await context.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
 await context.route('**/api/**',async route=>{
  const req=route.request(),p=new URL(req.url()).pathname,m=req.method();if(!p.startsWith('/api/'))return route.continue();
  const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(p==='/api/auth/refresh')return json({...user,accessToken:'fixture',expiresAt:'2099-01-01T00:00:00Z'});
  if(p==='/api/sync/me')return json(user);if(p==='/api/groups/user/1')return json([{groupId:7,groupName:'개인',personal:true}]);
  if(p==='/api/auth/social/providers')return json({google:true,kakao:true});if(p==='/api/auth/social/identities')return json(['google','kakao']);
  if(p==='/api/auth/social/google/verify'||p==='/api/auth/social/kakao/verify')return json({flowId:'social-flow',pollToken:'poll-token',authorizationUrl:'about:blank'});
  if(p==='/api/auth/social/poll')return json(socialDenied?{error:'현재 앱 계정에 연결된 소셜 계정으로 인증해 주세요.'}:{verificationToken:'social:own-account'});
  if(p==='/api/auth/email/code/request'){if(req.postDataJSON().password==='wrong')return json({message:'다시 본인 인증해 주세요.'},400);requests.push(req.postDataJSON());return json({challengeId:'fixture-'+ ++challenge,message:'인증코드를 보냈습니다. 10분 안에 입력해 주세요.'});}
  if(p==='/api/auth/email/code/verify'){const body=req.postDataJSON();checks.push(body);if(body.code!=='123456')return json({message:'인증코드가 올바르지 않습니다.'},400);user.email=requests.at(-1).email;return json({email:user.email,message:'복구 이메일 인증이 완료되었습니다.'});}
  if(p==='/api/users/1/account'&&m==='PATCH'){saves.push(req.postDataJSON());return json({...user,name:req.postDataJSON().name});}
  return json([]);
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const box=locator=>locator.boundingBox();
 try{
  await page.goto(process.env.MAP_QA_URL||'http://localhost:5173/settings');await page.getByRole('heading',{name:'복구 이메일',exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
  const password=page.locator('.account-password-card'),email=page.locator('.account-email-card'),work=page.locator('.account-workplace-card'),social=page.locator('.account-social-card');
  const pb=await box(password),eb=await box(email),wb=await box(work),sb=await box(social);assert.ok(Math.abs(pb.y-eb.y)<2);assert.ok(eb.x>pb.x+pb.width);assert.ok(sb.y>wb.y+wb.height);assert.ok(wb.height<300);const basicBox=await box(page.locator('.account-basic-card'));assert.ok(Math.abs(basicBox.y-wb.y)<2);assert.ok(Math.abs(basicBox.y+basicBox.height-sb.y-sb.height)<2);const idBox=await box(page.getByLabel('변경할 아이디',{exact:true})),duplicateBox=await box(page.getByRole('button',{name:'중복 확인',exact:true})),changeBox=await box(page.getByRole('button',{name:'아이디 변경',exact:true}));assert.equal(idBox.y,duplicateBox.y);assert.equal(idBox.y,changeBox.y);assert.equal(await page.getByText('메일 발송 시 현재 비밀번호',{exact:false}).count(),0);await page.getByText('받은 인증코드는 10분 동안 사용할 수 있습니다.',{exact:true}).waitFor();await page.screenshot({path:path.join(output,'aligned-account-top.png'),fullPage:true});
  const current=password.getByLabel('현재 비밀번호',{exact:true}),next=password.getByLabel('새 비밀번호',{exact:true}),confirm=password.getByLabel('새 비밀번호 확인',{exact:true});
  const cb=await box(current),nb=await box(next),fb=await box(confirm);
  assert.ok(cb.y<nb.y&&nb.y<fb.y);assert.ok(Math.abs(cb.x-nb.x)<1&&Math.abs(nb.x-fb.x)<1);
  assert.equal(await password.getByRole('button').count(),0);assert.equal(await confirm.getAttribute('placeholder'),null);await password.getByRole('heading',{name:'비밀번호 변경',exact:true}).waitFor();
  const actions=await box(work.locator('.account-workplace-actions')),lastAction=await box(work.getByRole('button',{name:'근무지 삭제',exact:true}));assert.ok(Math.abs(actions.x+actions.width-lastAction.x-lastAction.width)<2);
  const input=email.getByLabel('복구 이메일',{exact:true}),send=email.getByRole('button',{name:'인증 메일 받기',exact:true}),code=email.getByLabel('이메일 인증코드',{exact:true}),verify=email.getByRole('button',{name:'인증 확인',exact:true});
  const ib=await box(input),mb=await box(send),cob=await box(code);assert.ok(Math.abs(ib.y-mb.y)<2,JSON.stringify({ib,mb}));assert.ok(mb.x>=ib.x+ib.width);assert.ok(cob.y>ib.y+ib.height);assert.equal(await page.locator('form form').count(),0);
  const save=page.getByRole('button',{name:'변경사항 저장',exact:true}),remove=page.getByRole('button',{name:'계정 탈퇴',exact:true});
  const saveB=await box(save),removeB=await box(remove);assert.ok(Math.abs(saveB.y-removeB.y)<1);assert.ok(removeB.x>saveB.x+saveB.width);assert.equal(await page.locator('.account-withdraw').count(),0);
  const centered=await save.evaluate(button=>{const range=document.createRange();range.selectNodeContents(button);const text=range.getBoundingClientRect(),b=button.getBoundingClientRect();return Math.abs(text.x+text.width/2-(b.x+b.width/2));});assert.ok(centered<1,centered);
  await page.screenshot({path:path.join(output,'desktop-layout.png'),fullPage:true});console.log('PASS 카드 같은 줄·근무지 아래 간편 로그인·비밀번호 세로 순서·카드 내 소셜 인증 제거·근무지 버튼 오른쪽·저장/탈퇴 버튼 중앙 정렬');
  await input.fill('new@example.test');await current.fill('not-used-for-email');await send.click();const auth=page.getByRole('dialog',{name:'인증 후 메일 발송',exact:true});await auth.waitFor();assert.equal(requests.length,0);assert.equal(await auth.getByLabel('현재 비밀번호',{exact:true}).inputValue(),'');
  await auth.getByLabel('현재 비밀번호',{exact:true}).fill('wrong');await auth.getByRole('button',{name:'인증 후 메일 발송',exact:true}).click();await auth.getByRole('alert').waitFor();assert.equal(requests.length,0);assert.equal(await code.isDisabled(),true);
  await auth.getByLabel('현재 비밀번호',{exact:true}).fill('test-password');await auth.getByRole('button',{name:'인증 후 메일 발송',exact:true}).click();await email.getByRole('status').filter({hasText:'인증코드를 보냈습니다'}).waitFor();assert.equal(requests[0].password,'test-password');assert.equal(requests[0].email,'new@example.test');assert.equal(await code.isEnabled(),true);
  await code.fill('000000');await verify.click();await email.getByRole('status').filter({hasText:'올바르지'}).waitFor();assert.equal(await input.inputValue(),'new@example.test');await code.fill('123456');await verify.click();await email.getByRole('status').filter({hasText:'인증이 완료'}).waitFor();assert.equal(user.email,'new@example.test');assert.equal(await email.getByRole('button',{name:'인증 완료',exact:true}).isDisabled(),true);
  console.log('PASS 본인 인증 선행·이메일 발송·오류 코드 입력 유지·인증코드 확인 완료');
  await input.fill('another@example.test');assert.equal(await code.isDisabled(),true);await send.click();await auth.waitFor();assert.equal(await auth.getByLabel('현재 비밀번호',{exact:true}).inputValue(),'');
  await auth.getByRole('button',{name:'Google 본인 인증',exact:true}).click();await auth.getByText('현재 앱 계정에 연결된 소셜 계정으로 인증해 주세요.',{exact:true}).waitFor();assert.equal(requests.length,1);
  socialDenied=false;await auth.getByRole('button',{name:'카카오 본인 인증',exact:true}).click();await email.getByRole('status').filter({hasText:'인증코드를 보냈습니다'}).waitFor();assert.equal(requests.length,2);assert.equal(requests[1].password,'social:own-account');assert.equal(await code.inputValue(),'');await current.fill('test-password');
  console.log('PASS 발송 클릭 후 새 인증·비밀번호 오류 미발송·다른 소셜 계정 차단·연결된 계정 인증 후 자동 발송');
  await save.click();await page.getByRole('status').filter({hasText:'계정 정보를 저장했습니다.'}).waitFor();assert.equal(saves.length,1);assert.equal(saves[0].currentPassword,'test-password');await remove.click();await page.getByRole('dialog',{name:'계정 탈퇴',exact:true}).waitFor();assert.equal(saves.length,1);await page.getByRole('dialog',{name:'계정 탈퇴',exact:true}).getByRole('button',{name:'닫기',exact:true}).click();
  console.log('PASS 주소 변경 시 이전 코드 초기화·카드 밖 저장 버튼 실제 제출·탈퇴 본인 확인 유지');
  await current.fill('');await page.locator('.account-basic-card').getByLabel('이름',{exact:true}).fill('인증 후 저장');await save.click();const saveAuth=page.getByRole('dialog',{name:'인증 후 변경사항 저장',exact:true});await saveAuth.waitFor();await saveAuth.getByRole('button',{name:'Google 본인 인증',exact:true}).click();await saveAuth.getByRole('status').waitFor();await saveAuth.getByRole('button',{name:'인증 후 변경사항 저장',exact:true}).click();await page.getByRole('status').filter({hasText:'계정 정보를 저장했습니다.'}).waitFor();assert.equal(saves.at(-1).currentPassword,'social:own-account');console.log('PASS 비밀번호 없는 계정도 저장 시 연결된 소셜 계정 재인증 가능');
  await page.setViewportSize({width:390,height:844});await page.locator('.account-profile').scrollIntoViewIfNeeded();for(const loc of [password,email,save,remove]){const b=await box(loc);assert.ok(b.x>=0&&b.x+b.width<=391,JSON.stringify(b));}await input.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'mobile-email.png'),fullPage:true});assert.deepEqual(errors,[]);console.log('PASS 390px 카드/버튼 가로 넘침 없음·런타임 오류 없음');
 }catch(e){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});await fs.writeFile(path.join(output,'failure.txt'),e.stack+'\n'+errors.join('\n')+'\n'+await page.locator('body').innerText());throw e;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
