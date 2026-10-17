const assert = require('node:assert/strict');
const vm = require('node:vm');
const babel = require('../node_modules/@babel/core');
function form() {
  const slots=[]; let cursor=0, tree, behavior=async()=>({}); const calls=[], alerts=[], sent=[], busy=[];
  const react={ useState(initial) { const i=cursor++; if(!slots[i]) slots[i]={value:initial}; return [slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;}]; },
    useRef(initial) { const i=cursor++; return slots[i] ||= {current:initial}; },
    createElement(type,props,...children) { return {type,props:{...props,children}}; } };
  const module={exports:{}};
  const source=babel.transformFileSync(require.resolve('../components/SupportInquiryForm.js'),{ configFile:false,babelrc:false,
    plugins:[[require.resolve('../node_modules/@babel/plugin-transform-react-jsx'),{runtime:'classic'}],require.resolve('../node_modules/@babel/plugin-transform-modules-commonjs')] }).code;
  vm.runInNewContext(source,{module,exports:module.exports,require(name){
    if(name==='react')return react;
    if(name==='react-native')return {Platform:{OS:'android'},StyleSheet:{create:s=>s},Text:'Text',TextInput:'TextInput',View:'View'};
    if(name==='expo-constants')return {expoConfig:{version:'1.0.0'}};
    if(name==='./ui')return {PrimaryButton:'Button'};
    if(name==='./CustomAlert')return {showAlert:(...args)=>alerts.push(args)};
    if(name.includes('groupApi'))return {groupApi:async(...args)=>{calls.push(args);return behavior(...args);}};
    if(name.includes('design'))return {colors:{}};
    throw Error(name);
  }});
  function render(){cursor=0;tree=module.exports.default({user:{email:'reply@example.test'},onSubmitted:()=>sent.push(true),onBusyChange:v=>busy.push(v)});}
  function nodes(n=tree){ if(!n||typeof n!=='object')return [];return [n,...(n.props?.children||[]).flat(Infinity).flatMap(c=>nodes(c))]; }
  function find(type,label){return nodes().find(n=>n.type===type&&(!label||n.props.accessibilityLabel===label));}
  function input(label,value){find('TextInput',label).props.onChangeText(value);render();}
  render(); return {render,find,input,calls,alerts,sent,busy,setBehavior:fn=>{behavior=fn;}};
}
(async()=>{
  const f=form(); f.input('문의 제목','App issue');f.input('문의 내용','Details stay on failure');
  f.input('답변받을 이메일','invalid'); await f.find('Button').props.onPress();assert.equal(f.calls.length,0);
  f.input('답변받을 이메일','reply@example.test');
  f.setBehavior(async()=>{throw Object.assign(new Error('Try again'),{status:503});});
  await f.find('Button').props.onPress();f.render();
  assert.equal(f.sent.length,0);assert.equal(f.alerts.length,0);
  assert.equal(f.find('TextInput','문의 내용').props.value,'Details stay on failure');
  let finish;f.setBehavior(()=>new Promise(resolve=>{finish=resolve;}));
  const first=f.find('Button').props.onPress();f.render();
  const before=f.calls.length;await f.find('Button').props.onPress();assert.equal(f.calls.length,before,'double press cannot submit twice');
  finish({message:'sent'});await first;f.render();assert.equal(f.sent.length,1);assert.equal(f.alerts.length,1);
  const body=JSON.parse(f.calls.at(-1)[1].body);assert.equal(body.replyEmail,'reply@example.test');assert.equal(body.platform,'android');
  assert.equal(f.calls.at(-1)[0],'/api/support/inquiries');assert.equal(body.to,undefined,'recipient is controlled by the backend');
  console.log('In-app support checks passed: email validation, retained draft on failure, no false success and duplicate-submit protection');
})().catch(error=>{console.error(error);process.exitCode=1;});
