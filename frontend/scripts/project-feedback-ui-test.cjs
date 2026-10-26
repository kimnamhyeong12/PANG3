const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const babel=require('../node_modules/@babel/core');
const jsx=(type,props)=>({type,props:props||{}});let slots=[],cursor=0;
const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useEffect(){},useRef(value){return{current:value};}};
const colors={surface:'#FFF',surfaceMuted:'#F4F8FF',text:'#10285B',textSoft:'#607195',primary:'#2477F3',line:'#DDD'};
const native=new Proxy({Dimensions:{get:()=>({height:844,width:390})},useWindowDimensions:()=>({height:800,width:390}),Keyboard:{dismiss(){},metrics:()=>undefined,addListener:()=>({remove(){}})},StyleSheet:{create:v=>v,absoluteFill:{},hairlineWidth:1},Platform:{OS:'android'}},{get:(o,k)=>o[k]||k});
function load(file,extra={}){const code=babel.transformSync(fs.readFileSync(path.join(__dirname,'../components',file),'utf8'),{filename:file,configFile:false,babelrc:false,plugins:[[require('../node_modules/@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],require('../node_modules/@babel/plugin-transform-modules-commonjs')]}).code;const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:name=>{if(name==='react')return react;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='react-native')return native;if(name==='@expo/vector-icons')return{Ionicons:'Icon'};if(name==='../constants/design')return{colors};if(name==='react-native-safe-area-context')return{useSafeAreaInsets:()=>({bottom:0})};if(name==='./CustomAlert')return extra[name]||{showAlert(){}};if(name==='../utils/calendar')return{currentMonthRange:()=>({start:'2026-10-01',end:'2026-10-31'}),selectRangeDate:(a,b,side,v)=>side==='start'?{start:v,end:b}:{start:a,end:v}};if(name==='../utils/projectApi')return extra[name]||{};if(name in extra)return extra[name];if(name.startsWith('@babel/runtime/'))return require(name);throw new Error(name);}});return module.exports.default;}
function nodes(n){if(!n||typeof n!=='object')return[];if(Array.isArray(n))return n.flatMap(nodes);return[n,...nodes(n.props?.children)];}
const Picker=load('ProjectPicker.js');const projects=Array.from({length:30},(_,i)=>({projectId:i+1,name:'공원 '+i}));let selected='unchanged';
slots=[projects,false,''];cursor=0;let tree=Picker({visible:true,userId:1,groupId:2,selectedId:1,onSelect:p=>selected=p,onClose(){}});let all=nodes(tree);
assert(!all.some(n=>n.type==='TextInput'),'selection popup must not expose project creation');
assert(all.some(n=>n.type==='ScrollView'),'many projects remain scrollable');
assert.equal(all.filter(n=>n.props.accessibilityState?.selected!==undefined).length,30,'registration has only projects and no none option');
slots=[projects,false,''];cursor=0;tree=Picker({visible:true,includeAll:true,onSelect:p=>selected=p,onClose(){}});all=nodes(tree);all.find(n=>n.type==='TouchableOpacity'&&n.props.accessibilityState?.selected).props.onPress();assert.equal(selected,null,'transfer can return to all work');
const Browser=load('ProjectBrowser.js',{'./ProjectPicker':Picker});slots=[];cursor=0;tree=Browser({selectOnly:true});assert.equal(tree.type,Picker,'all selectors use the centered picker');
slots=[];cursor=0;tree=Browser({visible:true});const Manager=tree.type;tree=Manager({visible:true,});all=nodes(tree);
assert(!all.some(n=>n.type==='KeyboardAvoidingView'),'card must not move with keyboard avoidance');
const input=all.find(n=>n.type==='TextInput');assert.equal(input.props.placeholderTextColor,colors.textSoft);
const Filters=load('ReportFilters.js',{'./ReportDatePicker':'DatePicker'});slots=[];cursor=0;let worker;tree=Filters({search:'',onSearchChange(){},worker:'',onWorkerChange:v=>worker=v,workers:[{value:'7',label:'작업자'}],dong:'',onDongChange(){},dongs:['다대동'],startDate:'2026-10-01',endDate:'2026-10-31',onDateChange(){}});all=nodes(tree);
for(const label of ['방문지 검색','작업자 선택','행정동 선택','시작일','종료일'])assert(all.some(n=>n.props.accessibilityLabel===label),label);
all.find(n=>n.props.accessibilityLabel==='작업자 선택').props.onPress();cursor=0;tree=Filters({worker:'',onWorkerChange:v=>worker=v,workers:[{value:'7',label:'작업자'}],dongs:[],onDateChange(){}});all=nodes(tree);const option=all.find(n=>n.type==='TouchableOpacity'&&nodes(n).some(child=>child.type==='Text'&&child.props.children==='작업자'));option.props.onPress();assert.equal(worker,'7');
console.log('PASS: centered project selection, no creation in picker, scrollable projects, transfer reset, visible keyboard input and shared report filters');

(async()=>{
 const alerts=[],calls=[],registered=[];
 const places=[{placeId:1,name:'동아대',activeTaskCount:1},{placeId:2,name:'공원',activeTaskCount:0}];
 let response=ids=>({created:ids.map(id=>({id})),skipped:[]});
 const RegisterBrowser=load('ProjectBrowser.js',{'./ProjectPicker':Picker,'./CustomAlert':{showAlert:(...args)=>alerts.push(args)},'../utils/projectApi':{
  registerProjectPlaces:async(projectId,userId,ids,allowActive)=>{calls.push({ids,allowActive});return response(ids);},fetchProjectPlaces:async()=>places,
 }});
 const RegisterManager=RegisterBrowser({}).type;
 const props={visible:true,userId:7,onClose(){},onRegistered:async rows=>registered.push(...rows)};
 const seed=(rows=places,ids=[])=>{slots=[[],{projectId:9,name:'공원'},rows,ids,'공원',false,'',800,null,400];};
 const render=()=>{cursor=0;return nodes(RegisterManager(props));};
 const assertCentered=rows=>{
  assert(['center','flex-start'].includes(rows.find(n=>n.props.accessibilityLabel==='프로젝트 카드 영역').props.style.justifyContent));
  assert(rows.some(n=>n.type==='View'&&n.props.style?.maxWidth===440&&n.props.style?.borderRadius===24));
 };
 const findButton=(rows,title)=>rows.find(n=>n.type==='TouchableOpacity'&&nodes(n).some(t=>t.type==='Text'&&t.props.children===title));
 slots=[];cursor=0;const entry=nodes(RegisterManager(props));assertCentered(entry);assert(entry.some(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='새 프로젝트 이름'));assert(findButton(entry,'만들기'));assert(!findButton(entry,'프로젝트 만들기'),'no extra creation step');
 seed();let rows=render();assertCentered(rows);const active=rows.find(n=>n.props.accessibilityRole==='checkbox'&&n.props.accessibilityLabel==='동아대');
 assert.equal(active.props.disabled,false,'ongoing work remains selectable');active.props.onPress();
 rows=render();assert.equal(rows.find(n=>n.props.accessibilityLabel==='동아대').props.accessibilityState.checked,true);
 assert.equal(calls.length,0,'checking a place must not create a task');
 await findButton(rows,'선택 등록 (1)').props.onPress();assert.equal(calls.length,0,'registration waits for confirmation');
 assert.equal(alerts.at(-1)[2][0].style,'cancel');assert.equal(slots[3][0],1,'cancel leaves selection intact');
 await alerts.at(-1)[2][1].onPress();assert.equal(calls.length,1);assert.equal(calls[0].allowActive,true);assert.equal(registered.length,1);
 seed(places,[2]);rows=render();await findButton(rows,'선택 등록 (1)').props.onPress();assert.equal(calls.at(-1).allowActive,false,'completed/inactive place needs no duplicate override');
 seed();rows=render();await findButton(rows,'전체 등록').props.onPress();assert.equal(alerts.at(-1)[0],'새 업무로 등록');
 await alerts.at(-1)[2][1].onPress();assert.deepEqual(Array.from(calls.at(-1).ids),[1,2],'all registration includes ongoing places');
 // Server catches a new task registered by another teammate after the list loaded.
 seed(places.map(p=>({...p,activeTaskCount:0})),[1,2]);response=()=>({created:[{id:2}],skipped:[1]});
 rows=render();await findButton(rows,'선택 등록 (2)').props.onPress();
 response=ids=>({created:ids.map(id=>({id})),skipped:[]});await alerts.at(-1)[2][1].onPress();
 assert.deepEqual(Array.from(calls.at(-1).ids),[1],'retry only skipped places after confirmation');assert.equal(calls.at(-1).allowActive,true);
 slots=[];cursor=0;rows=nodes(RegisterManager({...props,}));
 assert(['center','flex-start'].includes(rows.find(n=>n.props.accessibilityLabel==='프로젝트 카드 영역').props.style.justifyContent));
 assert(rows.some(n=>n.type==='View'&&n.props.style?.maxWidth===440),'creation uses a centered card');

 seed();rows=render();const frame=rows.find(n=>n.props.accessibilityLabel==='프로젝트 카드 영역');
 assert.equal(frame.props.style.justifyContent,'center');assert.equal(frame.props.style.height,800);
 assert.equal(frame.props.onLayout,undefined,'keyboard resize must not change the fixed viewport');
 const list=rows.find(n=>n.type==='ScrollView');assert.equal(list.props.style.maxHeight,350);assert.equal(list.props.style.flexShrink,undefined,'list does not shrink for the keyboard');
 console.log('PASS: centered fixed-height card and unchanged list size');
 console.log('PASS: active selection, deferred confirmation, cancel, selected/all registration, concurrent duplicate retry and centered creation');
})().catch(error=>{console.error(error);process.exitCode=1;});
