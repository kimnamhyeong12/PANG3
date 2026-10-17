const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('../node_modules/@babel/core');
const compile = file => babel.transformSync(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{configFile:false,babelrc:false,plugins:[[require('../node_modules/@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],require('../node_modules/@babel/plugin-transform-modules-commonjs')]}).code;
const regionModule={exports:{}};
new Function('require','module','exports',compile('utils/workRegion.js'))(()=>require('../constants/koreaRegions.json'),regionModule,regionModule.exports);
let cursor=0, slots=[], tree, sent;
const react={useState(initial){const i=cursor++;slots[i]??={value:typeof initial==='function'?initial():initial};return[slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;}];},useRef(initial){return slots[cursor++]??={current:initial};}};
const jsx=(type,props)=>({type,props:props||{}});
const dependencies={
  react,'react/jsx-runtime':{jsx,jsxs:jsx},
  'react-native':{KeyboardAvoidingView:'View',Platform:{OS:'android'},ScrollView:'View',StyleSheet:{create:v=>v},Text:'Text',TextInput:'Input',TouchableOpacity:'Button',View:'View'},
  '../utils/auth':{apiFetch:async(url,options)=>{if(options?.method==='POST')sent=JSON.parse(options.body);return{ok:true,json:async()=>({available:true})};}},
  '@expo/vector-icons':{Ionicons:'Icon'},'../components/CustomAlert':{showAlert(){}},
  '../components/ui':{PrimaryButton:'Primary',ScreenHeader:'Header'},'../constants/design':{colors:{}},
  '../components/WorkplaceField':{default:'Workplace',__esModule:true},
  '../components/WorkRegionField':{default:'Region',__esModule:true},'../utils/workRegion':regionModule.exports,
};
const component={exports:{}};
new Function('require','module','exports',compile('screens/RegisterScreen.js'))(name=>dependencies[name],component,component.exports);
function render(){cursor=0;tree=component.exports.default({onBack(){}});}
function nodes(){const all=[];function walk(n){if(Array.isArray(n))return n.forEach(walk);if(!n?.props)return;all.push(n);walk(n.props.children);}walk(tree);return all;}
const field=label=>nodes().find(n=>n.props.label===label);
const submit=()=>nodes().find(n=>n.type==='Primary');
function set(label,value){field(label).props.onChangeText(value);render();}
async function checkId(){await field('아이디').props.right.props.onPress();render();}
(async()=>{
 render();assert.equal(submit().props.disabled,true);
 set('아이디','signup_test');set('이름','테스트');set('비밀번호','test-password');set('비밀번호 확인','test-password');
 assert.equal(submit().props.disabled,true,'ID availability must be checked');
 await checkId();assert.equal(submit().props.disabled,false,'region, workplace and email are optional');
 for(const [label,value] of [['아이디','signup_test'],['이름','테스트'],['비밀번호','test-password'],['비밀번호 확인','test-password']]){
   set(label,'   ');assert.equal(submit().props.disabled,true,`${label} cannot be blank`);set(label,value);if(label==='아이디')await checkId();
 }
 const region=()=>nodes().find(n=>n.type==='Region');
 assert.equal(region().props.required,undefined);
 region().props.onChange({sido:'부산광역시',sigungu:'',gu:''});render();assert.equal(submit().props.disabled,true);
 region().props.onChange({sido:'',sigungu:'',gu:''});render();assert.equal(submit().props.disabled,false);
 await submit().props.onPress();assert.equal(sent.name,'테스트');assert.equal(sent.workSido,'');assert.equal(sent.workSigungu,'');
 console.log('Signup checks passed: required credentials/name/confirmation, checked ID and optional region');
})().catch(error=>{console.error(error);process.exitCode=1;});
