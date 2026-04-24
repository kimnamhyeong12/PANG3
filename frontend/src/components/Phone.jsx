export default function Phone({ children }) {
  return (
    <div className="flex justify-center items-start min-h-screen bg-gray-100 py-8 px-4">
      <div className="relative w-[390px] bg-white rounded-[44px] shadow-2xl overflow-hidden"
        style={{ border:"8px solid #1a1a2e", minHeight:844,
          boxShadow:"0 40px 100px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.08)" }}>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-[#1a1a2e] rounded-b-2xl z-50"/>
        <div className="flex justify-between items-center px-8 pt-8 pb-1 text-[11px] font-semibold text-gray-600 bg-white relative z-40">
          <span>9:41</span>
          <div className="flex gap-1 items-center text-gray-500"><span>▲▲▲</span><span>WiFi</span><span>🔋</span></div>
        </div>
        <div className="overflow-y-auto" style={{ height:800 }}>{children}</div>
      </div>
    </div>
  );
}