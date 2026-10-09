import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Presentation, PresentationFile } from 'file:///C:/Users/t0102/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';

const ROOT='C:/PANG3-app';
const SKILL='C:/Users/t0102/.codex/plugins/cache/openai-primary-runtime/presentations/26.1007.11041/skills/presentations';
const PY='C:/Users/t0102/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const TMP=path.join(ROOT,'.presentation-build');
const OUT=path.join(ROOT,'output');
await fs.mkdir(TMP,{recursive:true}); await fs.mkdir(OUT,{recursive:true});
const ppt=Presentation.create({slideSize:{width:1280,height:720}});
const C={navy:'#18334E',teal:'#0C8D91',pale:'#EAF5F4',ink:'#20384E',muted:'#617589',line:'#CAD6DF',white:'#FFFFFF',soft:'#F5F9FB',orange:'#A66B19',red:'#9A5252'};
const FONT='Malgun Gothic';
const ICON_DIR=path.join(TMP,'icons');
const iconCache=new Map();
async function iconSvg(name,color){
 if(!iconCache.has(name)) iconCache.set(name,await fs.readFile(path.join(ICON_DIR,name+'.svg'),'utf8'));
 return iconCache.get(name).replaceAll('currentColor',color);
}
async function icon(s,name,x,y,size=30,color=C.teal){
 s.images.add({svg:await iconSvg(name,color),alt:`Lucide ${name} icon`,position:{left:x,top:y,width:size,height:size}});
}
function shape(s,geo,x,y,w,h,fill='none',stroke='none',sw=0){return s.shapes.add({geometry:geo,position:{left:x,top:y,width:w,height:h},fill,line:{style:'solid',fill:stroke,width:sw}})}
function txt(s,t,x,y,w,h,size=24,color=C.ink,bold=false,align='left'){
 const z=shape(s,'textbox',x,y,w,h);z.text=t;z.text.style={fontSize:size,typeface:FONT,color,bold,alignment:align,verticalAlignment:'middle',insets:0,autoFit:'shrinkText',wrap:'square'};return z;
}
function line(s,x,y,w,color=C.line,sw=1){shape(s,'rect',x,y,w,sw,color)}
function base(title,n,section=''){const s=ppt.slides.add();s.background.fill=C.white;shape(s,'rect',0,0,1280,9,C.teal);txt(s,title,64,35,1150,60,34,C.navy,true);line(s,64,108,1152);if(section)txt(s,section,64,663,850,25,15,C.muted);txt(s,String(n).padStart(2,'0'),1160,661,55,24,15,C.muted,false,'right');return s}
function note(s,t){s.speakerNotes.text=t}
function box(s,x,y,w,h,fill=C.soft,stroke=C.line,sw=1){return shape(s,'rect',x,y,w,h,fill,stroke,sw)}
function placeholder(s,x,y,w,h,label='사진 삽입'){box(s,x,y,w,h,C.white,C.line,2);txt(s,label,x+12,y+h/2-14,w-24,28,16,C.muted,false,'center')}
function card(s,x,y,w,h,title,body,num=''){box(s,x,y,w,h,C.soft,C.line,1);if(num)txt(s,num,x+20,y+16,38,32,19,C.teal,true);txt(s,title,x+(num?62:20),y+17,w-(num?80:40),34,23,C.navy,true);line(s,x+20,y+60,w-40,C.line,1);txt(s,body,x+20,y+75,w-40,h-90,20,C.ink)}
function bullets(s,arr,x,y,w,sz=22,gap=37){arr.forEach((v,i)=>{shape(s,'ellipse',x,y+i*gap+11,7,7,C.teal);txt(s,v,x+20,y+i*gap,w-20,gap-3,sz,C.ink)})}
async function threeColumn(s,items){const xs=[64,461,858];for(const [i,it] of items.entries()){const x=xs[i];await icon(s,it.icon,x,140,30,C.teal);txt(s,it.title,x+42,138,314,35,25,C.navy,true);line(s,x,182,356,C.teal,3);bullets(s,it.lines,x,197,356,20,32);placeholder(s,x+93,318,170,300,'앱 화면 삽입')}}
function comparison(title,n,before,after,kind='영상'){const s=base(title,n,'사하구청 현장 피드백 반영');const xs=[64,656];['BEFORE','AFTER'].forEach((v,i)=>{txt(s,v,xs[i],133,535,37,26,i?C.teal:C.navy,true);line(s,xs[i],180,535,i?C.teal:C.line,2)});placeholder(s,64,205,535,301,kind+' 삽입');placeholder(s,656,205,535,301,kind+' 삽입');bullets(s,before,64,526,535,20,31);bullets(s,after,656,526,535,20,31);return s}

