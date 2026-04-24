import { useState } from "react";
import { C } from "../data/mockData";

export default function Login({ onLogin }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const go = () => {
    if (!id || !pw) return;
    setLoading(true);
    setTimeout(() => { setLoading(false); onLogin(); }, 1100);
  };
  return (
    <div className="flex flex-col min-h-full bg-white px-8">
      <div className="flex flex-col items-center pt-16 pb-10">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
          style={{ background:"linear-gradient(135deg, #1B6CA8 0%, #3AAFA9 100%)" }}>
          <svg viewBox="0 0 40 40" fill="none" className="w-9 h-9">
            <circle cx="20" cy="20" r="18" stroke="white" strokeWidth="2" opacity="0.4"/>
            <path d="M12 26 Q20 10 28 26" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
            <circle cx="20" cy="20" r="3" fill="white"/>
          </svg>
        </div>
        <h1 className="text-2xl font-black tracking-tight" style={{ color:"#1a1a2e" }}>Saha-gu</h1>
        <p className="text-xs tracking-[0.25em] font-medium mt-1" style={{ color:C.primary }}>FIELDWORK ASSISTANT</p>
        <div className="mt-4 flex gap-1.5 items-center">
          <div className="w-8 h-px" style={{ background:C.primary, opacity:0.3 }}/>
          <div className="w-2 h-2 rounded-full" style={{ background:C.teal, opacity:0.6 }}/>
          <div className="w-8 h-px" style={{ background:C.primary, opacity:0.3 }}/>
        </div>
      </div>
      <div className="flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-5">직원 로그인</p>
        <div className="space-y-4 mb-8">
          {[
            { label:"사원번호", val:id, set:setId, type:"text",     ph:"사원번호 입력" },
            { label:"비밀번호", val:pw, set:setPw, type:"password", ph:"비밀번호 입력" },
          ].map(f=>(
            <div key={f.label}>
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-2">{f.label}</label>
              <input type={f.type} value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph}
                className="w-full px-4 py-3.5 rounded-xl text-sm text-gray-700 focus:outline-none transition-all"
                style={{ background:"#F8FAFC", border:`1.5px solid ${f.val ? C.primary : "#E2E8F0"}`,
                  boxShadow: f.val ? `0 0 0 3px ${C.primary}18` : "none" }}/>
            </div>
          ))}
        </div>
        <button onClick={go}
          className="w-full py-4 rounded-xl text-white font-bold text-sm tracking-wider transition-all active:scale-[0.97]"
          style={{ background:(!id||!pw) ? "#CBD5E1" : "linear-gradient(135deg,#1B6CA8 0%,#3AAFA9 100%)",
            boxShadow:(!id||!pw) ? "none" : "0 8px 24px rgba(27,108,168,0.35)" }}>
          {loading
            ? <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>로그인 중…
              </span>
            : "로그인 LOG IN"}
        </button>
        <p className="text-center text-[10px] text-gray-300 mt-8">사하구청 외근 도우미 시스템 v2.4</p>
      </div>
    </div>
  );
}