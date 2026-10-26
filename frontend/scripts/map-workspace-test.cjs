const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('../node_modules/@babel/core');
const groups = [{ groupId: 1, workspaceType: 'PERSONAL' }, { groupId: 2, groupName: '현장팀' }];
let cursor = 0, slots = [], effects = [], tree, requests = 0, selections = [];
const react = {
  useState(initial) { const i=cursor++; slots[i] ??= {value:initial}; return [slots[i].value, value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;}]; },
  useRef(initial) { return slots[cursor++] ??= {current:initial}; },
  useEffect(fn,deps) { const i=cursor++; if(!slots[i] || deps.some((dep,j)=>dep!==slots[i].deps[j])) { slots[i]?.cleanup?.(); slots[i]={deps}; effects.push(()=>{slots[i].cleanup=fn();}); } },
};
const jsx=(type,props)=>({type,props:props||{}});
const dependencies = {
  react, 'react/jsx-runtime': {jsx,jsxs:jsx},
  'react-native': {useWindowDimensions:()=>({width:390,height:844}),ActivityIndicator:'Spinner',Modal:'Modal',Pressable:'Pressable',ScrollView:'ScrollView',Text:'Text',TouchableOpacity:'Button',View:'View',StyleSheet:{create:v=>v}},
  '@expo/vector-icons':{Ionicons:'Icon'},
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom:0})},
  '../utils/groupApi':{groupApi:async()=>{requests++;return groups;}},
  '../constants/design':{colors:{}},
};
const code=babel.transformSync(fs.readFileSync(path.join(__dirname,'../components/MapWorkspaceSwitcher.js'),'utf8'),{configFile:false,babelrc:false,plugins:[[require('../node_modules/@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],require('../node_modules/@babel/plugin-transform-modules-commonjs')]}).code;
const component={exports:{}};
new Function('require','module','exports',code)(name=>dependencies[name],component,component.exports);
const props={userId:7,activeGroup:groups[0],onSelect:async group=>selections.push(group)};
function render(){cursor=0;tree=component.exports.default(props);const pending=effects;effects=[];pending.forEach(fn=>fn());}
function nodes(){const all=[];function walk(n){if(Array.isArray(n))return n.forEach(walk);if(!n?.props)return;all.push(n);walk(n.props.children);}walk(tree);return all;}
async function settle(){for(let i=0;i<8;i++)await Promise.resolve();render();}
(async()=>{
  render();assert.equal(requests,0);
  const badge=()=>nodes().find(n=>n.props.accessibilityLabel?.startsWith('사용 중인 그룹:'));
  badge().props.onPress();render();await settle();assert.equal(requests,1);
  const rows=()=>nodes().filter(n=>n.type==='Button'&&n.props.accessibilityState?.selected!==undefined);
  assert.equal(rows().length,2);
  await rows()[0].props.onPress();render();assert.equal(selections.length,0,'current group closes without resetting its route');
  badge().props.onPress();render();await settle();
  await rows()[1].props.onPress();render();assert.deepEqual(selections,[groups[1]]);
  assert.equal(nodes().find(n=>n.type==='Modal').props.visible,false);
  console.log('Map workspace checks passed: load on open, current group preserved, selected group callback and close');
})().catch(error=>{console.error(error);process.exitCode=1;});
