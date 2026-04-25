import { useState } from "react";
import { BackIcon, CheckIcon, DlIcon } from "../components/Icons";
import { USER, MOCK_ENTRIES } from "../data/mockData";

export function ReportScreen({ onBack, onDownload }) {
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState(false);

  const create = () => {
    setCreating(true);
    setTimeout(() => {
      setCreating(false);
      setPreview(true);
    }, 1200);
  };

  if (preview) {
    return <ReportPreview onBack={() => setPreview(false)} onDownload={onDownload} />;
  }

  return (
    <div className="flex flex-col h-full bg-[#F4F7FA]">
      <div className="px-4 py-3 flex items-center gap-3 bg-white border-b border-[#D9E1EA]">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-[#EAF1F7] flex items-center justify-center active:scale-95"
        >
          <BackIcon />
        </button>

        <div className="flex-1">
          <p className="text-[10px] font-bold tracking-[0.18em] text-[#607086]">
            SAHA-GU OFFICE
          </p>
          <h2 className="font-black text-[#1F2D3D] text-[16px]">
            보고서 생성
          </h2>
          <p className="text-[10px] text-[#718096]">
            현장 기록 검토 및 전자보고서 작성
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <div className="bg-[#12395B] rounded-2xl p-4 shadow-sm">
          <p className="text-[11px] font-bold text-white/70">
            보고서 생성 대상
          </p>
          <p className="text-2xl font-black text-white mt-1">
            현장 업무 기록 {MOCK_ENTRIES.length}건
          </p>
          <p className="text-[10px] text-white/60 mt-1">
            사진, 메모, 처리 상태를 취합하여 보고서를 생성합니다.
          </p>
        </div>

        <p className="text-[11px] font-black tracking-[0.18em] text-[#607086] uppercase">
          Field Records
        </p>

        {MOCK_ENTRIES.map((e, idx) => (
          <div
            key={e.id}
            className="bg-white rounded-2xl shadow-sm border border-[#D9E1EA] overflow-hidden"
          >
            <div className="flex gap-3 p-4 border-b border-[#EEF3F7]">
              <div className="w-7 h-7 rounded-full bg-[#12395B] text-white text-[10px] font-black flex items-center justify-center flex-shrink-0">
                {idx + 1}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex justify-between gap-2">
                  <p className="font-black text-[#1F2D3D] text-sm truncate">
                    {e.name}
                  </p>
                  <span
                    className="text-[9px] px-2 py-0.5 rounded-full font-black flex-shrink-0"
                    style={{
                      background:
                        e.status === "Complete" ? "#E9F8EF" : "#FFF4E2",
                      color: e.status === "Complete" ? "#1F9D55" : "#D97706",
                    }}
                  >
                    {e.status === "Complete" ? "완료" : "대기"}
                  </span>
                </div>

                <p className="text-[10px] text-[#718096] mt-1 line-clamp-2">
                  {e.memo}
                </p>
              </div>
            </div>

            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex gap-2">
                {e.photos.map((p, i) => (
                  <div
                    key={i}
                    className="w-11 h-11 rounded-xl bg-[#EAF1F7] border border-[#D9E1EA] flex items-center justify-center text-xl"
                  >
                    {p}
                  </div>
                ))}
              </div>

              <span className="text-[9px] text-[#607086] font-bold">
                첨부 {e.photos.length}건
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 py-4 border-t border-[#D9E1EA] bg-white">
        <button
          onClick={create}
          className="w-full py-4 rounded-xl text-white font-black text-sm tracking-wide transition-all active:scale-[0.97] flex items-center justify-center gap-2 bg-[#12395B]"
          style={{
            boxShadow: "0 8px 18px rgba(18,57,91,.22)",
          }}
        >
          {creating ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              보고서 생성 중...
            </>
          ) : (
            <>보고서 생성</>
          )}
        </button>
      </div>
    </div>
  );
}

export function ReportPreview({ onBack, onDownload }) {
  const now = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return (
    <div className="flex flex-col h-full bg-[#F4F7FA]">
      <div className="px-4 py-3 flex items-center gap-3 bg-white border-b border-[#D9E1EA]">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-[#EAF1F7] flex items-center justify-center active:scale-95"
        >
          <BackIcon />
        </button>

        <div className="flex-1">
          <p className="text-[10px] font-bold tracking-[0.18em] text-[#607086]">
            REPORT PREVIEW
          </p>
          <h2 className="font-black text-[#1F2D3D] text-[16px]">
            보고서 미리보기
          </h2>
          <p className="text-[10px] text-[#718096]">
            다운로드 전 최종 확인
          </p>
        </div>

        <span className="text-[10px] font-bold text-[#12395B] bg-[#EAF1F7] px-3 py-1 rounded-full">
          Preview
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="bg-white rounded-2xl border border-[#D9E1EA] shadow-md overflow-hidden">
          <div className="px-5 py-4 bg-[#12395B]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-white/60 text-[9px] font-bold tracking-widest">
                  사하구청
                </p>
                <p className="text-white font-black text-base mt-0.5">
                  현장 업무 보고서
                </p>
                <p className="text-white/60 text-[9px] mt-1">
                  FIELDWORK REPORT
                </p>
              </div>

              <div className="text-right">
                <p className="text-white/60 text-[9px]">{now}</p>
                <p className="text-white text-[10px] font-bold mt-0.5">
                  {USER.name}
                </p>
                <p className="text-white/50 text-[8px]">
                  {USER.department}
                </p>
              </div>
            </div>
          </div>

          <div className="px-5 py-3 border-b border-[#E6EDF3] bg-[#F8FAFC]">
  <div className="grid grid-cols-3 gap-3 text-[9px]">

    <div>
      <p className="text-[#718096]">문서번호</p>
      <p className="font-bold text-[#1F2D3D] mt-0.5">
        SAHA-FW-2026-0425
      </p>
    </div>

    <div>
      <p className="text-[#718096]">작성부서</p>
      <p className="font-bold text-[#1F2D3D] mt-0.5">
        도시안전과
      </p>
    </div>

    <div>
      <p className="text-[#718096]">작성자</p>
      <p className="font-bold text-[#1F2D3D] mt-0.5">
        {USER.name}
      </p>
    </div>

  </div>
</div>

          <div className="grid grid-cols-3 divide-x divide-[#E6EDF3] border-b border-[#E6EDF3]">
            {[
              { l: "기록 건수", v: "5" },
              { l: "완료", v: "2", c: "#1F9D55" },
              { l: "미완료", v: "3", c: "#D97706" },
            ].map((s) => (
              <div key={s.l} className="py-3 text-center">
                <p
                  className="text-base font-black"
                  style={{ color: s.c || "#12395B" }}
                >
                  {s.v}
                </p>
                <p className="text-[8px] text-[#718096] mt-0.5">{s.l}</p>
              </div>
            ))}
          </div>

          <div className="divide-y divide-[#EEF3F7]">
            {MOCK_ENTRIES.map((e, idx) => (
              <div key={e.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-black flex-shrink-0 mt-0.5"
                    style={{
                      background:
                        e.status === "Complete" ? "#1F9D55" : "#12395B",
                    }}
                  >
                    {idx + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="font-black text-[#1F2D3D] text-xs">
                        {e.name}
                      </p>
                      <span
                        className="text-[8px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0"
                        style={{
                          background:
                            e.status === "Complete" ? "#E9F8EF" : "#FFF4E2",
                          color:
                            e.status === "Complete" ? "#1F9D55" : "#D97706",
                        }}
                      >
                        {e.status === "Complete" ? "완료" : "대기"}
                      </span>
                    </div>

                    <div className="flex gap-1.5 mb-2">
                      {e.photos.map((p, i) => (
                        <div
                          key={i}
                          className="w-12 h-10 rounded-lg bg-[#EAF1F7] border border-[#D9E1EA] flex items-center justify-center text-xl"
                        >
                          {p}
                        </div>
                      ))}
                    </div>

                    <p className="text-[9px] text-[#607086] leading-relaxed">
                      {e.memo}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="px-5 py-3 bg-[#F8FAFC] border-t border-[#E6EDF3] flex justify-between">
            <p className="text-[8px] text-[#A0AEC0]">
              사하구청 외근 도우미 시스템
            </p>
            <p className="text-[8px] text-[#A0AEC0]">Page 1 / 1</p>
          </div>
        </div>

        <p className="text-center text-[9px] text-[#718096] mt-3">
          내용을 확인 후 아래 버튼으로 다운로드하세요
        </p>
      </div>

      <div className="px-5 py-4 border-t border-[#D9E1EA] bg-white">
        <button
          onClick={onDownload}
          className="w-full py-4 rounded-xl text-white font-black text-sm tracking-wide transition-all active:scale-[0.97] flex items-center justify-center gap-2 bg-[#12395B]"
          style={{
            boxShadow: "0 8px 18px rgba(18,57,91,.22)",
          }}
        >
          <DlIcon />
          다운로드
        </button>
      </div>
    </div>
  );
}

export function DownloadScreen({ onBack }) {
  const [dling, setDling] = useState(null);
  const [done, setDone] = useState([]);

  const dl = (key) => {
    setDling(key);
    setTimeout(() => {
      setDling(null);
      setDone((p) => [...p, key]);
    }, 900);
  };

  const files = [
    { key: "rp", l: "현장 업무 보고서 PDF", icon: "📄", c: "#12395B" },
    { key: "rx", l: "방문지 목록 Excel", icon: "📊", c: "#1F9D55" },
    { key: "lp", l: "방문 위치 PDF", icon: "📍", c: "#1F6FAE" },
    { key: "mp", l: "경로 지도 PDF", icon: "🗺️", c: "#607086" },
    { key: "pe", l: "사진 첨부 Excel", icon: "🖼️", c: "#D97706" },
  ];

  return (
    <div className="flex flex-col h-full bg-[#F4F7FA]">
      <div className="px-4 py-3 flex items-center gap-3 bg-white border-b border-[#D9E1EA]">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-[#EAF1F7] flex items-center justify-center active:scale-95"
        >
          <BackIcon />
        </button>

        <div>
          <p className="text-[10px] font-bold tracking-[0.18em] text-[#607086]">
            DOWNLOAD
          </p>
          <h2 className="font-black text-[#1F2D3D] text-[16px]">
            보고서 다운로드
          </h2>
          <p className="text-[10px] text-[#718096]">
            보고서 파일 저장 및 제출
          </p>
        </div>
      </div>

      <div className="mx-4 mt-4 bg-white rounded-2xl shadow-sm border border-[#D9E1EA] p-5 flex flex-col items-center">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mb-2 bg-[#E9F8EF] border-[2.5px] border-[#1F9D55]">
          <span className="text-2xl">✅</span>
        </div>
        <p className="font-black text-[#1F2D3D]">보고서 생성 완료</p>
        <p className="text-[10px] text-[#718096] mt-1">
          필요한 파일을 선택하여 다운로드하세요
        </p>
      </div>

      <div className="mx-4 mt-3 bg-white rounded-2xl shadow-sm border border-[#D9E1EA] overflow-hidden">
        {files.map((f, i) => (
          <div
            key={f.key}
            className="flex items-center gap-3 px-4 py-3"
            style={{
              borderBottom: i < files.length - 1 ? "1px solid #EEF3F7" : "none",
            }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
              style={{ background: `${f.c}15` }}
            >
              {f.icon}
            </div>

            <span className="flex-1 text-sm font-bold text-[#1F2D3D]">
              {f.l}
            </span>

            <button
              onClick={() => dl(f.key)}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90"
              style={{
                background: done.includes(f.key) ? "#E9F8EF" : `${f.c}15`,
                color: done.includes(f.key) ? "#1F9D55" : f.c,
              }}
            >
              {dling === f.key ? (
                <div className="w-3 h-3 border-2 border-[#12395B] border-t-transparent rounded-full animate-spin" />
              ) : done.includes(f.key) ? (
                <CheckIcon />
              ) : (
                <DlIcon />
              )}
            </button>
          </div>
        ))}
      </div>

      <div className="mx-4 mt-3 space-y-2">
        <button className="w-full py-3.5 rounded-xl text-white font-black text-sm flex items-center justify-center gap-2 bg-[#12395B]">
          ✉️ 업무용 이메일로 발송
        </button>

        <button
          onClick={onBack}
          className="w-full py-3.5 rounded-xl font-black text-sm text-[#12395B] bg-white border border-[#D9E1EA]"
        >
          메인메뉴로 돌아가기
        </button>
      </div>

      <div className="h-6" />
    </div>
  );
}