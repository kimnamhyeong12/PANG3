import { useState, useEffect, useRef } from "react";

import { BackIcon, CheckIcon } from "../components/Icons";

import {
 C,
 USER,
 LOCATIONS
} from "../data/mockData";

export function RouteSelectSheet({ onClose, onDirect, onUpload }) {
  return (
    <div
      className="absolute inset-0 z-40 flex flex-col justify-end"
      style={{ background:"rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full bg-white rounded-t-3xl shadow-2xl"
        style={{ paddingBottom:"env(safe-area-inset-bottom,12px)" }}
        onClick={e=>e.stopPropagation()}
      >
        {/* 드래그 핸들 */}
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-slate-200"/>
        </div>

        {/* 헤더 */}
        <div className="px-5 pt-2 pb-3 flex items-center justify-between border-b border-slate-100">
          <div>
            <p className="font-black text-gray-800 text-[15px]">방문지를 어떻게 등록할까요?</p>
            <p className="text-[10px] text-gray-400 mt-0.5">경로 설정 방법 선택</p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-gray-400 text-sm font-bold">✕</button>
        </div>

        {/* 선택 카드 */}
        <div className="px-4 pt-4 pb-3 space-y-3">
          {[
            { icon:"📍", title:"마커 직접 표시", sub:"MANUAL MARKER",
              desc:"지도에서 방문지를 직접 탭하여 마커를 추가합니다. 소수 방문지에 적합합니다.",
              tags:["빠른 시작","직관적","소규모"], color:C.primary, fn:onDirect },
            { icon:"📂", title:"파일 업로드", sub:"EXCEL IMPORT",
              desc:"방문지 주소가 담긴 엑셀(.xlsx) 파일을 업로드하면 카카오맵 API로 좌표 변환 후 자동 마커 표시합니다.",
              tags:["자동 변환","대규모","xlsx 지원"], color:C.teal, fn:onUpload },
          ].map(m=>(
            <button key={m.title} onClick={m.fn}
              className="w-full text-left rounded-2xl p-4 bg-white active:scale-[0.98] transition-all flex items-center gap-4"
              style={{ border:`2px solid ${m.color}20`, boxShadow:`0 2px 12px ${m.color}12` }}>
              <div className="w-13 h-13 w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
                style={{ background:m.color+"18" }}>{m.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-black text-[14px]" style={{ color:"#1a1a2e" }}>{m.title}</p>
                  <span className="text-[9px] font-bold" style={{ color:m.color }}>{m.sub}</span>
                </div>
                <p className="text-[10px] text-gray-500 leading-relaxed mb-2">{m.desc}</p>
                <div className="flex gap-1.5 flex-wrap">
                  {m.tags.map(t=>(
                    <span key={t} className="text-[9px] px-2 py-0.5 rounded-full font-bold"
                      style={{ background:m.color+"15", color:m.color }}>{t}</span>
                  ))}
                </div>
              </div>
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background:m.color+"18" }}>
                <svg viewBox="0 0 24 24" fill="none" strokeWidth={2.5} className="w-3.5 h-3.5" style={{ stroke:m.color }}>
                  <polyline points="9,18 15,12 9,6"/>
                </svg>
              </div>
            </button>
          ))}
        </div>

        {/* 하단 안내 */}
        <div className="mx-4 mb-4 rounded-2xl px-4 py-3 flex items-center gap-3"
          style={{ background:"#FFF9EC", border:"1px solid rgba(243,156,18,0.25)" }}>
          <span className="text-base">⚡</span>
          <p className="text-[10px] leading-relaxed flex-1" style={{ color:"#92400E" }}>
            어떤 방법이든 마커 등록 후 <strong>현재 위치 기준 최단 경로</strong>를 자동 계산합니다.
          </p>
        </div>
      </div>
    </div>
  );
}

export function UploadFlowScreen({ onBack, onComplete }) {
  const [step, setStep]             = useState("upload");
  const [uploadedName, setUploadedName] = useState("");
  const fileInputRef                = useRef(null);

  const MOCK_RESULT = LOCATIONS.map(l=>({ ...l }));

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedName(file.name);
    setStep("analyzing");
    setTimeout(()=>setStep("done"), 1600);
  };

  return (
    <div className="flex flex-col min-h-full" style={{ background:"#F0F4F8" }}>
      <div className="px-4 py-3 flex items-center gap-3 bg-white border-b border-slate-100 shadow-sm">
        <button onClick={onBack} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><BackIcon/></button>
        <div className="flex-1"><h2 className="font-bold text-gray-800 text-sm">파일 업로드</h2><p className="text-[10px] text-gray-400">엑셀 파일로 방문지 자동 등록</p></div>
        <div className="flex items-center gap-1">
          {["업로드","분석","완료"].map((s,i)=>(
            <div key={s} className="flex items-center gap-1">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold"
                style={{
                  background:(step==="upload"&&i===0)||(step==="analyzing"&&i===1)||(step==="done"&&i===2)
                    ? C.primary : (step==="done"&&i<2) ? C.green : "#E2E8F0",
                  color:(step==="upload"&&i===0)||(step==="analyzing"&&i===1)||(step==="done"&&i===2)||(step==="done"&&i<2)
                    ? "white":"#94A3B8",
                }}>{step==="done"&&i<2?"✓":i+1}</div>
              {i<2&&<div className="w-4 h-px" style={{ background:step==="done"&&i===0?C.green:"#E2E8F0" }}/>}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {step==="upload" && (
          <>
            <div className="bg-white rounded-2xl p-4 border border-slate-100" style={{ boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <p className="text-[9px] font-bold tracking-[0.12em] text-gray-400 uppercase mb-2">엑셀 파일 형식</p>
              <div className="rounded-xl overflow-hidden border border-slate-100">
                <table className="w-full text-[10px]">
                  <thead><tr style={{ background:C.primary }}>
                    <th className="py-2 px-3 text-left text-white font-bold">장소명</th>
                    <th className="py-2 px-3 text-left text-white font-bold">주소</th>
                  </tr></thead>
                  <tbody>
                    {[["낙동강 제방 점검","부산 사하구 장림동 123"],["감천항 시설 확인","부산 사하구 감천동 456"]].map((r,i)=>(
                      <tr key={i} style={{ background:i%2===0?"white":"#F8FAFC" }}>
                        <td className="py-2 px-3 text-gray-600">{r[0]}</td>
                        <td className="py-2 px-3 text-gray-400">{r[1]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div onClick={()=>fileInputRef.current?.click()}
              className="rounded-2xl py-12 flex flex-col items-center gap-3 cursor-pointer active:scale-[0.98] transition-all"
              style={{ border:`2px dashed ${C.primary}`, background:"rgba(27,108,168,0.03)" }}>
              <span className="text-5xl">📂</span>
              <p className="text-sm font-bold" style={{ color:"#1a1a2e" }}>엑셀 파일 선택</p>
              <p className="text-[10px]" style={{ color:"#94A3B8" }}>.xlsx / .xls — 클릭하거나 드래그</p>
              <div className="px-5 py-2 rounded-xl text-[11px] font-bold"
                style={{ background:C.primary+"18", color:C.primary }}>파일 선택하기</div>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange}/>
            </div>
          </>
        )}

        {step==="analyzing" && (
          <div className="flex flex-col items-center justify-center py-16 gap-5">
            <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background:C.primary+"14" }}>
              <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin"
                style={{ borderColor:`${C.primary} transparent transparent transparent` }}/>
            </div>
            <div className="text-center">
              <p className="font-bold text-gray-700 text-sm">{uploadedName}</p>
              <p className="text-[10px] text-gray-400 mt-1">카카오맵 API로 주소 좌표 변환 중…</p>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div className="h-full rounded-full animate-pulse"
                style={{ width:"65%", background:`linear-gradient(90deg,${C.primary},${C.teal})` }}/>
            </div>
            <p className="text-[9px] text-gray-400">5개 주소 처리 중 (3/5)</p>
          </div>
        )}

        {step==="done" && (
          <>
            <div className="rounded-2xl p-4 flex items-center gap-3"
              style={{ background:C.green+"14", border:`1.5px solid ${C.green}30` }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0"
                style={{ background:C.green+"20" }}>✅</div>
              <div>
                <p className="font-bold text-sm" style={{ color:C.green }}>분석 완료!</p>
                <p className="text-[10px] text-gray-500 mt-0.5">5개 주소 → 좌표 변환 성공</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden" style={{ boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <div className="px-4 py-3 border-b border-slate-50">
                <p className="text-[9px] font-bold tracking-[0.12em] text-gray-400 uppercase">📍 감지된 마커 (5개)</p>
              </div>
              {MOCK_RESULT.map((loc,i)=>(
                <div key={loc.id} className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom:i<MOCK_RESULT.length-1?"1px solid #F8FAFC":"none" }}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-black flex-shrink-0"
                    style={{ background:i===0?C.primary:i===1?C.green:C.gray }}>{i+1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-gray-700 truncate">{loc.name}</p>
                    <p className="text-[9px] text-gray-400">{loc.address}</p>
                  </div>
                  <span className="text-[8px] font-bold" style={{ color:C.teal }}>✓ 변환됨</span>
                </div>
              ))}
            </div>
            <button onClick={()=>onComplete(MOCK_RESULT)}
              className="w-full py-4 rounded-2xl text-white font-bold text-sm tracking-wide flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
              style={{ background:`linear-gradient(135deg,${C.primary},${C.teal})`, boxShadow:"0 4px 18px rgba(27,108,168,0.35)" }}>
              🗺️ 경로 최적화 시작하기
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function MapScreen({ onBack, onLocationClick, markers, fromDirect }) {
  const [showSheet, setShowSheet]   = useState(false);
  const [sel, setSel]               = useState(null);
  const [blink, setBlink]           = useState(true);
  const [optimizing, setOptimizing] = useState(!fromDirect);
  const [optimized, setOptimized]   = useState(false);
  const [routeOrder, setRouteOrder] = useState(markers.map((_,i)=>i));

  useEffect(()=>{
    const t = setInterval(()=>setBlink(b=>!b), 550);
    return ()=>clearInterval(t);
  }, []);

  useEffect(()=>{
    if (!optimizing) return;
    const t = setTimeout(()=>{
      setRouteOrder([0,2,4,1,3]);
      setOptimizing(false);
      setOptimized(true);
    }, 2000);
    return ()=>clearTimeout(t);
  }, [optimizing]);

  const orderedMarkers = routeOrder.map(i=>markers[i]).filter(Boolean);

  const pins = [
    {id:1,x:140,y:130},{id:2,x:82,y:185},
    {id:3,x:208,y:218},{id:4,x:165,y:80},{id:5,x:228,y:152},
  ];

  return (
    <div className="flex flex-col h-full" style={{ background:"#F0F4F8" }}>
      <div className="px-4 py-3 flex items-center gap-3 bg-white border-b border-slate-100 shadow-sm z-10">
        <button onClick={onBack} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><BackIcon/></button>
        <div className="flex-1">
          <h2 className="font-bold text-gray-800 text-sm">현장 지도</h2>
          <p className="text-[10px] text-gray-400">{optimizing?"경로 최적화 중…":optimized?"최적 경로 안내":"마커를 탭하여 업무 시작"}</p>
        </div>
        <div className="px-3 py-1 rounded-full" style={{ background:optimized?C.green+"18":"#EBF4FF" }}>
          <span className="text-[10px] font-bold" style={{ color:optimized?C.green:C.primary }}>
            {optimized?"✓ 최적화 완료":`${markers.length}개 방문지`}
          </span>
        </div>
      </div>

      {/* 경로최적화 로딩 오버레이 */}
      {optimizing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-30"
          style={{ background:"rgba(255,255,255,0.93)" }}>
          <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background:C.primary+"14" }}>
            <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin"
              style={{ borderColor:`${C.primary} transparent transparent transparent` }}/>
          </div>
          <p className="font-bold text-gray-700">경로 최적화 중…</p>
          <p className="text-[10px] text-gray-400">현재 위치 기준 최단 경로 계산 중</p>
          <div className="w-48 bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div className="h-full rounded-full animate-pulse"
              style={{ width:"70%", background:`linear-gradient(90deg,${C.primary},${C.teal})` }}/>
          </div>
        </div>
      )}

      {/* 최적화 완료 배너 */}
      {optimized && (
        <div className="px-3 py-2.5 flex items-center gap-2.5" style={{ background:C.green, flexShrink:0 }}>
          <span className="text-white text-sm">⚡</span>
          <p className="text-white text-[10px] font-bold flex-1">
            최적 경로 계산 완료 — 총 예상 이동시간 <span className="underline">약 52분</span>
          </p>
        </div>
      )}

      {/* 방문 순서 목록 */}
      <div className="px-4 py-2.5 bg-white border-b border-slate-100" style={{ flexShrink:0 }}>
        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
          {optimized?"최적 방문 순서":"방문지 목록"}
        </p>
        <div className="space-y-1 max-h-20 overflow-y-auto">
          {(optimized?orderedMarkers:markers).map((loc,i)=>(
            <div key={loc.id||i} className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0"
                style={{ background:loc.status==="complete"?C.green:i===0?C.primary:C.gray }}>{i+1}</div>
              <span className="text-[10px] text-gray-700 flex-1 truncate">{loc.name}</span>
              {loc.status==="complete"&&<span className="text-[8px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded-full font-bold">완료</span>}
              {i===0&&loc.status!=="complete"&&(
                <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{ background:optimized?C.primary+"18":C.red+"18", color:optimized?C.primary:C.red }}>
                  {optimized?"다음":"긴급"}
                </span>
              )}
            </div>
          ))}
        </div>
        {!optimized && !optimizing && (
          <button onClick={()=>setOptimizing(true)}
            className="w-full mt-2.5 py-2 rounded-xl text-white font-bold text-[10px] flex items-center justify-center gap-1.5 active:scale-[0.97] transition-all"
            style={{ background:`linear-gradient(135deg,${C.primary},${C.teal})` }}>
            ⚡ 경로 최적화 실행
          </button>
        )}
      </div>

      {/* 지도 캔버스 */}
      <div className="flex-1 relative overflow-hidden" style={{ background:"#dce8d4" }}>
        <svg className="absolute inset-0 w-full h-full" style={{ opacity:0.2 }}>
          {Array.from({length:20},(_,i)=>(<line key={`h${i}`} x1="0" y1={i*20} x2="400" y2={i*20} stroke="#608060" strokeWidth="0.5"/>))}
          {Array.from({length:20},(_,i)=>(<line key={`v${i}`} x1={i*20} y1="0" x2={i*20} y2="400" stroke="#608060" strokeWidth="0.5"/>))}
        </svg>
        <svg className="absolute inset-0 w-full h-full">
          <path d="M30,50 Q120,40 140,130 Q160,205 208,218 Q242,242 282,202" fill="none" stroke="#b4c8a4" strokeWidth="14"/>
          <path d="M30,50 Q120,40 140,130 Q160,205 208,218 Q242,242 282,202" fill="none" stroke="white" strokeWidth="9"/>
          <path d="M82,185 Q110,148 140,130 Q178,108 228,152" fill="none" stroke="#b4c8a4" strokeWidth="9"/>
          <path d="M82,185 Q110,148 140,130 Q178,108 228,152" fill="none" stroke="white" strokeWidth="6"/>
          {optimized&&(
            <path d="M148,122 L165,80 L228,152 L82,185 L208,218"
              fill="none" stroke={C.primary} strokeWidth="3" strokeDasharray="8,5" opacity="0.95"/>
          )}
        </svg>

        {pins.map((pin,pinIdx)=>{
          const loc  = markers[pinIdx];
          if (!loc) return null;
          const done = loc.status==="complete";
          const order= optimized?routeOrder.indexOf(pinIdx):pinIdx;
          const isNext=optimized&&order===0&&!done;
          return (
            <button key={pin.id}
              onClick={()=>{ setSel(loc); setShowSheet(true); }}
              className="absolute transform -translate-x-1/2 -translate-y-full active:scale-90 transition-transform"
              style={{ left:pin.x, top:pin.y, zIndex:isNext?10:1 }}>
              {isNext&&<div className="absolute -inset-3 rounded-full animate-ping" style={{ background:C.primary+"30" }}/>}
              <div className="w-8 h-8 rounded-full flex items-center justify-center shadow-lg border-2 border-white"
                style={{ background:done?C.green:isNext?C.primary:C.gray,
                  opacity:(isNext&&!blink)?0.55:1, transition:"opacity 0.3s" }}>
                <span className="text-white text-[10px] font-black">{optimized?order+1:pinIdx+1}</span>
              </div>
              <div className="mx-auto w-0 h-0"
                style={{ borderLeft:"4px solid transparent", borderRight:"4px solid transparent",
                  borderTop:`6px solid ${done?C.green:isNext?C.primary:C.gray}` }}/>
            </button>
          );
        })}

        <div className="absolute" style={{ left:150, top:118 }}>
          <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow">
            <div className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-50"/>
          </div>
        </div>

        {optimized&&(
          <div className="absolute top-3 left-3 right-3 bg-white rounded-xl shadow-md border border-blue-50 px-3 py-2.5 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background:C.primary+"15" }}>📍</div>
            <div>
              <p className="text-[10px] font-bold" style={{ color:C.primary }}>다음 방문지</p>
              <p className="text-[9px] text-gray-500">{orderedMarkers[0]?.name} — 마커를 눌러 시작</p>
            </div>
          </div>
        )}
      </div>

      {showSheet&&sel&&(
        <div className="absolute inset-0 bg-black/30 z-20 flex items-end" onClick={()=>setShowSheet(false)}>
          <div className="w-full bg-white rounded-t-3xl p-5 shadow-2xl" onClick={e=>e.stopPropagation()}>
            <div className="w-8 h-1 bg-slate-200 rounded-full mx-auto mb-4"/>
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background:C.primary+"15" }}>📍</div>
              <div>
                <p className="font-bold text-gray-800 text-sm">{sel.name}</p>
                <p className="text-[10px] text-gray-400">{sel.address}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                {label:"사진",icon:"📷",color:"#8B5CF6",type:"photo"},
                {label:"메모",icon:"📝",color:C.green,  type:"memo"},
                {label:"상태",icon:"🔄",color:C.orange, type:"status"},
              ].map(btn=>(
                <button key={btn.label}
                  onClick={()=>{ setShowSheet(false); onLocationClick(sel,btn.type); }}
                  className="flex flex-col items-center gap-2 py-4 rounded-xl active:scale-95 transition-all"
                  style={{ background:btn.color+"12" }}>
                  <span className="text-2xl">{btn.icon}</span>
                  <span className="text-xs font-bold" style={{ color:btn.color }}>{btn.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function FieldActionScreen({ location, actionType, onBack, onSave }) {
  const [memo, setMemo] = useState("");
  const [status, setStatus] = useState("pending");
  const [photos, setPhotos] = useState([]);
  const [tab, setTab] = useState(actionType||"photo");
  const [saved, setSaved] = useState(false);

  const save = () => { setSaved(true); setTimeout(()=>onSave({memo,status,photos}), 700); };
  const addPhoto = type => {
    const e = type==="camera"?["📸","🏗️","🌊","⚓","🏖️"]:["🖼️","🗺️","📊","🏭","🌿"];
    setPhotos(p=>[...p,{id:Date.now(),emoji:e[p.length%5],type}]);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-4 py-3 flex items-center gap-3" style={{ background:"linear-gradient(135deg,#1B6CA8,#134d7a)" }}>
        <button onClick={onBack} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"><BackIcon/></button>
        <div className="flex-1">
          <h2 className="font-bold text-white text-sm">현장 메모 입력</h2>
          <p className="text-blue-200 text-[9px]">{location?.name}</p>
        </div>
        <div className="text-right">
          <p className="text-white text-[10px] font-bold">{USER.name}, {USER.team}</p>
          <p className="text-blue-200 text-[9px]">Position: {USER.position}</p>
        </div>
      </div>

      <div className="flex border-b border-slate-100">
        {[{k:"photo",l:"사진",i:"📷"},{k:"memo",l:"메모",i:"📝"},{k:"status",l:"상태",i:"🔄"}].map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)}
            className="flex-1 py-3 text-[10px] font-bold transition-all border-b-2"
            style={{ borderBottomColor:tab===t.k?C.primary:"transparent", color:tab===t.k?C.primary:"#9CA3AF" }}>
            <span className="mr-1">{t.i}</span>{t.l}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {tab==="photo" && (
          <div>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-3">사진 등록 수단 선택</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button onClick={()=>addPhoto("gallery")}
                className="flex flex-col items-center gap-2 py-6 rounded-xl border-2 border-dashed active:scale-95 transition-all"
                style={{ borderColor:C.primary+"60", background:C.primary+"08" }}>
                <span className="text-3xl">🖼️</span>
                <span className="text-xs font-bold" style={{ color:C.primary }}>이미지 선택</span>
              </button>
              <button onClick={()=>addPhoto("camera")}
                className="flex flex-col items-center gap-2 py-6 rounded-xl border-2 border-dashed active:scale-95 transition-all"
                style={{ borderColor:"#8B5CF660", background:"#8B5CF608" }}>
                <span className="text-3xl">📷</span>
                <span className="text-xs font-bold text-purple-600">카메라 촬영</span>
              </button>
            </div>
            {photos.length>0 && (
              <>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-2">등록 사진 ({photos.length})</p>
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((p,i)=>(
                    <div key={p.id} className="aspect-square rounded-xl flex items-center justify-center relative"
                      style={{ background:i%2===0?"#EAF4F8":"#F0EEF8" }}>
                      <span className="text-3xl">{p.emoji}</span>
                      <div className="absolute bottom-1 inset-x-1 bg-black/40 rounded text-white text-[7px] text-center py-0.5">Caption {i+1}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {tab==="memo" && (
          <div>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-3">현장 메모</p>
            <textarea value={memo} onChange={e=>setMemo(e.target.value)}
              placeholder="현장 세부사항을 입력하세요&#10;&#10;예: 시설물 상태, 특이사항, 조치 내용 등"
              className="w-full h-44 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-gray-700 resize-none focus:outline-none"
              style={{ lineHeight:"1.7" }}/>
            <div className="flex justify-end mt-1">
              <span className="text-[9px] text-gray-300">{memo.length}/500</span>
            </div>
          </div>
        )}
        {tab==="status" && (
          <div>
            <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center font-black text-gray-500">{USER.name[0]}</div>
              <div>
                <p className="font-bold text-gray-700 text-xs">{USER.name}, {USER.team}</p>
                <p className="text-[9px] text-gray-400">Position: {USER.position}</p>
              </div>
            </div>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-3">상태 선택</p>
            <div className="space-y-2">
              {[
                {v:"pending",  l:"보류 (Pending)",  i:"⏳", c:C.orange},
                {v:"complete", l:"완료 (Complete)", i:"✅", c:C.green},
                {v:"absent",   l:"부재 (Absent)",   i:"🚫", c:C.red},
              ].map(opt=>(
                <button key={opt.v} onClick={()=>setStatus(opt.v)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 transition-all text-left"
                  style={{ borderColor:status===opt.v?opt.c:"#E5E7EB", background:status===opt.v?opt.c+"10":"white" }}>
                  <span className="text-xl">{opt.i}</span>
                  <span className="font-semibold text-sm text-gray-700 flex-1">{opt.l}</span>
                  {status===opt.v && (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-white" style={{ background:opt.c }}><CheckIcon/></div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-5 py-4 border-t border-slate-100">
        <button onClick={save}
          className="w-full py-4 rounded-xl text-white font-bold text-sm tracking-wide transition-all active:scale-[0.97]"
          style={{ background:saved?C.green:"linear-gradient(135deg,#1B6CA8,#134d7a)",
            boxShadow:`0 4px 20px ${saved?C.green:C.primary}40` }}>
          {saved ? <span className="flex items-center justify-center gap-2"><CheckIcon/>저장 완료!</span> : "저장 | SAVE"}
        </button>
      </div>
    </div>
  );
}
