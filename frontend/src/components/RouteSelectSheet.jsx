export default function RouteSelectSheet({
  onClose,
  onDirect,
  onUpload
}) {
  return (
    <div className="absolute inset-0 z-50 bg-black/30 flex items-end">
      <div className="w-full bg-white rounded-t-3xl p-6 shadow-2xl">

        <div className="w-12 h-1 bg-gray-300 rounded mx-auto mb-5" />

        <h2 className="text-lg font-bold mb-1">
          경로 설정 방식 선택
        </h2>

        <p className="text-sm text-gray-500 mb-6">
          외근 경로를 어떻게 설정하시겠습니까?
        </p>

        <div className="space-y-3">

          <button
            onClick={onDirect}
            className="w-full p-4 rounded-2xl border text-left hover:bg-gray-50"
          >
            <div className="font-bold">
              🗺️ 직접 경로 설정
            </div>
            <div className="text-sm text-gray-500 mt-1">
              방문지를 직접 선택하여 경로 생성
            </div>
          </button>

          <button
            onClick={onUpload}
            className="w-full p-4 rounded-2xl border text-left hover:bg-gray-50"
          >
            <div className="font-bold">
              📤 파일 업로드
            </div>
            <div className="text-sm text-gray-500 mt-1">
              엑셀/CSV 업로드 후 자동 경로 생성
            </div>
          </button>

        </div>

        <button
          onClick={onClose}
          className="w-full mt-5 py-3 rounded-xl bg-gray-100 font-semibold"
        >
          취소
        </button>

      </div>
    </div>
  );
}