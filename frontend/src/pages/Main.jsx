import { C, USER, LOCATIONS } from "../data/mockData";

export default function Main({ onRoute, onReport, onDashboard }) {
  const today = new Date().toLocaleDateString("ko-KR",{year:"numeric",month:"long",day:"numeric",weekday:"short"});
  return (
    <div className="flex flex-col min-h-full" style={{ background:"#F0F4F8" }}>
      {/* Hero Header */}
      <div className="relative overflow-hidden px-5 pt-4 pb-6"
        style={{ background:"linear-gradient(160deg,#0f3460 0%,#1B6CA8 60%,#3AAFA9 100%)" }}>
        {/* 배경 장식 원 */}
        <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full"
          style={{ background:"rgba(255,255,255,0.05)" }}/>
        <div className="absolute -bottom-6 left-10 w-24 h-24 rounded-full"
          style={{ background:"rgba(58,175,169,0.15)" }}/>

        <div className="relative z-10">
          {/* 상단 브랜드 + 프로필 */}
          <div className="flex justify-between items-start mb-5">
            <div>
              <p className="text-[9px] font-bold tracking-[0.22em] mb-1"
                style={{ color:"rgba(255,255,255,0.55)" }}>SAHA-GU FIELDWORK</p>
              <h2 className="text-[22px] font-black tracking-tight leading-tight"
                style={{ color:"white" }}>대시보드</h2>
              <p className="text-[9px] mt-1" style={{ color:"rgba(255,255,255,0.5)" }}>{today}</p>
            </div>
            <button onClick={onDashboard}
              className="flex items-center gap-2 px-3 py-2 rounded-2xl active:scale-95 transition-all"
              style={{ background:"rgba(255,255,255,0.14)", border:"1px solid rgba(255,255,255,0.2)" }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-sm"
                style={{ background:"rgba(255,255,255,0.25)", color:"white" }}>{USER.name[0]}</div>
              <div className="text-left">
                <p className="text-white font-bold text-[11px]">{USER.name}</p>
                <p className="text-[9px]" style={{ color:"rgba(255,255,255,0.55)" }}>{USER.team}</p>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="w-3 h-3 ml-0.5 opacity-50">
                <polyline points="9,18 15,12 9,6"/>
              </svg>
            </button>
          </div>

          {/* 통계 카드 */}
          <div className="grid grid-cols-3 gap-2">
            {[
              {label:"총 방문지", val:"8",  bg:"rgba(255,255,255,0.14)", border:"rgba(255,255,255,0.18)"},
              {label:"완료",      val:"3",  bg:"rgba(39,174,96,0.3)",    border:"rgba(39,174,96,0.4)",   valColor:"#7fffb0"},
              {label:"미완료",   val:"5",  bg:"rgba(243,156,18,0.28)",  border:"rgba(243,156,18,0.4)",  valColor:"#ffd87a"},
            ].map(s=>(
              <div key={s.label} className="rounded-2xl py-3 text-center"
                style={{ background:s.bg, border:`1px solid ${s.border}` }}>
                <p className="text-[22px] font-black leading-none"
                  style={{ color:s.valColor||"white" }}>{s.val}</p>
                <p className="text-[9px] mt-1 font-medium"
                  style={{ color:"rgba(255,255,255,0.65)" }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* 섹션 레이블 */}
        <p className="text-[9px] font-bold tracking-[0.18em] uppercase"
          style={{ color:"#94A3B8" }}>주요 메뉴</p>

        {/* 메뉴 카드 */}
        {[
          {icon:"🗺️", title:"경로 설정 및 현장 업무", sub:"VIEW OPTIMIZED ROUTE", color:C.primary, fn:onRoute},
          {icon:"📄", title:"보고서 생성 및 다운로드", sub:"MY REPORTS",           color:C.teal,   fn:onReport},
        ].map(m=>(
          <button key={m.title} onClick={m.fn}
            className="w-full flex items-center gap-4 p-4 rounded-2xl active:scale-[0.98] transition-all text-left"
            style={{ background:"white", border:"1.5px solid #F1F5F9",
              boxShadow:"0 2px 10px rgba(0,0,0,0.06)" }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
              style={{ background:m.color+"14" }}>{m.icon}</div>
            <div className="flex-1">
              <p className="font-bold text-sm" style={{ color:"#1a1a2e" }}>{m.title}</p>
              <p className="text-[9px] font-semibold mt-0.5 tracking-[0.08em]"
                style={{ color:"#94A3B8" }}>{m.sub}</p>
            </div>
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background:m.color+"14" }}>
              <svg viewBox="0 0 24 24" fill="none" strokeWidth={2.5} className="w-3.5 h-3.5"
                style={{ stroke:m.color }}>
                <polyline points="9,18 15,12 9,6"/>
              </svg>
            </div>
          </button>
        ))}

        {/* 최근 방문지 */}
        <p className="text-[9px] font-bold tracking-[0.18em] uppercase pt-1"
          style={{ color:"#94A3B8" }}>최근 방문지</p>
        <div className="rounded-2xl overflow-hidden"
          style={{ background:"white", border:"1px solid #F1F5F9",
            boxShadow:"0 2px 10px rgba(0,0,0,0.06)" }}>
          {LOCATIONS.slice(0,4).map((loc,i)=>(
            <div key={loc.id}
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom:i<3?"1px solid #F8FAFC":"none" }}>
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-black flex-shrink-0"
                style={{ background:loc.status==="complete"?C.green:C.primary }}>{i+1}</div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold truncate" style={{ color:"#1e293b" }}>{loc.name}</p>
                <p className="text-[9px]" style={{ color:"#94A3B8" }}>{loc.address}</p>
              </div>
              <span className="text-[9px] px-2 py-0.5 rounded-full font-bold flex-shrink-0"
                style={{
                  background:loc.status==="complete"?C.green+"18":C.orange+"18",
                  color:loc.status==="complete"?C.green:C.orange,
                }}>
                {loc.status==="complete"?"완료":"대기"}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="h-4"/>
    </div>
  );
}
