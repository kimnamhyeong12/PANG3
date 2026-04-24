import { useState } from "react";
import { BackIcon, CheckIcon, DlIcon } from "../components/Icons";
import { C, USER, MOCK_ENTRIES } from "../data/mockData";

export function ReportScreen({ onBack, onDownload }) {
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState(false);
  const create = () => { setCreating(true); setTimeout(()=>{ setCreating(false); setPreview(true); }, 1400); };

  if (preview) return <ReportPreview onBack={()=>setPreview(false)} onDownload={onDownload}/>;

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC]">
      <div className="px-4 py-3 flex items-center gap-3 bg-white border-b border-slate-100 shadow-sm">
        <button onClick={onBack} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><BackIcon/></button>
        <div>
          <h2 className="font-bold text-gray-800 text-sm">보고서 생성</h2>
          <p className="text-[10px] text-gray-400">검토 및 보고서 생성</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {MOCK_ENTRIES.map(e=>(
          <div key={e.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="flex gap-2 p-3 border-b border-slate-50">
              {e.photos.map((p,i)=>(
                <div key={i} className="w-14 h-14 rounded-lg bg-gradient-to-br from-slate-100 to-blue-50 flex items-center justify-center text-2xl">{p}</div>
              ))}
              <div className="flex-1 px-2">
                <p className="font-bold text-gray-700 text-xs">{e.name}</p>
                <p className="text-[9px] text-gray-400 mt-1 line-clamp-2">{e.memo}</p>
              </div>
            </div>
            <div className="px-3 py-2 flex items-center justify-between">
              <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wide">Status</span>
              <span className="text-[9px] px-2 py-0.5 rounded-full font-bold"
                style={{ background:e.status==="Complete"?C.green+"15":C.orange+"15",
                  color:e.status==="Complete"?C.green:C.orange }}>{e.status}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="px-5 py-4 border-t border-slate-100 bg-white">
        <button onClick={create}
          className="w-full py-4 rounded-xl text-white font-bold text-sm tracking-wide transition-all active:scale-[0.97] flex items-center justify-center gap-2"
          style={{ background:"linear-gradient(135deg,#1B6CA8,#134d7a)", boxShadow:"0 4px 20px rgba(27,108,168,0.35)" }}>
          {creating
            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>보고서 생성 중…</>
            : <>📄 보고서 생성 CREATE REPORT</>}
        </button>
      </div>
    </div>
  );
}

export function ReportPreview({ onBack, onDownload }) {
  const now = new Date().toLocaleDateString("ko-KR",{year:"numeric",month:"2-digit",day:"2-digit"});
  return (
    <div className="flex flex-col h-full bg-[#F8FAFC]">
      <div className="px-4 py-3 flex items-center gap-3 bg-white border-b border-slate-100 shadow-sm">
        <button onClick={onBack} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><BackIcon/></button>
        <div className="flex-1">
          <h2 className="font-bold text-gray-800 text-sm">보고서 미리보기</h2>
          <p className="text-[10px] text-gray-400">다운로드 전 최종 확인</p>
        </div>
        <div className="bg-blue-50 px-3 py-1 rounded-full">
          <span className="text-[10px] font-bold" style={{ color:C.primary }}>Preview</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden">
          {/* Doc header */}
          <div className="px-5 py-4 border-b border-slate-100"
            style={{ background:"linear-gradient(135deg,#1B6CA8 0%,#134d7a 100%)" }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-blue-200 text-[9px] font-bold tracking-widest">사하구청</p>
                <p className="text-white font-black text-base mt-0.5">현장 업무 보고서</p>
                <p className="text-blue-200 text-[9px] mt-1">FIELDWORK REPORT</p>
              </div>
              <div className="text-right">
                <p className="text-blue-200 text-[9px]">{now}</p>
                <p className="text-white text-[10px] font-bold mt-0.5">{USER.name}</p>
                <p className="text-blue-300 text-[8px]">{USER.department}</p>
              </div>
            </div>
          </div>
          {/* Summary */}
          <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
            {[{l:"총 방문지",v:"5"},{l:"완료",v:"2",c:C.green},{l:"미완료",v:"3",c:C.orange}].map(s=>(
              <div key={s.l} className="py-3 text-center">
                <p className="text-base font-black" style={{ color:s.c||C.primary }}>{s.v}</p>
                <p className="text-[8px] text-gray-400 mt-0.5">{s.l}</p>
              </div>
            ))}
          </div>
          {/* Entries */}
          <div className="divide-y divide-slate-50">
            {MOCK_ENTRIES.map((e,idx)=>(
              <div key={e.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-black flex-shrink-0 mt-0.5"
                    style={{ background:e.status==="Complete"?C.green:C.primary }}>{idx+1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="font-bold text-gray-800 text-xs">{e.name}</p>
                      <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0"
                        style={{ background:e.status==="Complete"?C.green+"15":C.orange+"15",
                          color:e.status==="Complete"?C.green:C.orange }}>{e.status}</span>
                    </div>
                    <div className="flex gap-1.5 mb-2">
                      {e.photos.map((p,i)=>(
                        <div key={i} className="w-12 h-10 rounded-lg flex items-center justify-center text-xl"
                          style={{ background:i%2===0?"#EAF4F8":"#F0EEF8" }}>{p}</div>
                      ))}
                    </div>
                    <p className="text-[9px] text-gray-500 leading-relaxed">{e.memo}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-between">
            <p className="text-[8px] text-gray-300">사하구청 외근 도우미 시스템</p>
            <p className="text-[8px] text-gray-300">Page 1 / 1</p>
          </div>
        </div>
        <p className="text-center text-[9px] text-gray-400 mt-3">내용을 확인 후 아래 버튼으로 다운로드하세요</p>
      </div>

      <div className="px-5 py-4 border-t border-slate-100 bg-white">
        <button onClick={onDownload}
          className="w-full py-4 rounded-xl text-white font-bold text-sm tracking-wide transition-all active:scale-[0.97] flex items-center justify-center gap-2"
          style={{ background:"linear-gradient(135deg,#1B6CA8,#3AAFA9)", boxShadow:"0 4px 20px rgba(27,108,168,0.35)" }}>
          <DlIcon/>다운로드 DOWNLOAD
        </button>
      </div>
    </div>
  );
}

export function DownloadScreen({ onBack }) {
  const [dling, setDling] = useState(null);
  const [done, setDone] = useState([]);
  const dl = key => { setDling(key); setTimeout(()=>{ setDling(null); setDone(p=>[...p,key]); }, 900); };
  const files = [
    {key:"rp",l:"Report PDF",  icon:"📄",c:"#E74C3C"},
    {key:"rx",l:"Report Excel",icon:"📊",c:"#27AE60"},
    {key:"lp",l:"Location PDF",icon:"📍",c:"#3498DB"},
    {key:"mp",l:"지도 PDF",    icon:"🗺️",c:"#9B59B6"},
    {key:"pe",l:"Photo Excel", icon:"🖼️",c:"#F39C12"},
  ];
  return (
    <div className="flex flex-col h-full bg-[#F8FAFC]">
      <div className="px-4 py-3 flex items-center gap-3 bg-white border-b border-slate-100 shadow-sm">
        <button onClick={onBack} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><BackIcon/></button>
        <div>
          <h2 className="font-bold text-gray-800 text-sm">다운로드</h2>
          <p className="text-[10px] text-gray-400">보고서 다운로드 및 공유</p>
        </div>
      </div>
      <div className="mx-4 mt-4 bg-white rounded-2xl shadow-sm border border-green-100 p-5 flex flex-col items-center">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mb-2"
          style={{ background:C.green+"15", border:`2.5px solid ${C.green}` }}>
          <span className="text-2xl">✅</span>
        </div>
        <p className="font-black text-gray-800">Successfull!</p>
        <p className="text-[10px] text-gray-400 mt-1">보고서 다운로드 및 공유</p>
      </div>
      <div className="mx-4 mt-3 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {files.map((f,i)=>(
          <div key={f.key}
            className={`flex items-center gap-3 px-4 py-3 ${i<files.length-1?"border-b border-slate-50":""}`}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
              style={{ background:f.c+"15" }}>{f.icon}</div>
            <span className="flex-1 text-sm font-semibold text-gray-700">{f.l}</span>
            <button onClick={()=>dl(f.key)}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90"
              style={{ background:done.includes(f.key)?C.green+"18":f.c+"15" }}>
              {dling===f.key
                ? <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>
                : done.includes(f.key)
                  ? <span style={{ color:C.green }}><CheckIcon/></span>
                  : <span style={{ color:f.c }}><DlIcon/></span>}
            </button>
          </div>
        ))}
      </div>
      <div className="mx-4 mt-3 space-y-2">
        <button className="w-full py-3.5 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2"
          style={{ background:"linear-gradient(135deg,#1B6CA8,#134d7a)", boxShadow:"0 4px 15px rgba(27,108,168,0.3)" }}>
          ✉️ EMAIL TO OFFICE
        </button>
        <button onClick={onBack}
          className="w-full py-3.5 rounded-xl font-bold text-sm text-gray-600 bg-white border border-slate-200">
          메인메뉴로 돌아가기
        </button>
      </div>
      <div className="h-6"/>
    </div>
  );
}
