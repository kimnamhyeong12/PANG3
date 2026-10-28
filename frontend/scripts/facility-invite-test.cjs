const assert = require('node:assert/strict');
const babel = require('../node_modules/@babel/core');
function load(file, dependencies) {
  const output={exports:{}};
  const code=babel.transformFileSync(require.resolve(file),{configFile:false,babelrc:false,plugins:[[require.resolve('../node_modules/@babel/plugin-transform-react-jsx'),{runtime:'classic'}],require.resolve('../node_modules/@babel/plugin-transform-modules-commonjs')]}).code;
  new Function('require','module','exports',code)(name=>{assert.ok(name in dependencies,name);return dependencies[name];},output,output.exports);
  return output.exports;
}
const {groupInviteToken}=load('../utils/groupInviteLinks.js',{});
const token='a'.repeat(43);
assert.equal(groupInviteToken(`https://pinwork.co.kr/join/${token}`),token);
assert.equal(groupInviteToken(`pang3://join?token=${token}`),token);
for(const value of [`https://attacker.test/join/${token}`,`http://pinwork.co.kr/join/${token}`,'pang3://join?token=short',`https://pinwork.co.kr/join/${token}/extra`])assert.equal(groupInviteToken(value),null);

function screen() {
  const slots=[],effects=[],calls=[];let cursor=0,tree,noGps=false;
  const react={
    useState(initial){const i=cursor++;slots[i]??={value:typeof initial==='function'?initial():initial};return [slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;}];},
    useRef(initial){return slots[cursor++]??={current:initial};},
    useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j]))){old?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=fn();});}},
    createElement(type,props,...children){return {type,props:{...props,children}};}
  };
  const native={StyleSheet:{create:v=>v},Platform:{OS:'android',Version:35}};
  for(const name of ['ActivityIndicator','Image','KeyboardAvoidingView','Modal','ScrollView','Text','TextInput','TouchableOpacity','View'])native[name]=name;
  const deps={react,'react-native':native,'react-native-safe-area-context':{SafeAreaProvider:'Provider',SafeAreaView:'SafeArea'},
    'expo-image-picker':{launchImageLibraryAsync:async()=>({canceled:false,assets:[{uri:'file:///map.png',fileName:'map.png'}]})},'expo-media-library/legacy':{},'expo-constants':{},'react-native-webview':{WebView:'WebView'},'expo-file-system':{File:class{size=200;}},
    '../components/ui':{ScreenHeader:'Header',PrimaryButton:'Action',SecondaryButton:'Action'},'../components/OriginalPhotoPicker':'Picker','../components/ReportDatePicker':'Calendar',
    '../utils/photoPermissions':{requestPhotoPermissions:async()=>({pickerAllowed:true})},'../utils/photoMetadata':{resolvePhotoMetadata:async asset=>noGps?{error:'GPS 없음'}:{...asset,lat:35.1,lng:129.2}},
    '../utils/photoRegistration':{photoAddress:async()=> '부산광역시 사하구'},'../utils/reportLocationMap':{getInteractiveMapHtml:()=>'<html></html>'},'../utils/completionDay':{koreaDayKey:()=> '2026-10-29'},
    '../utils/groupApi':{groupApi:async(path,options)=>{calls.push({path,options});return path.includes('?')?{items:[],hasMore:false}:{id:1};}},
    '../utils/auth':{apiFetch:()=>{},downloadProtectedFile:async()=> 'file:///image.jpg'},'../utils/api':{API_BASE_URL:'https://example.test'},'../constants/design':{colors:{}}
  };
  const Component=load('../screens/FacilityApplicationScreen.js',deps).default;
  function render(){cursor=0;tree=Component({user:{userId:1},onClose(){}});while(effects.length)effects.shift()();}
  function nodes(n=tree){if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(nodes);return [n,...nodes(n.props?.children)];}
  const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):n?.props?text(n.props.children):'';
  const button=label=>nodes().find(n=>n.props?.title===label)||nodes().find(n=>n.type==='TouchableOpacity'&&text(n).includes(label));
  async function settle(){for(let i=0;i<8;i++){await Promise.resolve();render();}}
  render();return {render,nodes,button,text:()=>text(tree),calls,settle,noGps:()=>{noGps=true;}};
}
(async()=>{
  const app=screen();
  // Invalid form must never send a request.
  const oldForm=global.FormData;global.FormData=class{constructor(){this.parts=[];}append(...value){this.parts.push(value);}};
  try {
    await app.button('등록 신청').props.onPress();app.render();assert.equal(app.calls.length,0);
    for(const [label,value]of [['시설물 이름','공원 소화전'],['시설 종류','소화전'],['상세 위치','공원 입구 오른쪽']]){app.nodes().find(n=>n.props?.accessibilityLabel===label).props.onChangeText(value);app.render();}
    await app.button('지도 스크린샷 선택').props.onPress();await app.settle();
    await app.nodes().find(n=>n.type==='Picker').props.onConfirm([{uri:'file:///original.jpg',fileName:'original.jpg',assetId:'photo1'}]);await app.settle();
    assert.ok(app.text().includes('위도 35.100000 · 경도 129.200000'),'selected photo coordinates are immediately visible');
    assert.ok(app.nodes().some(n=>n.type==='WebView'),'photo coordinates have a map preview');
    app.nodes().find(n=>n.props?.accessibilityRole==='checkbox').props.onPress();app.render();
    await app.button('등록 신청').props.onPress();await app.settle();
    const submitted=app.calls.find(call=>call.options?.method==='POST');assert.ok(submitted);
    assert.equal(submitted.path,'/api/facility-applications');assert.equal(submitted.options.body.parts.length,3);
    const application=JSON.parse(submitted.options.body.parts[0][1]);assert.equal(application.name,'공원 소화전');assert.equal(application.consent,true);assert.ok(!('photoLat' in application),'server must derive GPS from original bytes');
    assert.ok(app.calls.some(call=>call.path.includes('?page=0')),'submission opens own history');
    const bad=screen();bad.noGps();await bad.nodes().find(n=>n.type==='Picker').props.onConfirm([{uri:'file:///no-gps.jpg'}]);await bad.settle();assert.ok(bad.text().includes('GPS 없음'));assert.ok(!bad.nodes().some(n=>n.type==='WebView'));
    console.log('Facility and invite checks passed: trusted links, required fields, immediate photo GPS/map, multipart proof upload, own history, missing GPS rejection.');
  } finally {global.FormData=oldForm;}
})().catch(e=>{console.error(e);process.exitCode=1;});

