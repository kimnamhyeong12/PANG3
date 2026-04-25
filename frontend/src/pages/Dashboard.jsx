import { BackIcon } from "../components/Icons";
import { USER, REGION_DATA, HEATMAP, DAYS, WEEKS } from "../data/mockData";

export default function Dashboard({ onBack }) {
  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  const maxCount = Math.max(...REGION_DATA.map((r) => r.count));

  const heatColor = (v) => {
    const p = v / 9;
    if (p > 0.77) return "#12395B";
    if (p > 0.55) return "#2E6D9C";
    if (p > 0.33) return "#6EA5C8";
    if (p > 0.11) return "#BFD4E3";
    return "#EAF1F7";
  };

  const timeHeatmap = [
    { time: "09시", values: [2, 4, 3, 5, 2] },
    { time: "11시", values: [6, 7, 8, 6, 5] },
    { time: "14시", values: [5, 6, 7, 8, 4] },
    { time: "16시", values: [3, 4, 5, 6, 7] },
  ];

  const pendingReasons = [
    { label: "부재중", value: 45 },
    { label: "재방문 필요", value: 30 },
    { label: "접근 제한", value: 25 },
  ];

  return (
    <div className="flex flex-col min-h-full bg-[#F4F7FA]">
      {/* Header */}
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
          <h2 className="font-black text-[#1F2D3D] text-[17px]">
            외근 분석 대시보드
          </h2>
          <p className="text-[10px] text-[#718096]">{today} 기준</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#12395B] flex items-center justify-center text-white text-xs font-black">
            {USER.name[0]}
          </div>
          <div>
            <p className="text-[10px] font-bold text-[#1F2D3D]">{USER.name}</p>
            <p className="text-[9px] text-[#718096]">{USER.team}</p>
          </div>
        </div>
      </div>

      <div className="overflow-y-auto px-4 py-4 space-y-4">
        {/* Analysis KPI */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "평균 이동", value: "18분" },
            { label: "절감 시간", value: "52분" },
            { label: "기록 제출률", value: "86%" },
          ].map((item) => (
            <div
              key={item.label}
              className="bg-white rounded-2xl p-3 border border-[#D9E1EA] shadow-sm text-center"
            >
              <p className="text-xl font-black text-[#12395B]">
                {item.value}
              </p>
              <p className="text-[10px] font-bold text-[#607086] mt-1">
                {item.label}
              </p>
            </div>
          ))}
        </div>

        {/* 지역별 업무 집중도 */}
        <div className="bg-white rounded-2xl p-4 border border-[#D9E1EA] shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-[11px] font-black tracking-[0.16em] text-[#607086]">
                AREA ANALYSIS
              </p>
              <h3 className="text-sm font-black text-[#1F2D3D] mt-1">
                지역별 업무 집중도
              </h3>
            </div>

            <span className="text-[9px] font-bold text-[#12395B] bg-[#EAF1F7] px-2.5 py-1 rounded-full">
              사하구 관내
            </span>
          </div>

          <div className="space-y-3">
            {REGION_DATA.map((r) => (
              <div key={r.region} className="flex items-center gap-3">
                <span className="text-[10px] text-[#607086] w-12 font-bold">
                  {r.region}
                </span>

                <div className="flex-1 h-7 bg-[#F1F5F9] rounded-lg overflow-hidden">
                  <div
                    className="h-full bg-[#12395B] rounded-lg flex items-center px-2"
                    style={{ width: `${(r.count / maxCount) * 100}%` }}
                  >
                    <span className="text-white text-[10px] font-black">
                      {r.count}건
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 주간 업무 히트맵 */}
        <div className="bg-white rounded-2xl p-4 border border-[#D9E1EA] shadow-sm">
          <p className="text-[11px] font-black tracking-[0.16em] text-[#607086]">
            WEEKLY HEATMAP
          </p>
          <h3 className="text-sm font-black text-[#1F2D3D] mt-1 mb-3">
            주간 외근 업무 히트맵
          </h3>

          <div className="flex gap-1 mb-1">
            <div className="w-7" />
            {DAYS.map((d) => (
              <div
                key={d}
                className="flex-1 text-center text-[8px] text-[#718096] font-bold"
              >
                {d}
              </div>
            ))}
          </div>

          {HEATMAP.map((row, wi) => (
            <div key={wi} className="flex gap-1 mb-1">
              <div className="w-7 flex items-center">
                <span className="text-[7px] text-[#718096] font-bold">
                  {WEEKS[wi]}
                </span>
              </div>

              {row.map((val, di) => (
                <div
                  key={di}
                  className="flex-1 aspect-square rounded-sm"
                  style={{ background: heatColor(val) }}
                />
              ))}
            </div>
          ))}

          <div className="flex items-center gap-1 mt-3 justify-end">
            <span className="text-[8px] text-[#718096]">적음</span>
            {["#EAF1F7", "#BFD4E3", "#6EA5C8", "#2E6D9C", "#12395B"].map(
              (clr) => (
                <div
                  key={clr}
                  className="w-4 h-3 rounded-sm"
                  style={{ background: clr }}
                />
              )
            )}
            <span className="text-[8px] text-[#718096]">많음</span>
          </div>
        </div>

        {/* 시간대 방문 집중도 */}
        <div className="bg-white rounded-2xl p-4 border border-[#D9E1EA] shadow-sm">
          <p className="text-[11px] font-black tracking-[0.16em] text-[#607086]">
            TIME ANALYSIS
          </p>
          <h3 className="text-sm font-black text-[#1F2D3D] mt-1 mb-3">
            시간대별 방문 집중도
          </h3>

          <div className="flex gap-1 mb-1">
            <div className="w-9" />
            {["월", "화", "수", "목", "금"].map((d) => (
              <div
                key={d}
                className="flex-1 text-center text-[8px] text-[#718096] font-bold"
              >
                {d}
              </div>
            ))}
          </div>

          {timeHeatmap.map((row) => (
            <div key={row.time} className="flex gap-1 mb-1">
              <div className="w-9 flex items-center">
                <span className="text-[8px] text-[#607086] font-bold">
                  {row.time}
                </span>
              </div>

              {row.values.map((v, i) => (
                <div
                  key={i}
                  className="flex-1 h-8 rounded-md"
                  style={{ background: heatColor(v) }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* 미처리 사유 */}
        <div className="bg-white rounded-2xl p-4 border border-[#D9E1EA] shadow-sm">
          <p className="text-[11px] font-black tracking-[0.16em] text-[#607086]">
            PENDING ANALYSIS
          </p>
          <h3 className="text-sm font-black text-[#1F2D3D] mt-1 mb-3">
            미처리 사유 분석
          </h3>

          <div className="space-y-3">
            {pendingReasons.map((r) => (
              <div key={r.label}>
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] font-bold text-[#607086]">
                    {r.label}
                  </span>
                  <span className="text-[10px] font-black text-[#12395B]">
                    {r.value}%
                  </span>
                </div>

                <div className="h-2.5 bg-[#EAF1F7] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#12395B] rounded-full"
                    style={{ width: `${r.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="h-4" />
    </div>
  );
}