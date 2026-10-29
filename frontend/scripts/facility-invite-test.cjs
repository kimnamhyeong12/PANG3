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
  const slots=[],effects=[],calls=[];let cursor=0,tree,noGps=false,canceled=false,denied=false;
  const react={
    useState(initial){const i=cursor++;slots[i]??={value:typeof initial==='function'?initial():initial};return [slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;}];},
    useRef(initial){return slots[cursor++]??={current:initial};},
    useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j]))){old?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=fn();});}},
    createElement(type,props,...children){return {type,props:{...props,children}};}
  };
  const native={StyleSheet:{create:v=>v},Platform:{OS:'android',Version:35},Keyboard:{dismiss(){}},PermissionsAndroid:{check:async()=>!denied,request:async()=>denied?'denied':'granted',RESULTS:{GRANTED:'granted'}}};
  for(const name of ['ActivityIndicator','Image','KeyboardAvoidingView','Modal','ScrollView','Text','TextInput','TouchableOpacity','View'])native[name]=name;
  const deps={react,'react-native':native,'@expo/vector-icons':{Ionicons:'Icon'},'react-native-safe-area-context':{SafeAreaProvider:'Provider',SafeAreaView:'SafeArea'},
    'expo-image-picker':{},'expo-document-picker':{getDocumentAsync:async options=>{calls.push({pickerOptions:options});return {canceled,assets:[{uri:'content://documents/photo1',name:'original.jpg'}]};}},'../modules/kakao-navigation':{readFacilityOriginalPhoto:async uri=>{calls.push({nativePhotoUri:uri});if(noGps)throw new Error('위치정보가 있는 원본 사진을 선택해 주세요.');return {uri:'file:///original.jpg',fileName:'original.jpg',exif:{GPSLatitude:35.1,GPSLongitude:129.2}};}},'expo-media-library/legacy':{},'expo-constants':{},'react-native-webview':{WebView:'WebView'},'expo-file-system':{File:class{size=200;}},
    '../components/ui':{ScreenHeader:'Header',PrimaryButton:'Action',SecondaryButton:'Action'},'../components/ReportDatePicker':'Calendar',
    '../utils/photoPermissions':{requestPhotoPermissions:async()=>({pickerAllowed:true})},'../utils/photoMetadata':{resolvePhotoMetadata:async asset=>noGps?{error:'GPS 없음'}:{...asset,lat:35.1,lng:129.2}},
    '../utils/photoRegistration':{photoAddress:async()=> '부산광역시 사하구'},'../utils/reportLocationMap':{getInteractiveMapHtml:()=>'<html></html>'},'../utils/completionDay':{koreaDayKey:()=> '2026-10-29'},
    '../utils/groupApi':{groupApi:async(path,options)=>{calls.push({path,options});if(path==='/api/public-data/categories')return [{key:'aed',label:'심폐제세동기'},{key:'bus',label:'버스정류장'},{key:'facility-1',label:'공중화장실'}];return path.includes('?')?{items:[],hasMore:false}:{id:1};}},
    '../utils/auth':{apiFetch:()=>{},downloadProtectedFile:async()=> 'file:///image.jpg'},'../utils/api':{API_BASE_URL:'https://example.test'},'../constants/design':{colors:{textSoft:'#607195',danger:'#E34D59'}}
  };
  const Component=load('../screens/FacilityApplicationScreen.js',deps).default;
  function render(){cursor=0;tree=Component({user:{userId:1},onClose(){}});while(effects.length)effects.shift()();}
  function nodes(n=tree){if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(nodes);return [n,...nodes(n.props?.children)];}
  const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):n?.props?text(n.props.children):'';
  const button=label=>nodes().find(n=>n.props?.title===label)||nodes().find(n=>n.type==='TouchableOpacity'&&text(n).includes(label));
  async function settle(){for(let i=0;i<8;i++){await Promise.resolve();render();}}
  render();return {render,nodes,button,text:()=>text(tree),calls,settle,noGps:()=>{noGps=true;},cancel:()=>{canceled=true;},deny:()=>{denied=true;}};
}
(async()=>{
  const app=screen();
  const photoHint=app.nodes().find(n=>n.type==='Text'&&n.props.children?.includes('촬영 위치정보가 포함된 JPG·PNG 원본 사진을 선택해 주세요.'));
  assert.equal(photoHint.props.style.color,'#607195','photo hint always uses the normal gray color');
  const consent=()=>app.nodes().find(n=>n.props?.accessibilityRole==='checkbox');
  assert.equal(consent().props.accessibilityState.checked,false);
  app.nodes().find(n=>n.props?.accessibilityLabel==='정보 수집·이용 안내 전문보기').props.onPress();app.render();
  assert.ok(app.text().includes('신청자 정보와 증빙 사진은 공개되지 않습니다.'));
  assert.equal(consent().props.accessibilityState.checked,false,'viewing notice does not grant consent');
  app.nodes().find(n=>n.props?.accessibilityLabel==='정보 수집·이용 안내 전문보기').props.onPress();app.render();
  assert.ok(!app.text().includes('신청자 정보와 증빙 사진은 공개되지 않습니다.'));
  // Invalid form must never send a request.
  const oldForm=global.FormData;global.FormData=class{constructor(){this.parts=[];}append(...value){this.parts.push(value);}};
  try {
    await app.button('등록 신청').props.onPress();await app.settle();assert.ok(!app.calls.some(call=>call.options?.method==='POST'));
    for(const [label,value]of [['시설물 이름','공원 소화전']]){app.nodes().find(n=>n.props?.accessibilityLabel===label).props.onChangeText(value);app.render();}
    const chooseKind=value=>{app.nodes().find(n=>n.props?.accessibilityLabel==='시설 종류 선택').props.onPress();app.render();app.nodes().find(n=>n.props?.accessibilityRole==='radio'&&n.props.accessibilityLabel===value).props.onPress();app.render();};
    chooseKind('공중화장실');assert.ok(app.text().includes('공중화장실'));assert.ok(!app.nodes().some(n=>n.props?.accessibilityLabel==='새 시설 카테고리 이름'));
    chooseKind('직접 입력 (새 카테고리 요청)');
    assert.ok(app.button('등록 신청').props.disabled,'custom category requires a name');
    app.nodes().find(n=>n.props?.accessibilityLabel==='새 시설 카테고리 이름').props.onChangeText('소화전');app.render();
    chooseKind('버스정류장');chooseKind('직접 입력 (새 카테고리 요청)');assert.equal(app.nodes().find(n=>n.props?.accessibilityLabel==='새 시설 카테고리 이름').props.value,'소화전');
    assert.ok(!app.button('지도 스크린샷 선택'),'screenshot field is removed');
    await app.button('시설물 원본 사진 선택').props.onPress();await app.settle();
    assert.equal(app.calls.find(call=>call.pickerOptions).pickerOptions.copyToCacheDirectory,false,'read the selected original URI before any redacted copy');
    assert.equal(app.calls.find(call=>call.nativePhotoUri).nativePhotoUri,'content://documents/photo1');
    assert.ok(!app.nodes().some(n=>n.type==='Picker'),'never opens the empty gallery list');
    assert.ok(app.text().includes('위도 35.100000 · 경도 129.200000'),'selected photo coordinates are immediately visible');
    assert.ok(app.nodes().some(n=>n.type==='WebView'),'photo coordinates have a map preview');
    app.nodes().find(n=>n.props?.accessibilityRole==='checkbox').props.onPress();app.render();
    await app.button('등록 신청').props.onPress();await app.settle();
    const submitted=app.calls.find(call=>call.options?.method==='POST');assert.ok(submitted);
    assert.equal(submitted.path,'/api/facility-applications');assert.equal(submitted.options.body.parts.length,2);
    const application=JSON.parse(submitted.options.body.parts[0][1]);assert.equal(application.name,'공원 소화전');assert.equal(application.kind,'소화전');assert.equal(application.detailLocation,'','optional location can be empty');assert.equal(application.consent,true);assert.ok(!('photoLat' in application),'server must derive GPS from original bytes');
    assert.ok(app.calls.some(call=>call.path?.includes('?page=0')),'submission opens own history');
    const bad=screen();bad.noGps();await bad.button('시설물 원본 사진 선택').props.onPress();await bad.settle();assert.ok(!bad.button('원본 목록에서 다시 선택'),'no empty gallery fallback');assert.ok(bad.text().includes('위치정보가 있는 원본 사진을 선택해 주세요.'));assert.ok(!bad.nodes().some(n=>n.type==='WebView'));
    assert.equal(bad.nodes().find(n=>n.props?.accessibilityRole==='alert').props.style.color,'#E34D59','only the separate error is red');
    const cancel=screen();cancel.cancel();await cancel.button('시설물 원본 사진 선택').props.onPress();await cancel.settle();assert.ok(!cancel.calls.some(call=>call.nativePhotoUri),'cancel does not read a file');
    const denied=screen();denied.deny();await denied.button('시설물 원본 사진 선택').props.onPress();await denied.settle();assert.ok(!denied.calls.some(call=>call.pickerOptions),'permission denial is handled before selecting');
    console.log('Facility and invite checks passed: trusted links, required fields, immediate photo GPS/map, multipart proof upload, own history, missing GPS rejection.');
  } finally {global.FormData=oldForm;}
})().catch(e=>{console.error(e);process.exitCode=1;});

