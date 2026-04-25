import { useState } from "react";

export default function Login({ onLogin }) {
  const [id,setId]=useState("");
  const [pw,setPw]=useState("");
  const [loading,setLoading]=useState(false);

  const go=()=>{
    if(!id||!pw) return;

    setLoading(true);

    setTimeout(()=>{
      setLoading(false);
      onLogin();
    },900);
  };

  return (
    <div className="flex flex-col min-h-full bg-[#F4F7FA] px-8">

      {/* HEADER */}
      <div className="pt-12 pb-5">

        <div className="flex items-center gap-3">

          <div className="w-12 h-12 rounded-xl bg-[#12395B]
          flex items-center justify-center
          text-white font-black text-lg shadow-sm">
            SG
          </div>

          <div>
            <p className="text-[11px] font-bold tracking-[0.22em] text-[#607086]">
              SAHA-GU OFFICE
            </p>

            <h1 className="text-[22px] font-black text-[#1F2D3D]">
              외근 업무 지원 시스템
            </h1>

            <p className="text-[10px] mt-1 text-[#718096]">
              스마트 현장 순회 및 보고 자동화 시스템
            </p>

            <div className="mt-3 flex items-center gap-3">
              <div className="w-20 h-[1px] bg-[#9FB4C7]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#7CA6C7]" />
              <div className="w-20 h-[1px] bg-[#9FB4C7]" />
            </div>

            <p className="mt-3 text-[10px] tracking-[0.28em]
            font-semibold text-[#5E7B95]">
              FIELDWORK ASSISTANT
            </p>

          </div>
        </div>

      </div>



      {/* LOGIN */}
      <div className="flex-1 pt-4">

        <div className="mb-5">
          <p className="text-[11px] font-black tracking-[0.18em]
          text-[#607086] uppercase">
            SECURE LOGIN
          </p>

          <h2 className="text-lg font-black text-[#1F2D3D] mt-1">
            직원 로그인
          </h2>
        </div>


        <div className="space-y-4 mb-7">

          <div>
            <label className="text-[11px] font-bold text-[#607086] block mb-2">
              직원번호 또는 업무용 이메일
            </label>

            <input
              type="text"
              value={id}
              onChange={(e)=>setId(e.target.value)}
              placeholder="예: saha2026 또는 name@saha.go.kr"
              className="w-full px-4 py-3.5 rounded-xl
              bg-white border border-[#D9E1EA]
              focus:outline-none focus:border-[#1F6FAE]
              focus:ring-4 focus:ring-[#1F6FAE]/10"
            />
          </div>


          <div>
            <label className="text-[11px] font-bold text-[#607086] block mb-2">
              비밀번호
            </label>

            <input
              type="password"
              value={pw}
              onChange={(e)=>setPw(e.target.value)}
              placeholder="비밀번호 입력"
              className="w-full px-4 py-3.5 rounded-xl
              bg-white border border-[#D9E1EA]
              focus:outline-none focus:border-[#1F6FAE]
              focus:ring-4 focus:ring-[#1F6FAE]/10"
            />
          </div>

        </div>


        <button
          onClick={go}
          disabled={!id||!pw||loading}
          className="w-full py-4 rounded-xl
          text-white font-black text-sm tracking-wider"
          style={{
            background:
             (!id||!pw)
             ? "#CBD5E1"
             : "#12395B",

            boxShadow:
             (!id||!pw)
             ? "none"
             :"0 8px 18px rgba(18,57,91,.22)"
          }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white
              border-t-transparent rounded-full animate-spin"/>
              인증 중...
            </span>
          ) : (
            "로그인"
          )}
        </button>


        <div className="mt-6 rounded-xl
        bg-[#EAF1F7]
        border border-[#D9E1EA]
        px-4 py-3">
          <p className="text-[10px] text-[#607086] leading-relaxed">
            본 시스템은 사하구청 외근 담당자 전용 시스템입니다.
            모든 접속 기록은 보안 정책에 따라 저장됩니다.
          </p>
        </div>


        <p className="text-center text-[10px] text-[#A0AEC0] mt-8">
          사하구청 외근 도우미 시스템 v2.4
        </p>

      </div>
    </div>
  );
}