// Cover
{
 const s=ppt.slides.add();s.background.fill=C.white;shape(s,'rect',0,0,1280,12,C.teal);txt(s,'PANG3',68,116,620,110,78,C.navy,true);shape(s,'rect',68,245,92,6,C.teal);txt(s,'2026년 2학기 중간발표',68,274,850,70,38,C.ink,true);txt(s,'지도 기반 사하구 외근 도우미',68,369,850,48,27,C.muted);txt(s,'개발 성과 · 현장 피드백 · 개선 결과 · 향후 계획',68,563,1040,36,21,C.teal);await icon(s,'map-pin',1000,155,100,C.teal);note(s,'도입 약 8초. 2학기 개발 성과와 10월 1일 사하구청 현장 피드백을 중심으로 발표하겠습니다.');
}
// 1
{
 const s=base('지도 기반 사하구 외근 도우미',1,'서비스 소개');txt(s,'현장 업무의 전 과정을 하나로 연결하는 통합 관리 서비스',64,132,1150,76,31,C.navy,true);
 const names=['방문지 관리','경로 최적화','현장 업무 처리','보고서 작성'];const icons=['map-pin','route','clipboard-check','file-text'];for(const [i,v] of names.entries()){const x=64+(i%2)*574,y=250+Math.floor(i/2)*132;box(s,x,y,548,106,C.pale,'none');await icon(s,icons[i],x+22,y+33,39,C.teal);txt(s,v,x+77,y+24,446,57,27,C.navy,true)}
 txt(s,'외근 계획  →  현장 방문  →  업무 처리  →  결과 보고',64,580,1150,40,22,C.teal,true);note(s,'약 20초. PANG3는 방문지 관리부터 보고서 작성까지 외근의 흐름을 하나로 연결합니다. 기능 소개는 짧게 마치고 2학기 결과로 넘어갑니다.');
}
// 2
{
 const s=base('1학기 MVP 구현 완료',2,'1학기 구현 성과');const a=['로그인 및 회원가입','지도 기반 방문지 추가','목적지 리스트 관리','다중 목적지 경로 최적화','차량·도보 경로 안내','도착 후 작업 시작','작업 상태 실시간 변경','현장 사진·메모 입력','보고서 생성'];
 const icons=['shield-check','map-pin','list-todo','route','navigation','circle-check','workflow','notebook-pen','file-text'];for(const [i,v] of a.entries()){const x=64+(i%3)*392,y=145+Math.floor(i/3)*163;box(s,x,y,366,137,C.soft,C.line,1);txt(s,String(i+1).padStart(2,'0'),x+19,y+18,50,32,19,C.teal,true);await icon(s,icons[i],x+317,y+19,29,C.teal);txt(s,v,x+19,y+55,330,63,23,C.navy,true)}note(s,'약 18초. 1학기에 기본 업무 흐름을 구성하는 9개 기능의 MVP를 완성했습니다. 이번 학기에는 현장 사용성과 협업 기능을 보강했습니다.');
}
// 3
{
 const s=base('2학기 주요 개발 과정',3,'8월부터 10월까지');const items=[['8월','현장 기록 기능 고도화',['사진 편집','위치도 편집','음성 입력']],['9월','그룹 협업 및 업무 관리',['그룹 생성·초대·업무 관리','행정동 경계·업무 현황','대시보드·업무 데이터 관리']],['10월','경로 안내 및 서비스 개선',['경로 안내 개선','공공데이터 연동','UI/UX 개선']]];
 for(const [i,it] of items.entries()){const x=64+i*392;box(s,x,156,366,442,i===2?C.pale:C.soft,C.line,1);txt(s,it[0],x+23,182,110,56,38,C.teal,true);await icon(s,['image','users-round','navigation'][i],x+304,184,34,C.teal);txt(s,it[1],x+23,254,318,72,27,C.navy,true);line(s,x+23,343,320,C.line,1);bullets(s,it[2],x+23,366,318,19,60)}note(s,'약 21초. 8월에는 현장 기록, 9월에는 그룹과 업무 관리, 10월에는 경로 안내와 서비스 화면을 개선했습니다. 월 구분은 발표를 위한 분류입니다.');
}
// 4-6
{
 const s=base('8월 — 현장 기록 기능 고도화',4,'2학기 개발 성과');await threeColumn(s,[{title:'사진 편집',icon:'image',lines:['사진 회전·크롭','빨간펜 표시']},{title:'위치도 편집',icon:'map-pinned',lines:['위치도 수정','문제 위치 표시']},{title:'음성 입력',icon:'mic',lines:['음성 인식 기반','현장 메모 입력']}]);note(s,'약 23초. 사진과 위치도를 현장에서 바로 편집하고, 음성 인식으로 메모를 입력할 수 있도록 기록 절차를 보강했습니다.');
}
{
 const s=base('9월 — 그룹 협업 및 업무 관리',5,'2학기 개발 성과');await threeColumn(s,[{title:'그룹 생성·업무 관리',icon:'users-round',lines:['구성원 초대','방문지 배정·업무 이관']},{title:'행정동·업무 현황',icon:'map',lines:['SGIS 행정동 경계','개인·그룹별 현황 지도']},{title:'대시보드·데이터',icon:'layout-dashboard',lines:['개인·그룹별 업무 현황','완료 기록·업무 데이터']}]);note(s,'약 25초. 그룹을 만들고 구성원을 초대하는 기능, 행정동 경계와 업무 현황 지도, 완료 기록을 관리하는 대시보드를 추가했습니다.');
}
{
 const s=base('10월 — 경로 안내 및 서비스 개선',6,'2학기 개발 성과');await threeColumn(s,[{title:'경로 안내 개선',icon:'navigation',lines:['Kakao 도보 경로 연동','출입구 기반 도착 지점']},{title:'공공데이터 연동',icon:'database',lines:['버스 정류장·AED','부산 건물 출입구']},{title:'UI/UX 개선',icon:'mouse-pointer-click',lines:['지도 중심 화면 개편','등록·현장 작업 흐름 개선']}]);note(s,'약 25초. 도보 경로와 건물 출입구를 활용해 도착 지점을 개선했습니다. 버스 정류장과 AED 정보를 연동하고, 지도 중심으로 화면 흐름을 다시 구성했습니다.');
}
// 7: field meeting photo bridge
{
 const s=base('사하구청 현장 미팅',7,'2026년 10월 1일');
 await icon(s,'users-round',64,139,31,C.teal);
 txt(s,'현장 담당자의 의견을 들었습니다',108,131,1106,48,28,C.navy,true);
 placeholder(s,64,205,548,355,'현장 미팅 사진 삽입');
 placeholder(s,638,205,548,355,'현장 미팅 사진 삽입');
 txt(s,'이 자리에서 확인한 6가지 주요 피드백',64,593,1150,43,23,C.teal,true);
 note(s,'약 12초. 10월 1일 사하구청 현장 미팅을 진행했습니다. 담당자의 의견을 듣고 개선할 내용을 정리했습니다. 다음 장에서 주요 피드백을 말씀드리겠습니다.');
}
// 8
{
 const s=base('사하구청 현장 미팅 주요 피드백',8,'2026년 10월 1일');const data=[['UI/UX 간소화','클릭 감소 · 지도 중심 · 위도·경도 제거'],['위치 등록 정확도','터치 즉시 지정 한계 · 핀 위치 정밀 조정'],['그룹·업무 협업','팀장 중심 배정 축소 · 개인 관리\n지역별 업무 이관'],['일괄 등록·공유','엑셀 일괄 등록 · 사진 위치정보 활용\n업무 데이터 가져오기·내보내기'],['공공데이터 한계','제설함·아파트 내부 시설물 위치데이터 부족\n사하구청 정비 후 활용'],['플랫폼·저장','모바일·웹 · 외부 서버 저장 최소화\n보고서 로컬 다운로드·저장']];
 const icons=['mouse-pointer-click','map-pin','users-round','file-up','database','monitor-smartphone'];for(const [i,d] of data.entries()){const x=64+(i%2)*575,y=137+Math.floor(i/2)*155;box(s,x,y,548,132,C.soft,C.line);txt(s,String(i+1).padStart(2,'0'),x+18,y+17,40,30,19,C.teal,true);txt(s,d[0],x+60,y+17,420,32,23,C.navy,true);await icon(s,icons[i],x+498,y+18,29,C.teal);txt(s,d[1],x+20,y+63,510,58,19,C.ink)}note(s,'약 30초. 사하구청 미팅에서 화면 간소화, 위치 정확도, 협업 방식, 데이터 일괄 등록, 공공데이터의 한계, 플랫폼과 저장 방식에 대한 의견을 받았습니다.');
}
// 9
{
 const s=base('현장 피드백 반영 현황',9,'O 해결 · △ 진행 중 · X 미해결');const rows=[['UI/UX 간소화','O'],['위치 등록 정확도 개선','O'],['그룹 및 업무 협업 개선','O'],['방문지 일괄 등록 및 공유','X'],['공공데이터의 한계','X'],['플랫폼 및 저장 방식 개선','O']];
 await icon(s,'list-todo',1166,51,30,C.teal);box(s,64,143,1150,72,C.navy,'none');txt(s,'현장 피드백 항목',88,158,850,40,23,C.white,true);txt(s,'상태',1040,158,120,40,23,C.white,true,'center');rows.forEach((r,i)=>{const y=215+i*66;box(s,64,y,1150,66,i%2?C.white:C.soft,C.line,1);txt(s,r[0],88,y+10,870,46,22,C.ink);txt(s,r[1],1040,y+10,120,46,28,r[1]==='O'?C.teal:C.red,true,'center')});note(s,'약 20초. 네 항목은 해결했고 일괄 등록·공유와 공공시설물 데이터는 아직 남아 있습니다. 다음 장부터 반영한 네 가지 내용을 보여드리겠습니다.');
}
// 10-12
{
 const s=comparison('현장 피드백 반영 ① UI/UX 간소화',10,['복잡한 화면 이동','여러 단계의 업무 등록'],['로그인 후 지도 중심 화면','간소화된 업무 처리','위도·경도 정보 제거']);await icon(s,'mouse-pointer-click',1166,51,30,C.teal);note(s,'약 24초. 기존에는 화면 이동과 등록 단계가 많았습니다. 지도 화면을 중심으로 재구성하고 좌표 표시를 빼서 필요한 작업에 집중하도록 했습니다.');
}
{
 const s=comparison('현장 피드백 반영 ② 위치 등록 정확도',11,['지도 터치 시 위치 즉시 지정','세부 위치 조정이 어려움'],['중앙 포인터로 위치 지정','지도를 이동해 정밀하게 조정']);await icon(s,'map-pin',1166,51,30,C.teal);note(s,'약 23초. 지도 터치만으로 위치가 바로 결정되던 방식에서 중앙 포인터 방식으로 바꿨습니다. 지도를 이동하면서 세부 위치를 조정할 수 있습니다.');
}
{
 const s=comparison('현장 피드백 반영 ③ 그룹 협업 개선',12,['팀장 중심 방문지 배정','팀장이 구성원에게 개별 배정'],['개인 중심 업무 관리','필요한 업무를 구성원에게 이관','행정동 단위 업무 관리']);await icon(s,'users-round',1166,51,30,C.teal);note(s,'약 25초. 팀장이 모든 방문지를 개별 배정하는 흐름을 줄이고, 각자의 업무를 관리하면서 필요한 건을 이관하도록 바꿨습니다. 행정동 단위 관리도 반영했습니다.');
}
// 13
{
 const s=base('현장 피드백 반영 ④ 플랫폼 및 저장 방식',13,'모바일 화면과 웹 화면 비교');await icon(s,'monitor-smartphone',1166,51,30,C.teal);txt(s,'BEFORE',64,130,535,40,26,C.navy,true);txt(s,'AFTER',656,130,535,40,26,C.teal,true);placeholder(s,205,188,250,368,'모바일 앱 사진 삽입');placeholder(s,656,188,535,302,'웹 실행 화면 삽입');txt(s,'모바일 중심 서비스',64,579,535,35,22,C.ink);txt(s,'웹 환경으로 서비스 확장',656,520,535,35,22,C.ink);txt(s,'보고서 로컬 다운로드·저장 방식 개선',656,555,535,35,21,C.ink);note(s,'약 22초. 모바일 중심으로 제공하던 서비스를 웹 환경으로 넓혔습니다. 보고서를 기기에서 내려받고 저장하는 흐름도 개선했습니다.');
}
// 14
{
 const s=base('기말발표까지의 개발 및 검증 계획',14,'다음 단계');const rows=[['01','미완료 피드백 반영','일괄 등록·공유 · 공공시설물 데이터 · 알림 기능'],['02','실제 현장 업무 시뮬레이션','방문지 등록 · 경로 최적화 · 방문·처리 · 보고서'],['03','최종 피드백 반영','결과 점검 · 현장 담당자 피드백 · 오류·사용성 개선'],['04','앱 출시 준비','안정화 · 최종 테스트 · 배포 환경 점검']];for(const [i,r] of rows.entries()){const y=140+i*125;box(s,64,y,1150,105,i%2?C.white:C.soft,C.line,1);txt(s,r[0],88,y+20,70,55,29,C.teal,true);await icon(s,['list-todo','route','message-square','rocket'][i],166,y+28,31,C.teal);txt(s,r[1],212,y+17,370,35,25,C.navy,true);txt(s,r[2],212,y+56,966,32,20,C.ink)}note(s,'약 25초. 남은 일괄 등록과 시설물 데이터, 알림 기능을 마무리합니다. 이어서 전체 현장 업무를 시뮬레이션하고 담당자 의견과 테스트 결과를 반영해 출시를 준비하겠습니다.');
}
// 15
{
 const s=base('PANG3 실제 앱 시연',15,'시연 시간 1분 30초');await icon(s,'presentation',1166,51,30,C.teal);placeholder(s,210,137,860,484,'시연 영상 또는 화면 삽입');txt(s,'방문지 등록   →   경로 최적화   →   현장 업무 처리   →   보고서 확인   →   그룹 업무 관리',64,630,1150,30,21,C.navy,true,'center');note(s,'1분 30초 시연. 방문지를 등록하고 경로를 최적화한 뒤 현장 업무를 처리합니다. 보고서를 확인하고 그룹 업무 관리 화면으로 마무리합니다.');
}

for(let i=0;i<ppt.slides.items.length;i++){
 const blob=await ppt.export({slide:ppt.slides.items[i],format:'png',scale:1});
 await fs.writeFile(path.join(TMP,`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await blob.arrayBuffer()));
}
const draft=path.join(TMP,'candidate.pptx');await(await PresentationFile.exportPptx(ppt)).save(draft);
const {finalizePresentation}=await import(pathToFileURL(path.join(SKILL,'container_tools/artifact_tool_utils.mjs')).href);
const finalPath=path.join(OUT,'PANG3_2026_2학기_중간발표_아이콘추가.pptx');
const result=await finalizePresentation({workspaceDir:ROOT,candidatePath:draft,finalPath,pythonExecutable:PY,integrityValidatorPath:path.join(SKILL,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(SKILL,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit'],requestedContentSlideCount:15,requiredNativeTableOwnerSlides:[],requiredNativeChartOwnerSlides:[],fontPolicy:{basis:'design',families:[FONT]},verifyArtifactToolImport:true,receiptPath:path.join(TMP,'validation-icons.json')});
console.log(JSON.stringify({slides:ppt.slides.items.length,finalPath,result}));
