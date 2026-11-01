const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const babel=require('../node_modules/@babel/core');
const compile=file=>babel.transformSync(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{filename:file,configFile:false,babelrc:false,plugins:[[require('../node_modules/@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],require('../node_modules/@babel/plugin-transform-modules-commonjs')]}).code;
function load(file,deps){const module={exports:{}};vm.runInNewContext(compile(file),{module,exports:module.exports,require:name=>{if(name.startsWith('@babel/runtime/'))return require(name);assert.ok(name in deps,name);return deps[name];}});return module.exports;}
const identity=load('utils/accountIdentity.js',{});
const generated='social-12345678-1234-1234-1234-123456789abc';
assert.equal(identity.visibleLoginId(generated),'');assert.equal(identity.visibleLoginId('social-worker'),'social-worker');assert.equal(identity.needsLoginSetup({loginId:generated,passwordLoginEnabled:true}),true);
function harness(user){
 let cursor=0,tree;const slots=[],requests=[],done=[],busy=[];
 let response=async(url,options)=>({ok:true,json:async()=>options?.method==='POST'?{requiresLogin:true}:{available:true}});
 const react={useState(v){const i=cursor++;if(!(i in slots))slots[i]=typeof v==='function'?v():v;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef(v){const i=cursor++;return slots[i]||=( {current:v} );}};
 const jsx=(type,props)=>({type,props:props||{}}),native={StyleSheet:{create:v=>v},Modal:'Modal',Text:'Text',TextInput:'Input',TouchableOpacity:'Button',View:'View'};
 const Component=load('components/LoginCredentialsSetup.js',{
  react,'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':native,'./ui':{PrimaryButton:'Primary'},'./SocialAuthButtons':{__esModule:true,default:'Social'},
  '../utils/auth':{apiFetch:async(url,options)=>{requests.push({url,body:options?.body?JSON.parse(options.body):undefined});return response(url,options);}},
  '../utils/api':{API_BASE_URL:'https://api.test'},'../constants/design':{colors:{}},'../utils/accountIdentity':identity,
 }).default;
 const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
 const render=()=>{cursor=0;tree=Component({user,onCompleted:()=>done.push(true),onBusyChange:v=>busy.push(v)});};
 const all=()=>nodes(tree),find=(type,label)=>all().find(n=>n.type===type&&(label===undefined||n.props.accessibilityLabel===label||n.props.title===label));
 const set=(label,value)=>{find('Input',label).props.onChangeText(value);render();};
 render();return{user,requests,done,busy,all,find,set,render,setResponse:fn=>response=fn};
}
async function check(form){await form.find('Button','아이디 중복 확인').props.onPress();form.render();}
(async()=>{
 const form=harness({userId:7,loginId:generated,passwordLoginEnabled:false});
 assert.equal(form.find('Input','설정할 아이디').props.value,'');assert.equal(form.find('Primary','아이디·비밀번호 설정').props.disabled,true);
 form.set('설정할 아이디','field-worker');form.set('설정할 비밀번호','new-password');form.set('설정할 비밀번호 확인','mismatch');await check(form);
 assert.equal(form.find('Primary','아이디·비밀번호 설정').props.disabled,true);form.set('설정할 비밀번호 확인','new-password');assert.equal(form.find('Primary','아이디·비밀번호 설정').props.disabled,false);
 form.set('설정할 아이디','changed');assert.equal(form.find('Primary','아이디·비밀번호 설정').props.disabled,true);await check(form);
 form.find('Primary','아이디·비밀번호 설정').props.onPress();form.render();assert.equal(form.find('Modal').props.visible,true);assert.equal(form.find('Input','현재 비밀번호'),undefined);
 form.setResponse(async()=>({ok:false,json:async()=>({message:'다른 소셜 계정입니다.'})}));await form.find('Social').props.onVerified('social:wrong');form.render();
 assert.equal(form.done.length,0);assert.equal(form.find('Input','설정할 아이디').props.value,'changed');assert.equal(form.find('Input','설정할 비밀번호').props.value,'new-password');
 let resolve;form.setResponse(()=>new Promise(r=>resolve=r));const callback=form.find('Social').props.onVerified,save=callback('social:own');form.render();const count=form.requests.length;await callback('social:own');assert.equal(form.requests.length,count);
 resolve({ok:true,json:async()=>({requiresLogin:true})});await save;form.render();assert.equal(form.requests.length,count);assert.equal(form.done.length,1);assert.equal(form.requests.at(-1).body.credential,'social:own');assert.equal(form.requests.at(-1).body.password,'new-password');assert.equal(form.find('Input','설정할 비밀번호').props.value,'');
 console.log('PASS 앱 간편가입: 내부 아이디 숨김·중복 확인·비밀번호 일치·연결계정 인증·오류 입력 유지·성공 후 로그아웃 콜백');
 const existing=harness({userId:8,loginId:'old-worker',passwordLoginEnabled:true});assert.equal(existing.find('Input','변경할 아이디').props.value,'old-worker');assert.equal(existing.find('Input','설정할 비밀번호'),undefined);
 existing.set('변경할 아이디','new-worker');await check(existing);existing.find('Primary','아이디 변경').props.onPress();existing.render();existing.set('현재 비밀번호','old-password');await existing.find('Primary','인증 후 아이디 변경').props.onPress();
 assert.equal(existing.done.length,1);assert.equal(existing.requests.at(-1).body.loginId,'new-worker');assert.equal(existing.requests.at(-1).body.password,undefined);assert.equal(existing.requests.at(-1).body.credential,'old-password');
 const social=harness({userId:9,loginId:'old-linked',passwordLoginEnabled:true});social.set('변경할 아이디','new-linked');await check(social);social.find('Primary','아이디 변경').props.onPress();social.render();await social.find('Social').props.onVerified('social:linked');assert.equal(social.requests.at(-1).body.credential,'social:linked');
 console.log('PASS 앱 기존 계정: 비밀번호 유지·현재 비밀번호 또는 소셜 인증으로 아이디 변경');
 const stale=harness({userId:10,loginId:generated});let finish;stale.set('설정할 아이디','first-id');stale.setResponse(()=>new Promise(r=>finish=r));const checking=stale.find('Button','아이디 중복 확인').props.onPress();stale.set('설정할 아이디','second-id');finish({ok:true,json:async()=>({available:true})});await checking;stale.render();assert.equal(stale.find('Primary','아이디·비밀번호 설정').props.disabled,true);assert.equal(stale.all().some(n=>n.props?.children==='사용할 수 있는 아이디입니다.'),false);
 console.log('PASS 앱 이전 아이디 중복조회 응답 무시·현재 입력 기준 확인 필요');
})().catch(e=>{console.error(e);process.exitCode=1;});
