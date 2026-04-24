import { BackIcon } from "../components/Icons";
import {
    C,
    USER,
    REGION_DATA,
    MONTHLY,
    HEATMAP,
    DAYS,
    WEEKS
} from "../data/mockData";

export default function Dashboard({ onBack }) {
  const maxCount   = Math.max(...REGION_DATA.map(r=>r.count));
  const maxRevenue = Math.max(...MONTHLY.map(m=>m.revenue));
  const heatColor  = v => {
    const p = v/9;
    if (p>0.77) return "#1B6CA8";
    if (p>0.55) return "#3AAFA9";
    if (p>0.33) return "#7AC5BE";
    if (p>0.11) return "#B8DCE8";
    return "#EAF4F8";
  };
  return (
    <div className="flex flex-col min-h-full bg-[#F8FAFC]">
      <div className="px-4 py-3 flex items-center gap-3 bg-white border-b border-slate-100">
        <button onClick={onBack} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><BackIcon/></button>
        <div className="flex-1">
          <h2 className="font-black text-gray-800 text-sm">업무 데이터 대시보드</h2>
          <p className="text-[10px] text-gray-400">2020-02-10 기준</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black"
            style={{ background:C.primary }}>{USER.name[0]}</div>
          <div>
            <p className="text-[10px] font-bold text-gray-700">{USER.name}</p>
            <p className="text-[9px] text-gray-400">{USER.team}</p>
          </div>
        </div>
      </div>

      <div className="overflow-y-auto px-4 py-4 space-y-4">
        {/* KPI */}
        <div className="grid grid-cols-2 gap-3">
          {[
            {label:"전년 수익 (10k)",val:"2432",color:C.primary,sub:"Last year profits"},
            {label:"금년 수익 (10k)",val:"2546",color:C.teal,  sub:"Current year profits"},
          ].map(k=>(
            <div key={k.label} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">{k.label}</p>
              <p className="text-2xl font-black mt-1" style={{ color:k.color }}>{k.val}</p>
              <div className="mt-2 flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ background:k.color }}/>
                <p className="text-[9px] text-gray-400">{k.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* 지역별 분포 */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <p className="text-xs font-black text-gray-700 mb-3">지역별 업무 분포</p>
          <div className="space-y-2.5">
            {REGION_DATA.map(r=>(
              <div key={r.region} className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 w-12 flex-shrink-0 font-medium">{r.region}</span>
                <div className="flex-1 h-5 rounded-md overflow-hidden bg-slate-50">
                  <div className="h-full rounded-md flex items-center px-2"
                    style={{ width:`${(r.count/maxCount)*100}%`, background:r.color }}>
                    <span className="text-white text-[9px] font-bold">{r.count}</span>
                  </div>
                </div>
                <span className="text-[9px] text-gray-400 w-10 text-right flex-shrink-0">{r.profit}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[8px] text-gray-300">0</span>
            <span className="text-[8px] text-gray-300">건수 / 수익(10k)</span>
          </div>
        </div>

        {/* 히트맵 */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <p className="text-xs font-black text-gray-700 mb-0.5">주간 업무 히트맵</p>
          <p className="text-[9px] text-gray-400 mb-3">업무 강도 분포 (최근 6주)</p>
          <div className="flex gap-1 mb-1">
            <div className="w-6"/>
            {DAYS.map(d=>(
              <div key={d} className="flex-1 text-center text-[8px] text-gray-400 font-bold">{d}</div>
            ))}
          </div>
          {HEATMAP.map((row,wi)=>(
            <div key={wi} className="flex gap-1 mb-1">
              <div className="w-6 flex items-center">
                <span className="text-[7px] text-gray-300 font-bold">{WEEKS[wi]}</span>
              </div>
              {row.map((val,di)=>(
                <div key={di} className="flex-1 aspect-square rounded-sm" style={{ background:heatColor(val) }}/>
              ))}
            </div>
          ))}
          <div className="flex items-center gap-1 mt-2.5 justify-end">
            <span className="text-[8px] text-gray-400">적음</span>
            {["#EAF4F8","#B8DCE8","#7AC5BE","#3AAFA9","#1B6CA8"].map(clr=>(
              <div key={clr} className="w-4 h-3 rounded-sm" style={{ background:clr }}/>
            ))}
            <span className="text-[8px] text-gray-400">많음</span>
          </div>
        </div>

        {/* Monthly cumulative horizontal bars */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <p className="text-xs font-black text-gray-700 mb-1">월별 누적 지수</p>
          <div className="flex gap-3 mb-3 flex-wrap">
            {[{l:"누적 수익",c:C.primary},{l:"누적 비용",c:C.lavender},{l:"순이익",c:C.teal}].map(lg=>(
              <div key={lg.l} className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background:lg.c }}/>
                <span className="text-[9px] text-gray-500">{lg.l}</span>
              </div>
            ))}
          </div>
          {[
            {label:"누적 수익",val:1261,max:1400,color:C.primary},
            {label:"누적 비용",val:1113,max:1400,color:C.lavender},
            {label:"순이익",   val:148, max:1400,color:C.teal},
          ].map(b=>(
            <div key={b.label} className="mb-2">
              <div className="flex justify-between mb-1">
                <span className="text-[9px] text-gray-500">{b.label}</span>
                <span className="text-[10px] font-bold" style={{ color:b.color }}>{b.val}</span>
              </div>
              <div className="h-5 bg-slate-50 rounded-md overflow-hidden">
                <div className="h-full rounded-md flex items-center px-2"
                  style={{ width:`${(b.val/b.max)*100}%`, background:b.color }}>
                  <span className="text-white text-[9px] font-bold">{b.val}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Monthly vertical bar chart */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <p className="text-xs font-black text-gray-700 mb-3">월간 수익 추이</p>
          <div className="flex items-end gap-2 h-28">
            {MONTHLY.map(m=>(
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[8px] font-bold" style={{ color:C.primary }}>{m.revenue}</span>
                <div className="w-full rounded-t-md"
                  style={{ height:`${(m.revenue/maxRevenue)*88}px`,
                    background:`linear-gradient(180deg,${C.primary} 0%,${C.teal} 100%)`, opacity:0.85 }}/>
                <span className="text-[8px] text-gray-400">{m.month}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Other indices table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-black text-gray-700">기타 지수 Other Indices</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[9px]">
              <thead>
                <tr style={{ background:C.primary }}>
                  {["임대면적(㎡)","서명면적(㎡)","서명율(%)","총 유닛","점유율(%)","공실율(%)","임대수금율(%)","단가($/㎡)"].map(h=>(
                    <th key={h} className="px-2 py-2 text-white font-bold text-center whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="bg-blue-50">
                  {["12030","145307","72%","206","79%","6%","84%","50"].map((v,i)=>(
                    <td key={i} className="px-2 py-2.5 text-center font-semibold text-gray-700 whitespace-nowrap">{v}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="h-4"/>
    </div>
  );
}
