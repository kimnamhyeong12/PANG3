import { USER, LOCATIONS } from "../data/mockData";

export default function Main({ onRoute, onReport, onDashboard }) {
  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  const total = LOCATIONS.length;
  const complete = LOCATIONS.filter((loc) => loc.status === "complete").length;
  const pending = total - complete;
  const progress = Math.round((complete / total) * 100);

  return (
    <div className="flex flex-col min-h-full bg-[#F4F7FA]">
      <div className="px-5 pt-5 pb-5 bg-[#12395B] border-b-4 border-[#0F2E4A]">
        <div className="flex justify-between items-start mb-5">
          <div>
            <p className="text-[10px] font-bold tracking-[0.22em] text-white/60">
              SAHA-GU OFFICE
            </p>
            <h2 className="text-[23px] font-black text-white leading-tight mt-1">
              외근 업무 현황
            </h2>
            <p className="text-[10px] text-white/60 mt-1">
              {today} · 도시안전과
            </p>
          </div>

          <button
            onClick={onDashboard}
            className="flex items-center gap-2 px-3 py-2 rounded-xl active:scale-95 transition-all bg-white/10 border border-white/20"
          >
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-black text-sm">
              SG
            </div>
            <div className="text-left">
              <p className="text-white font-bold text-[11px]">{USER.name}</p>
              <p className="text-[9px] text-white/55">{USER.team}</p>
            </div>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth={2}
              className="w-3 h-3 opacity-50"
            >
              <polyline points="9,18 15,12 9,6" />
            </svg>
          </button>
        </div>

        <div className="bg-white/10 border border-white/15 rounded-2xl px-4 py-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold text-white">오늘 업무 진행률</p>
            <p className="text-[11px] font-black text-white">{progress}%</p>
          </div>
          <div className="h-2 rounded-full bg-white/15 overflow-hidden">
            <div
              className="h-full rounded-full bg-white"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[9px] text-white/60 mt-2">
            총 {total}건 중 {complete}건 완료, {pending}건 대기
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "총 방문지", val: total, sub: "Today" },
            { label: "완료", val: complete, sub: "Complete" },
            { label: "대기", val: pending, sub: "Pending" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl py-3 text-center bg-white border border-[#D9E1EA]"
            >
              <p className="text-[22px] font-black leading-none text-[#12395B]">
                {s.val}
              </p>
              <p className="text-[10px] mt-1 font-bold text-[#1F2D3D]">
                {s.label}
              </p>
              <p className="text-[8px] mt-0.5 text-[#718096]">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        <div>
          <p className="text-[11px] font-black tracking-[0.18em] text-[#607086] uppercase mb-3">
            Work Menu
          </p>

          <div className="space-y-3">
            {[
              {
                icon: "🗺️",
                title: "경로 설정 및 현장 업무",
                sub: "방문지 확인 · 최적 경로 · 현장 기록",
                fn: onRoute,
              },
              {
                icon: "📄",
                title: "보고서 생성 및 다운로드",
                sub: "현장 기록 검토 · 보고서 생성 · 전자 제출",
                fn: onReport,
              },
            ].map((m) => (
              <button
                key={m.title}
                onClick={m.fn}
                className="w-full flex items-center gap-4 p-4 rounded-2xl active:scale-[0.98] transition-all text-left bg-white border border-[#D9E1EA] shadow-sm"
              >
                <div className="w-12 h-12 rounded-xl bg-[#EAF1F7] flex items-center justify-center text-2xl flex-shrink-0">
                  {m.icon}
                </div>

                <div className="flex-1">
                  <p className="font-black text-[14px] text-[#1F2D3D]">
                    {m.title}
                  </p>
                  <p className="text-[10px] mt-1 text-[#718096]">{m.sub}</p>
                </div>

                <div className="w-8 h-8 rounded-full bg-[#EAF1F7] flex items-center justify-center flex-shrink-0">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    strokeWidth={2.5}
                    className="w-3.5 h-3.5 stroke-[#12395B]"
                  >
                    <polyline points="9,18 15,12 9,6" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-[#D9E1EA] rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E6EDF3] flex justify-between items-center">
            <div>
              <p className="text-[11px] font-black tracking-[0.16em] text-[#607086] uppercase">
                Recent Fieldwork
              </p>
              <p className="text-[13px] font-black text-[#1F2D3D] mt-1">
                최근 방문지
              </p>
            </div>
            <span className="text-[10px] font-bold text-[#12395B] bg-[#EAF1F7] px-3 py-1 rounded-full">
              {total}건
            </span>
          </div>

          {LOCATIONS.slice(0, 4).map((loc, i) => (
            <div
              key={loc.id}
              className="flex items-center gap-3 px-4 py-3"
              style={{
                borderBottom: i < 3 ? "1px solid #EEF3F7" : "none",
              }}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-black flex-shrink-0"
                style={{
                  background:
                    loc.status === "complete" ? "#1F9D55" : "#12395B",
                }}
              >
                {i + 1}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold truncate text-[#1F2D3D]">
                  {loc.name}
                </p>
                <p className="text-[9px] text-[#718096] mt-0.5">
                  {loc.address}
                </p>
              </div>

              <span
                className="text-[9px] px-2.5 py-1 rounded-full font-black flex-shrink-0"
                style={{
                  background:
                    loc.status === "complete" ? "#E9F8EF" : "#FFF4E2",
                  color: loc.status === "complete" ? "#1F9D55" : "#D97706",
                }}
              >
                {loc.status === "complete" ? "완료" : "대기"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="h-4" />
    </div>
  );
}