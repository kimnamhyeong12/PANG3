const assert = require('node:assert/strict');
const vm = require('node:vm');
const babel = require('../node_modules/@babel/core');
function form(email='reply@example.test') {
  const slots=[]; let cursor=0, tree, behavior=async()=>({}), chooseFiles=async()=>({canceled:true}); const calls=[], alerts=[], sent=[], busy=[];
  const react={ useState(initial) { const i=cursor++; if(!slots[i]) slots[i]={value:initial}; return [slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;}]; },
    useRef(initial) { const i=cursor++; return slots[i] ||= {current:initial}; },
    createElement(type,props,...children) { return {type,props:{...props,children}}; } };
  const module={exports:{}};
  const source=babel.transformFileSync(require.resolve('../components/SupportInquiryForm.js'),{ configFile:false,babelrc:false,
    plugins:[[require.resolve('../node_modules/@babel/plugin-transform-react-jsx'),{runtime:'classic'}],require.resolve('../node_modules/@babel/plugin-transform-modules-commonjs')] }).code;
  class TestFormData { constructor(){this.parts=[];} append(name,value){this.parts.push([name,value]);} }
  vm.runInNewContext(source,{module,exports:module.exports,FormData:TestFormData,require(name){
    if(name==='react')return react;
    if(name==='react-native')return {Keyboard:{dismiss(){}},Modal:'Modal',ScrollView:'ScrollView',Platform:{OS:'android'},StyleSheet:{create:s=>s},Text:'Text',TextInput:'TextInput',TouchableOpacity:'TouchableOpacity',View:'View'};
    if(name==='@expo/vector-icons')return {Ionicons:'Icon'};
    if(name==='expo-constants')return {expoConfig:{version:'1.0.0'}};
    if(name==='../utils/uploadFile')return {createUploadFile:file=>({name:file.name,type:file.type,bytes:async()=>new Uint8Array([1,2,3])})};
    if(name==='expo-document-picker')return {getDocumentAsync:options=>chooseFiles(options)};
    if(name==='./ui')return {PrimaryButton:'Button'};
    if(name==='./CustomAlert')return {showAlert:(...args)=>alerts.push(args)};
    if(name.includes('groupApi'))return {groupApi:async(...args)=>{calls.push(args);return behavior(...args);}};
    if(name.includes('design'))return {colors:{}};
    throw Error(name);
  }});
  function render(){cursor=0;tree=module.exports.default({user:{email},onSubmitted:()=>sent.push(true),onBusyChange:v=>busy.push(v)});}
  function nodes(n=tree){ if(!n||typeof n!=='object'||n.type==='Modal'&&!n.props.visible)return [];return [n,...(n.props?.children||[]).flat(Infinity).flatMap(c=>nodes(c))]; }
  function find(type,label){return nodes().find(n=>n.type===type&&(!label||n.props.accessibilityLabel===label));}
  function input(label,value){find('TextInput',label).props.onChangeText(value);render();}
  render(); return {render,find,input,calls,alerts,sent,busy,errorText:()=>nodes().find(n=>n.props?.accessibilityRole==='alert')?.props.children.join(''),setBehavior:fn=>{behavior=fn;},setPicker:fn=>{chooseFiles=fn;}};
}
(async()=>{
  const f=form(); f.input('문의 제목','App issue');f.input('문의 내용','Details stay on failure');
  f.find('TouchableOpacity','문의 유형 선택').props.onPress();f.render();
  f.find('TouchableOpacity','오류 신고').props.onPress();f.render();
  f.input('이메일 아이디','invalid@'); await f.find('Button').props.onPress();assert.equal(f.calls.length,0);
  f.input('이메일 아이디','reply@example.test');
  assert.equal(f.find('Button').props.disabled,true,'consent is not checked by default');
  await f.find('Button').props.onPress();f.render();assert.equal(f.calls.length,0,'cannot bypass consent through submit');
  f.find('TouchableOpacity','개인정보 수집·이용 안내 전문보기').props.onPress();f.render();
  assert.equal(f.find('TouchableOpacity','개인정보 수집·이용 안내 전문보기').props.accessibilityState.expanded,true);
  f.find('TouchableOpacity','개인정보 수집·이용 동의').props.onPress();f.render();
  f.setBehavior(async()=>{throw Object.assign(new Error('Try again'),{status:503});});
  await f.find('Button').props.onPress();f.render();
  assert.equal(f.sent.length,0);assert.equal(f.alerts.length,0);
  assert.equal(f.find('TextInput','문의 내용').props.value,'Details stay on failure');
  assert.ok(f.errorText().includes('현재 문의를 접수할 수 없습니다'));
  const retryKey=JSON.parse(f.calls.at(-1)[1].body).requestKey;
  let finish;f.setBehavior(()=>new Promise(resolve=>{finish=resolve;}));
  const first=f.find('Button').props.onPress();f.render();
  assert.equal(f.find('TouchableOpacity','문의 유형 선택').props.disabled,true);
  assert.equal(f.find('TouchableOpacity','이메일 도메인 선택').props.disabled,true);
  const before=f.calls.length;await f.find('Button').props.onPress();assert.equal(f.calls.length,before,'double press cannot submit twice');
  finish({message:'sent'});await first;f.render();assert.equal(f.sent.length,1);assert.equal(f.alerts.length,1);
  const body=JSON.parse(f.calls.at(-1)[1].body);assert.equal(body.replyEmail,'reply@example.test');assert.equal(body.platform,'android');
  assert.equal(body.message,'Details stay on failure');assert.equal(body.category,'오류 신고');
  assert.equal(body.privacyConsent,true);assert.equal(body.privacyNoticeVersion,'support-2026-10-29-v1');
  assert.equal(body.requestKey,retryKey,'retrying an unchanged inquiry reuses its idempotency key');
  assert.equal(f.find('TextInput','문의 내용').props.value,'','successful submission clears the draft');
  assert.equal(f.find('TouchableOpacity','개인정보 수집·이용 동의').props.accessibilityState.checked,false);
  assert.ok(f.find('TextInput','문의 내용').props.maxLength <= 5000);
  assert.equal(f.calls.at(-1)[0],'/api/support/inquiries');assert.equal(body.to,undefined,'recipient is controlled by the backend');
  const domains=form('tester@naver.com');
  assert.equal(domains.find('TextInput','이메일 아이디').props.value,'tester');
  assert.equal(domains.find('TextInput','이메일 도메인 입력').props.value,'naver.com');
  domains.find('TextInput','이메일 도메인 입력').props.onFocus();domains.render();
  assert.equal(domains.find('TouchableOpacity','이메일 도메인 선택').props.accessibilityState.expanded,false,'typing does not open the domain picker');
  domains.find('TouchableOpacity','이메일 도메인 선택').props.onPress();domains.render();
  domains.find('TouchableOpacity','gmail.com').props.onPress();domains.render();
  domains.input('문의 제목','Domain test');domains.input('문의 내용','Test');domains.find('TouchableOpacity','개인정보 수집·이용 동의').props.onPress();domains.render();await domains.find('Button').props.onPress();domains.render();
  assert.equal(JSON.parse(domains.calls.at(-1)[1].body).replyEmail,'tester@gmail.com');
  domains.input('이메일 도메인 입력','company.co.kr');domains.input('문의 제목','Custom domain');domains.input('문의 내용','Custom');
  assert.equal(domains.find('TextInput','이메일 도메인 직접 입력'),undefined,'there is no separate domain input');
  domains.find('TouchableOpacity','개인정보 수집·이용 동의').props.onPress();domains.render();
  await domains.find('Button').props.onPress();domains.render();assert.equal(JSON.parse(domains.calls.at(-1)[1].body).replyEmail,'tester@company.co.kr');
  const blank=form('');assert.equal(blank.find('TextInput','이메일 아이디').props.value,'');assert.equal(blank.find('TextInput','이메일 도메인 입력').props.placeholder,'직접 입력');assert.equal(blank.find('Button').props.disabled,true);
  const files=form('tester@gmail.com');
  files.setPicker(async()=>({canceled:false,assets:[{name:'screen.png',uri:'file:///screen.png',size:1024,mimeType:'image/png'}]}));
  await files.find('TouchableOpacity','문의 파일 첨부').props.onPress();files.render();assert.ok(files.find('TouchableOpacity','첨부파일 삭제 screen.png'));
  files.setPicker(async()=>({canceled:false,assets:[{name:'large.pdf',uri:'file:///large.pdf',size:16*1024*1024}]}));
  await files.find('TouchableOpacity','문의 파일 첨부').props.onPress();files.render();assert.ok(files.errorText().includes('15MB'));assert.ok(files.find('TouchableOpacity','첨부파일 삭제 screen.png'),'invalid selection retains previous files');
  files.input('문의 제목','With attachment');files.input('문의 내용','Screenshot');files.find('TouchableOpacity','개인정보 수집·이용 동의').props.onPress();files.render();
  await files.find('Button').props.onPress();files.render();
  const parts=files.calls.at(-1)[1].body.parts;assert.equal(parts.find(p=>p[0]==='files')[1].name,'screen.png');assert.equal(typeof parts.find(p=>p[0]==='files')[1].bytes,'function');
  assert.equal(JSON.parse(parts.find(p=>p[0]==='inquiry')[1]).replyEmail,'tester@gmail.com');
  assert.equal(files.find('TouchableOpacity','첨부파일 삭제 screen.png'),undefined,'success clears attachment selection');
  const bulk=form('bulk@example.test');
  bulk.find('TouchableOpacity','문의 유형 선택').props.onPress();bulk.render();
  bulk.find('TouchableOpacity','대량 데이터 등록 요청').props.onPress();bulk.render();
  bulk.setPicker(async options=>{assert.ok(options.type.includes('text/csv'));assert.ok(options.type.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));return {canceled:false,assets:[{name:'시설물.xlsx',uri:'file:///facilities.xlsx',size:2048},{name:'시설물.csv',uri:'file:///facilities.csv',size:1024}]};});
  await bulk.find('TouchableOpacity','문의 파일 첨부').props.onPress();bulk.render();
  assert.ok(bulk.find('TouchableOpacity','첨부파일 삭제 시설물.xlsx'));assert.ok(bulk.find('TouchableOpacity','첨부파일 삭제 시설물.csv'));
  bulk.input('문의 제목','시설물 대량 등록');bulk.input('문의 내용','자료 확인 부탁드립니다.');bulk.find('TouchableOpacity','개인정보 수집·이용 동의').props.onPress();bulk.render();
  await bulk.find('Button').props.onPress();bulk.render();
  const bulkParts=bulk.calls.at(-1)[1].body.parts;
  assert.equal(JSON.parse(bulkParts.find(p=>p[0]==='inquiry')[1]).category,'대량 데이터 등록 요청');
  assert.deepEqual(Array.from(bulkParts.filter(p=>p[0]==='files'),p=>p[1].type),['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv']);
  const invalid=form();invalid.setPicker(async()=>({canceled:false,assets:[{name:'data.xlsm',uri:'file:///data.xlsm',size:200}]}));
  await invalid.find('TouchableOpacity','문의 파일 첨부').props.onPress();invalid.render();assert.ok(invalid.errorText().includes('XLSX, CSV'));
  console.log('In-app support checks passed: dropdowns, split email/paste/custom domains, validation, retained drafts, idempotent retries and duplicate-submit protection');
})().catch(error=>{console.error(error);process.exitCode=1;});
