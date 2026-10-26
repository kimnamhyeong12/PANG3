const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const babel = require('../node_modules/@babel/core');
function screen(platform = 'android') {
  const slots = [], effects = [], alerts = [], requests = [], picked = [], uploads = [], focused = [], storage = new Map();
  let cursor = 0, tree, dirty = false, nextPick, infoCalls = 0;
  const same = (a,b) => a && b && a.length === b.length && a.every((v,i) => Object.is(v,b[i]));
  const react = {
    useState(value) { const i=cursor++; slots[i] ||= {value}; return [slots[i].value, value => {slots[i].value=typeof value==='function'?value(slots[i].value):value;dirty=true;}]; },
    useRef(value) { const i=cursor++; return slots[i] ||= {current:value}; },
    useEffect(fn,deps) {const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)) effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()};});},
  };
  const jsx=(type,props)=>({type,props:props||{}});
  const cache=new Map();
  function load(file) {
    file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;
    const module={exports:{}};cache.set(file,module);
    const native={Platform:{OS:platform,Version:36},StyleSheet:{create:s=>s},AppState:{addEventListener:()=>({remove(){}})},Alert:{alert:(...a)=>alerts.push(a)},PermissionsAndroid:{check:async()=>true,RESULTS:{GRANTED:'granted'}},Linking:{openSettings:async()=>{}}};
    for(const n of ['View','Text','Image','TextInput','TouchableOpacity','ScrollView','Modal','ActivityIndicator','KeyboardAvoidingView'])native[n]=n;
    const requireMock=name=>{
      if(name==='react')return react;
      if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'Fragment'};
      if(name==='react-native')return native;
      if(name==='react-native-safe-area-context')return {useSafeAreaInsets:()=>({bottom:20})};
      if(name==='@expo/vector-icons')return {Ionicons:'Icon'};
      if(name==='expo-constants')return {executionEnvironment:'standalone'};
      if(name==='expo-image-picker')return {launchImageLibraryAsync:async options=>{picked.push(options);return nextPick;},getMediaLibraryPermissionsAsync:async()=>({granted:true})};
      if(name==='expo-media-library/legacy')return {getPermissionsAsync:async()=>({granted:true}),getAssetInfoAsync:async()=>{infoCalls++;return {location:{latitude:35.2,longitude:129.1}};}};
      if(name==='expo-image-manipulator')return {SaveFormat:{JPEG:'jpeg'},manipulateAsync:async()=>({uri:'file:///converted.jpg'})};
      if(name==='@react-native-async-storage/async-storage')return {getItem:async key=>storage.get(key)||null,setItem:async(key,value)=>storage.set(key,value),removeItem:async key=>storage.delete(key)};
      if(name==='expo-file-system')return {Paths:{document:'file:///documents'},Directory:class {constructor(...parts){this.uri=parts.join('/');this.exists=true;}create(){}delete(){this.exists=false;}},File:class {constructor(...parts){this.uri=parts.map(part=>part.uri||part).join('/');this.exists=true;}copy(){}delete(){this.exists=false;}}};
      if(name.endsWith('/ui'))return {ScreenHeader:'Header',PrimaryButton:'Primary',SecondaryButton:'Secondary',EmptyState:'Empty'};
      if(name.includes('CustomAlert'))return {showAlert:(...args)=>alerts.push(args)};
      if(name.includes('ReportLocationPicker'))return {__esModule:true,default:'LocationPicker'};
      if(name.endsWith('/screenBack'))return {useScreenBackHandler:()=>{}};
      if(name.endsWith('/auth'))return {apiFetch:async(url,options)=>{
        requests.push({url,options});
        if(url.includes('coord2address'))return {ok:true,json:async()=>({documents:[{road_address:{address_name:'부산 테스트 주소'}}]})};
        uploads.push(options.body.fields);return {ok:true,json:async()=>({taskId:uploads.length,progressId:uploads.length})};
      }};
      if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.js'));
      throw Error(name);
    };
    const code=babel.transformSync(fs.readFileSync(file,'utf8'),{configFile:false,babelrc:false,plugins:[[require('../node_modules/@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],require('../node_modules/@babel/plugin-transform-modules-commonjs')]}).code;
    vm.runInNewContext(code,{module,exports:module.exports,require:requireMock,process:{env:{EXPO_PUBLIC_KAKAO_REST_API_KEY:'test'}},console,setTimeout,clearTimeout,AbortController,
      FormData:class {fields={};append(k,v){this.fields[k]=v;}}},{filename:file});return module.exports;
  }
  const Screen=load(path.join(__dirname,'../screens/PhotoUploadScreen.js')).default;
  const props={visible:true,userId:1,groupId:2,apiBaseUrl:'https://api.test',onDataChanged:async()=>{},onRegistered:p=>focused.push(p),onClose:()=>{props.visible=false;},initialLocation:{lat:35,lng:129}};
  function render(){let tries=0;do{dirty=false;cursor=0;tree=Screen(props);while(effects.length)effects.shift()();if(++tries>25)throw Error('render loop');}while(dirty);return tree;}
  function nodes(node,out=[]){if(!node)return out;if(Array.isArray(node)){node.forEach(n=>nodes(n,out));return out;}if(typeof node==='object'){out.push(node);nodes(node.props?.children,out);}return out;}
  const find=(type,test=()=>true)=>nodes(tree).find(n=>n.type===type&&test(n.props));
  async function settle(){for(let i=0;i<8;i++){await new Promise(r=>setImmediate(r));render();}}
  return {render,find,settle,props,picked,uploads,focused,alerts,requests,infoCalls:()=>infoCalls,setPick:p=>nextPick=p,load};
}
(async()=>{
  for(const platform of ['android','ios']){
    const app=screen(platform);app.render();await app.settle();
    const asset={uri:'file:///first.jpg',assetId:'first',fileName:'first.jpg',exif:{GPSLatitude:35.1,GPSLongitude:129.1}};
    app.setPick({canceled:false,assets:[asset]});await app.find('Modal').props.onShow();await app.settle();
    await app.find('Primary').props.onPress();await app.settle();
    assert.equal(app.picked.length,1);assert.equal(app.picked[0].exif,true);assert.equal(app.picked[0].allowsMultipleSelection,true);
    app.find('TextInput').props.onChangeText('');app.render();
    assert.equal(app.find('Primary').props.disabled,true,'empty name blocks saving');
    app.find('TextInput').props.onChangeText('내 방문지');app.render();assert.equal(app.find('Primary').props.disabled,false);
    app.setPick({canceled:false,assets:[asset,{uri:'file:///no-gps.jpg',fileName:'missing.jpg',exif:{}},
      {uri:'file:///second.jpg',fileName:'second.jpg',exif:{GPSLatitude:35.2,GPSLongitude:129.2}}]});
    const add=app.find('TouchableOpacity',p=>p.children?.props?.children==='사진 추가');await add.props.onPress();await app.settle();
    assert.equal(app.find('TextInput').props.value,'내 방문지','duplicate selection preserves edited name');
    assert.equal(app.find('Primary').props.disabled,false,'photos with confirmed GPS remain registerable while another photo needs a location');
    const missing=app.find('TouchableOpacity',p=>String(p.children?.props?.children).includes('촬영 위치 확인됨'));missing.props.onPress();app.render();
    const picker=app.find('LocationPicker');assert(picker);picker.props.onCancel();app.render();assert.equal(app.find('LocationPicker'),undefined);
    missing.props.onPress();app.render();app.find('LocationPicker').props.onConfirm({latitude:35.3,longitude:129.2,locationAddress:'직접 고른 주소'});app.render();
    const inputs=[];function visit(n){if(!n)return;if(Array.isArray(n))return n.forEach(visit);if(n.type==='TextInput')inputs.push(n);visit(n.props?.children);}visit(app.render());inputs[1].props.onChangeText('둘째 방문지');app.render();
    assert.equal(app.find('Primary').props.disabled,false);await app.find('Primary').props.onPress();await app.settle();
    assert.equal(app.uploads.length,2);assert.equal(app.uploads[0].lat,'35.3');assert.equal(app.uploads[0].roadAddress,'직접 고른 주소');
    assert(app.uploads.every(body=>body.createdByUserId==='1' && body.groupId==='2'), 'photo registration preserves the uploader and selected workspace');
    await app.alerts.at(-1)[2].find(button=>button.text==='지도 보기').onPress();assert.equal(app.focused[0].length,2);assert.equal(app.props.visible,false);
    const fallback=screen(platform);fallback.render();await fallback.find('Modal').props.onShow();await fallback.settle();fallback.setPick({canceled:false,assets:[{uri:'file:///fallback.jpg',assetId:'original',exif:{}}]});await fallback.find('Primary').props.onPress();await fallback.settle();assert.equal(fallback.infoCalls(),1,'original GPS lookup works on both platforms');
    const cancel=screen(platform);cancel.render();await cancel.find('Modal').props.onShow();await cancel.settle();cancel.setPick({canceled:true});await cancel.find('Primary').props.onPress();await cancel.settle();assert(cancel.find('Empty'));assert.equal(cancel.find('Primary').props.disabled,false);
    console.log('PASS '+platform+': native picker, EXIF, names, add/deduplicate, missing GPS, location cancel/confirm, multipart upload, map return, original metadata, cancel.');
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
