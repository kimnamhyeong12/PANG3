import { useState, useEffect } from "react";

import { BackIcon, CheckIcon } from "../components/Icons";

import { USER } from "../data/mockData";

export function MapScreen({ onBack, onLocationClick, markers, fromDirect }) {
  const [showSheet, setShowSheet] = useState(false);
  const [sel, setSel] = useState(null);
  const [blink, setBlink] = useState(true);
  const [optimizing, setOptimizing] = useState(!fromDirect);
  const [optimized, setOptimized] = useState(false);
  const [routeOrder, setRouteOrder] = useState(markers.map((_, i) => i));

  useEffect(() => {
    const t = setInterval(() => setBlink((b) => !b), 550);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!optimizing) return;
    const t = setTimeout(() => {
      setRouteOrder([0, 2, 4, 1, 3]);
      setOptimizing(false);
      setOptimized(true);
    }, 1500);
    return () => clearTimeout(t);
  }, [optimizing]);

  const orderedMarkers = routeOrder.map((i) => markers[i]).filter(Boolean);

  const pins = [
    { id: 1, x: 140, y: 130 },
    { id: 2, x: 82, y: 185 },
    { id: 3, x: 208, y: 218 },
    { id: 4, x: 165, y: 80 },
    { id: 5, x: 228, y: 152 },
  ];

  return (
    <div className="flex flex-col h-full bg-[#F4F7FA]">
      <div className="px-4 py-3 flex items-center gap-3 bg-white border-b border-[#D9E1EA] z-10">
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
          <h2 className="font-black text-[#1F2D3D] text-[16px]">경로 설정</h2>
          <p className="text-[10px] text-[#718096]">
            {optimizing
              ? "최적 경로 계산 중"
              : optimized
              ? "최적 방문 순서 안내"
              : "방문지를 확인하고 경로를 실행하세요"}
          </p>
        </div>

        <span className="text-[10px] font-bold text-[#12395B] bg-[#EAF1F7] px-3 py-1 rounded-full">
          {markers.length}개 지점
        </span>
      </div>

      {optimizing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-30 bg-white/95">
          <div className="w-20 h-20 rounded-full bg-[#EAF1F7] flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-[#12395B] border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="text-center">
            <p className="font-black text-[#1F2D3D] text-sm">경로 최적화 중</p>
            <p className="text-[10px] text-[#718096] mt-1">
              현재 위치 기준 최단 방문 순서를 계산합니다.
            </p>
          </div>
          <div className="w-48 bg-[#EAF1F7] rounded-full h-1.5 overflow-hidden">
            <div className="h-full rounded-full bg-[#12395B] animate-pulse" style={{ width: "70%" }} />
          </div>
        </div>
      )}

      {optimized && (
        <div className="px-4 py-2.5 flex items-center gap-2 bg-[#12395B]">
          <span className="text-white text-sm">✓</span>
          <p className="text-white text-[10px] font-bold flex-1">
            최적 경로 계산 완료 · 예상 이동시간 약 52분
          </p>
        </div>
      )}

      <div className="px-4 py-3 bg-white border-b border-[#D9E1EA]">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-black tracking-[0.16em] text-[#607086]">
            {optimized ? "OPTIMIZED ROUTE" : "FIELD LOCATION"}
          </p>

          {!optimized && !optimizing && (
            <button
              onClick={() => setOptimizing(true)}
              className="px-3 py-1.5 rounded-full text-white text-[10px] font-bold bg-[#12395B] active:scale-95"
            >
              경로 최적화
            </button>
          )}
        </div>

        <div className="space-y-1 max-h-20 overflow-y-auto">
          {(optimized ? orderedMarkers : markers).map((loc, i) => (
            <div key={loc.id || i} className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-black"
                style={{
                  background:
                    loc.status === "complete" ? "#1F9D55" : i === 0 ? "#12395B" : "#94A3B8",
                }}
              >
                {i + 1}
              </div>

              <span className="text-[10px] text-[#1F2D3D] flex-1 truncate font-semibold">
                {loc.name}
              </span>

              {loc.status === "complete" && (
                <span className="text-[8px] bg-[#E9F8EF] text-[#1F9D55] px-2 py-0.5 rounded-full font-bold">
                  완료
                </span>
              )}

              {i === 0 && loc.status !== "complete" && (
                <span className="text-[8px] bg-[#EAF1F7] text-[#12395B] px-2 py-0.5 rounded-full font-bold">
                  다음
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden bg-[#DDE8D5]">
        <svg className="absolute inset-0 w-full h-full opacity-20">
          {Array.from({ length: 20 }, (_, i) => (
            <line key={`h${i}`} x1="0" y1={i * 20} x2="400" y2={i * 20} stroke="#607086" strokeWidth="0.5" />
          ))}
          {Array.from({ length: 20 }, (_, i) => (
            <line key={`v${i}`} x1={i * 20} y1="0" x2={i * 20} y2="400" stroke="#607086" strokeWidth="0.5" />
          ))}
        </svg>

        <svg className="absolute inset-0 w-full h-full">
          <path d="M30,50 Q120,40 140,130 Q160,205 208,218 Q242,242 282,202" fill="none" stroke="#B6C7AD" strokeWidth="14" />
          <path d="M30,50 Q120,40 140,130 Q160,205 208,218 Q242,242 282,202" fill="none" stroke="white" strokeWidth="9" />
          <path d="M82,185 Q110,148 140,130 Q178,108 228,152" fill="none" stroke="#B6C7AD" strokeWidth="9" />
          <path d="M82,185 Q110,148 140,130 Q178,108 228,152" fill="none" stroke="white" strokeWidth="6" />

          {optimized && (
            <path
              d="M148,122 L165,80 L228,152 L82,185 L208,218"
              fill="none"
              stroke="#12395B"
              strokeWidth="3"
              strokeDasharray="8,5"
            />
          )}
        </svg>

        {pins.map((pin, pinIdx) => {
          const loc = markers[pinIdx];
          if (!loc) return null;

          const done = loc.status === "complete";
          const order = optimized ? routeOrder.indexOf(pinIdx) : pinIdx;
          const isNext = optimized && order === 0 && !done;

          return (
            <button
              key={pin.id}
              onClick={() => {
                setSel(loc);
                setShowSheet(true);
              }}
              className="absolute transform -translate-x-1/2 -translate-y-full active:scale-90 transition-transform"
              style={{ left: pin.x, top: pin.y, zIndex: isNext ? 10 : 1 }}
            >
              {isNext && <div className="absolute -inset-3 rounded-full animate-ping bg-[#12395B]/25" />}

              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shadow-lg border-2 border-white"
                style={{
                  background: done ? "#1F9D55" : isNext ? "#12395B" : "#607086",
                  opacity: isNext && !blink ? 0.55 : 1,
                }}
              >
                <span className="text-white text-[10px] font-black">
                  {optimized ? order + 1 : pinIdx + 1}
                </span>
              </div>

              <div
                className="mx-auto w-0 h-0"
                style={{
                  borderLeft: "4px solid transparent",
                  borderRight: "4px solid transparent",
                  borderTop: `6px solid ${done ? "#1F9D55" : isNext ? "#12395B" : "#607086"}`,
                }}
              />
            </button>
          );
        })}

        <div className="absolute" style={{ left: 150, top: 118 }}>
          <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow">
            <div className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-50" />
          </div>
        </div>

        {optimized && (
          <div className="absolute top-3 left-3 right-3 bg-white rounded-xl shadow-sm border border-[#D9E1EA] px-3 py-2.5 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#EAF1F7] flex items-center justify-center">📍</div>
            <div>
              <p className="text-[10px] font-black text-[#12395B]">다음 방문지</p>
              <p className="text-[9px] text-[#718096]">{orderedMarkers[0]?.name} · 마커를 눌러 업무 시작</p>
            </div>
          </div>
        )}
      </div>

      {showSheet && sel && (
        <div className="absolute inset-0 bg-black/30 z-20 flex items-end" onClick={() => setShowSheet(false)}>
          <div className="w-full bg-white rounded-t-3xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="w-8 h-1 bg-[#D9E1EA] rounded-full mx-auto mb-4" />

            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[#E6EDF3]">
              <div className="w-10 h-10 rounded-xl bg-[#EAF1F7] flex items-center justify-center text-lg">📍</div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-[#1F2D3D] text-sm truncate">{sel.name}</p>
                <p className="text-[10px] text-[#718096] truncate">{sel.address}</p>
              </div>
            </div>

            <p className="text-[10px] font-black tracking-[0.16em] text-[#607086] mb-3">
              FIELD RECORD
            </p>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "사진", icon: "📷", type: "photo" },
                { label: "메모", icon: "📝", type: "memo" },
                { label: "상태", icon: "🔄", type: "status" },
              ].map((btn) => (
                <button
                  key={btn.label}
                  onClick={() => {
                    setShowSheet(false);
                    onLocationClick(sel, btn.type);
                  }}
                  className="flex flex-col items-center gap-2 py-4 rounded-xl bg-[#EAF1F7] active:scale-95 transition-all border border-[#D9E1EA]"
                >
                  <span className="text-2xl">{btn.icon}</span>
                  <span className="text-xs font-black text-[#12395B]">{btn.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getAiRecommendation(memo) {
  const text = memo.toLowerCase();

  if (text.includes("배수") || text.includes("토사") || text.includes("침수") || text.includes("악취")) {
    return {
      category: "배수시설 관리",
      risk: "높음",
      riskColor: "#DC2626",
      checklist: ["배수구 막힘 여부 확인", "우천 시 침수 위험 확인", "현장 사진 추가 촬영"],
      actions: ["정비 요청 등록", "우천 전 재점검", "환경정비팀 전달"],
      report:
        "배수구 내 토사 적체로 인해 배수 불량 및 침수 위험이 우려되어 정비 요청이 필요함.",
    };
  }

  if (text.includes("파손") || text.includes("균열") || text.includes("전선") || text.includes("부식")) {
    return {
      category: "시설물 안전",
      risk: "높음",
      riskColor: "#DC2626",
      checklist: ["파손 부위 근접 촬영", "보행자 위험 여부 확인", "임시 안전조치 필요 여부 확인"],
      actions: ["긴급 보수 요청", "안전표지 설치", "재점검 등록"],
      report:
        "시설물 파손 및 안전 위험 요소가 확인되어 긴급 보수 조치가 필요함.",
    };
  }

  if (text.includes("쓰레기") || text.includes("무단투기") || text.includes("폐기물")) {
    return {
      category: "환경 정비",
      risk: "중간",
      riskColor: "#D97706",
      checklist: ["폐기물 종류 확인", "투기량 사진 촬영", "재발 가능성 확인"],
      actions: ["수거 요청 등록", "재발 지역 표시", "환경정비팀 전달"],
      report:
        "무단투기 및 폐기물 적치가 확인되어 수거 요청 및 재발 방지 관리가 필요함.",
    };
  }

  return {
    category: "일반 현장 점검",
    risk: "보통",
    riskColor: "#12395B",
    checklist: ["현장 상태 확인", "사진 1장 이상 첨부", "특이사항 메모 보완"],
    actions: ["일반 점검 완료", "추가 확인 필요", "재점검 등록"],
    report:
      "현장 점검 결과 특이사항이 확인되어 추가 확인 및 기록 관리가 필요함.",
  };
}

export function FieldActionScreen({ location, actionType, onBack, onSave }) {
  const [memo, setMemo] = useState("");
  const [status, setStatus] = useState("pending");
  const [photos, setPhotos] = useState([]);
  const [tab, setTab] = useState(actionType || "photo");
  const [saved, setSaved] = useState(false);
  const [aiVisible, setAiVisible] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedAction, setSelectedAction] = useState("");

  useEffect(() => {
    if (memo.trim().length < 8) {
      setAiVisible(false);
      setAiLoading(false);
      setSelectedAction("");
      return;
    }

    setAiLoading(true);
    const t = setTimeout(() => {
      setAiLoading(false);
      setAiVisible(true);
    }, 800);

    return () => clearTimeout(t);
  }, [memo]);

  const ai = getAiRecommendation(memo);

  const save = () => {
    setSaved(true);
    setTimeout(
      () =>
        onSave({
          memo,
          status,
          photos,
          aiRecommendation: aiVisible ? ai : null,
          selectedAction,
        }),
      700
    );
  };

  const addPhoto = (type) => {
    const e =
      type === "camera"
        ? ["📸", "🏗️", "🌊", "⚓", "🏖️"]
        : ["🖼️", "🗺️", "📊", "🏭", "🌿"];

    setPhotos((p) => [...p, { id: Date.now(), emoji: e[p.length % 5], type }]);
  };

  return (
    <div className="flex flex-col h-full bg-[#F4F7FA]">
      <div className="px-4 py-3 flex items-center gap-3 bg-white border-b border-[#D9E1EA]">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-[#EAF1F7] flex items-center justify-center active:scale-95"
        >
          <BackIcon />
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold tracking-[0.18em] text-[#607086]">
            FIELD RECORD
          </p>
          <h2 className="font-black text-[#1F2D3D] text-[16px] truncate">
            현장 업무 기록
          </h2>
          <p className="text-[10px] text-[#718096] truncate">{location?.name}</p>
        </div>

        <div className="text-right">
          <p className="text-[10px] font-bold text-[#1F2D3D]">{USER.name}</p>
          <p className="text-[9px] text-[#718096]">{USER.team}</p>
        </div>
      </div>

      <div className="px-4 py-3 bg-white border-b border-[#D9E1EA]">
        <div className="grid grid-cols-3 gap-2">
          {[
            { k: "photo", l: "사진", i: "📷" },
            { k: "memo", l: "메모", i: "📝" },
            { k: "status", l: "상태", i: "🔄" },
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className="py-2.5 rounded-xl text-[11px] font-black border transition-all"
              style={{
                background: tab === t.k ? "#12395B" : "#EAF1F7",
                color: tab === t.k ? "white" : "#607086",
                borderColor: tab === t.k ? "#12395B" : "#D9E1EA",
              }}
            >
              <span className="mr-1">{t.i}</span>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {tab === "photo" && (
          <div>
            <p className="text-[11px] font-black tracking-[0.16em] text-[#607086] mb-3">
              PHOTO RECORD
            </p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                onClick={() => addPhoto("gallery")}
                className="flex flex-col items-center gap-2 py-6 rounded-2xl border border-[#D9E1EA] bg-white active:scale-95 shadow-sm"
              >
                <span className="text-3xl">🖼️</span>
                <span className="text-xs font-black text-[#12395B]">이미지 선택</span>
                <span className="text-[9px] text-[#718096]">기존 사진 첨부</span>
              </button>

              <button
                onClick={() => addPhoto("camera")}
                className="flex flex-col items-center gap-2 py-6 rounded-2xl border border-[#D9E1EA] bg-white active:scale-95 shadow-sm"
              >
                <span className="text-3xl">📷</span>
                <span className="text-xs font-black text-[#12395B]">카메라 촬영</span>
                <span className="text-[9px] text-[#718096]">현장 즉시 촬영</span>
              </button>
            </div>

            {photos.length > 0 && (
              <>
                <p className="text-[11px] font-black tracking-[0.16em] text-[#607086] mb-2">
                  ATTACHED PHOTO ({photos.length})
                </p>

                <div className="grid grid-cols-3 gap-2">
                  {photos.map((p, i) => (
                    <div
                      key={p.id}
                      className="aspect-square rounded-xl bg-white border border-[#D9E1EA] flex items-center justify-center relative shadow-sm"
                    >
                      <span className="text-3xl">{p.emoji}</span>
                      <div className="absolute bottom-1 inset-x-1 bg-[#12395B]/80 rounded text-white text-[7px] text-center py-0.5">
                        사진 {i + 1}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {tab === "memo" && (
          <div>
            <p className="text-[11px] font-black tracking-[0.16em] text-[#607086] mb-3">
              FIELD MEMO
            </p>

            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="현장 세부사항을 입력하세요&#10;&#10;예: 배수구 토사 적체 심함, 악취 발생"
              className="w-full h-44 px-4 py-3 rounded-2xl bg-white border border-[#D9E1EA] text-sm text-[#1F2D3D] resize-none focus:outline-none focus:border-[#12395B] focus:ring-4 focus:ring-[#12395B]/10 shadow-sm"
              style={{ lineHeight: "1.7" }}
            />

            <div className="flex justify-between mt-2">
              <span className="text-[9px] text-[#718096]">
                보고서 생성 시 메모 내용이 자동 반영됩니다.
              </span>
              <span className="text-[9px] text-[#718096]">{memo.length}/500</span>
            </div>

            {aiLoading && (
              <div className="mt-4 bg-white rounded-2xl border border-[#D9E1EA] shadow-sm px-4 py-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#EAF1F7] flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-[#12395B] border-t-transparent rounded-full animate-spin" />
                </div>
                <div>
                  <p className="text-xs font-black text-[#1F2D3D]">
                    AI Assistant 분석 중...
                  </p>
                  <p className="text-[9px] text-[#718096] mt-0.5">
                    입력된 현장 메모를 기반으로 추천 항목을 생성합니다.
                  </p>
                </div>
              </div>
            )}

            {aiVisible && !aiLoading && (
              <div className="mt-4 bg-white rounded-2xl border border-[#D9E1EA] shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-[#EEF3F7] flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#12395B] text-white flex items-center justify-center text-[10px] font-black">
                    AI
                  </div>
                  <div>
                    <p className="text-sm font-black text-[#1F2D3D]">
                      AI Assistant 추천
                    </p>
                    <p className="text-[9px] text-[#718096]">
                      입력하신 메모를 분석하여 추천드려요.
                    </p>
                  </div>
                </div>

                <div className="px-4 py-3">
                  <div className="flex items-center gap-2 text-[10px] mb-3">
                    <span className="font-bold text-[#607086]">상황분류:</span>
                    <span className="font-black text-[#1F2D3D]">{ai.category}</span>
                    <span className="mx-1 text-[#CBD5E1]">|</span>
                    <span className="font-bold text-[#607086]">위험도:</span>
                    <span
                      className="px-2 py-0.5 rounded-full font-black"
                      style={{
                        color: ai.riskColor,
                        background: `${ai.riskColor}15`,
                      }}
                    >
                      {ai.risk}
                    </span>
                  </div>

                  <div className="mb-4">
                    <p className="text-[11px] font-black text-[#1F2D3D] mb-2">
                      추가 점검 항목
                    </p>

                    <div className="space-y-2">
                      {ai.checklist.map((item) => (
                        <label
                          key={item}
                          className="flex items-center gap-2 text-[10px] text-[#607086]"
                        >
                          <input
                            type="checkbox"
                            className="w-3.5 h-3.5 accent-[#12395B]"
                          />
                          {item}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="mb-4">
                    <p className="text-[11px] font-black text-[#1F2D3D] mb-2">
                      추천 조치
                    </p>

                    <div className="grid grid-cols-3 gap-2">
                      {ai.actions.map((action) => (
                        <button
                          key={action}
                          onClick={() => setSelectedAction(action)}
                          className="min-h-[58px] rounded-xl border px-2 py-2 text-[9px] font-black transition-all active:scale-95"
                          style={{
                            background:
                              selectedAction === action ? "#12395B" : "#F8FAFC",
                            color:
                              selectedAction === action ? "white" : "#1F2D3D",
                            borderColor:
                              selectedAction === action ? "#12395B" : "#D9E1EA",
                          }}
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#F4F7FA] border border-[#D9E1EA] px-3 py-3">
                    <p className="text-[10px] font-black text-[#12395B] mb-1">
                      보고서 문안 예시
                    </p>
                    <p className="text-[10px] text-[#607086] leading-relaxed">
                      {selectedAction
                        ? `${ai.report} 선택 조치: ${selectedAction}.`
                        : ai.report}
                    </p>
                  </div>

                  <p className="text-[8px] text-[#718096] mt-3">
                    ※ 위 추천은 참고용이며, 최종 판단은 담당자의 책임입니다.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "status" && (
          <div>
            <div className="flex items-center gap-3 bg-white rounded-2xl p-3 mb-4 border border-[#D9E1EA] shadow-sm">
              <div className="w-9 h-9 rounded-full bg-[#12395B] flex items-center justify-center font-black text-white">
                {USER.name[0]}
              </div>
              <div>
                <p className="font-black text-[#1F2D3D] text-xs">
                  {USER.name}, {USER.team}
                </p>
                <p className="text-[9px] text-[#718096]">Position: {USER.position}</p>
              </div>
            </div>

            <p className="text-[11px] font-black tracking-[0.16em] text-[#607086] mb-3">
              STATUS UPDATE
            </p>

            <div className="space-y-2">
              {[
                { v: "pending", l: "보류", d: "추가 확인 또는 재방문 필요", i: "⏳", c: "#D97706" },
                { v: "complete", l: "완료", d: "현장 확인 및 조치 완료", i: "✅", c: "#1F9D55" },
                { v: "absent", l: "부재", d: "대상자 부재 또는 확인 불가", i: "🚫", c: "#DC2626" },
              ].map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setStatus(opt.v)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all text-left bg-white shadow-sm"
                  style={{
                    borderColor: status === opt.v ? opt.c : "#D9E1EA",
                    background: status === opt.v ? `${opt.c}10` : "white",
                  }}
                >
                  <span className="text-xl">{opt.i}</span>

                  <div className="flex-1">
                    <p className="font-black text-sm text-[#1F2D3D]">{opt.l}</p>
                    <p className="text-[9px] text-[#718096] mt-0.5">{opt.d}</p>
                  </div>

                  {status === opt.v && (
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-white"
                      style={{ background: opt.c }}
                    >
                      <CheckIcon />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-5 py-4 border-t border-[#D9E1EA] bg-white">
        <button
          onClick={save}
          className="w-full py-4 rounded-xl text-white font-black text-sm tracking-wide transition-all active:scale-[0.97]"
          style={{
            background: saved ? "#1F9D55" : "#12395B",
            boxShadow: saved
              ? "0 8px 18px rgba(31,157,85,.22)"
              : "0 8px 18px rgba(18,57,91,.22)",
          }}
        >
          {saved ? (
            <span className="flex items-center justify-center gap-2">
              <CheckIcon />
              저장 완료
            </span>
          ) : (
            "저장하기"
          )}
        </button>
      </div>
    </div>
  );
}