const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const load=async file=>import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(__dirname,'../utils',file),'utf8')).toString('base64'));
(async()=>{
 const {dailyReturnChoice,koreaDay}=await load('dailyReturn.js');
 const data=new Map();const storage={getItem:async k=>data.get(k),setItem:async(k,v)=>data.set(k,v)};
 let questions=0;const decline=async()=>{questions++;return false;};
 assert.equal(await dailyReturnChoice(storage,7,decline,new Date('2026-10-25T14:59:59Z')),false);
 assert.equal(await dailyReturnChoice(storage,7,decline,new Date('2026-10-25T14:59:59Z')),false);assert.equal(questions,1);
 await dailyReturnChoice(storage,7,decline,new Date('2026-10-25T15:00:00Z'));assert.equal(questions,2,'Korea midnight asks again');
 await dailyReturnChoice(storage,8,decline,new Date('2026-10-25T15:00:00Z'));assert.equal(questions,3,'user decisions are isolated');
 assert.equal(koreaDay(new Date('2026-10-25T15:00:00Z')),'2026-10-26');
 const {reportMarkerLayoutSource}=await load('mapMarkerLayout.js');const layoutReportMarkers=vm.runInNewContext('('+reportMarkerLayoutSource+')');
 const points=[{n:1,x:180,y:240},{n:2,x:180,y:240},{n:3,x:300,y:400}];
 const arranged=layoutReportMarkers(points,400,700);assert.equal(arranged.length,3);assert.deepEqual(Array.from(arranged,l=>l.point.n),[1,2,3]);
 assert.deepEqual(arranged,layoutReportMarkers([...points].reverse(),400,700));
 assert(arranged[0].moved&&arranged[1].moved);assert.notDeepEqual([arranged[0].x,arranged[0].y],[arranged[1].x,arranged[1].y]);
 assert.deepEqual(points,[{n:1,x:180,y:240},{n:2,x:180,y:240},{n:3,x:300,y:400}],'real positions unchanged');
 const canonical=fs.readFileSync(path.join(__dirname,'../../backend/src/main/resources/report-marker-layout.js'),'utf8').split('export function createReportMarkerLayer')[0].trim();
 assert.equal(reportMarkerLayoutSource,canonical.replace(/\r\n/g,'\n').replace('export function','function'),'app uses same placement rules as report');
 // Compile the generated WebView script, not just the React file containing it.
 const parser=require('@babel/parser'), generate=require('@babel/generator').default;
 const ast=parser.parse(fs.readFileSync(path.join(__dirname,'../components/KakaoMapWebView.js'),'utf8'),{sourceType:'module',plugins:['jsx']});
 let build;for(const node of ast.program.body){if(node.type==='VariableDeclaration')for(const decl of node.declarations)if(decl.id.name==='buildKakaoMapHtml')build=decl.init;}
 const html=vm.runInNewContext('('+generate(build).code+')',{reportMarkerLayoutSource,KAKAO_JAVASCRIPT_KEY:'test',MY_LOCATION_LEVEL:5,ARRIVAL_DISTANCE_METERS:100})(35,129);
 for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
 assert(html.includes('arrangeVisitPins'));assert(html.includes('MARKER_PRESS'));
 const {isRegisteredPlace}=await load('placeSearch.js');const place={place_name:'공원',x:'129',y:'35'};
 assert.equal(isRegisteredPlace(place,[{detailAddress:'공원',lat:35,lng:129,status:'complete'}]),false,'completed address can be registered again');
 assert.equal(isRegisteredPlace(place,[{detailAddress:'공원',lat:35,lng:129,status:'pending'}]),true,'active address can be warned');
 console.log('PASS: daily decisions, Korea midnight, users, displaced pins, embedded WebView syntax, repeated addresses');
})().catch(e=>{console.error(e);process.exitCode=1;});
