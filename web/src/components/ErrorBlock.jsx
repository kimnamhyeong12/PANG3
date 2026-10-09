// 목록/패널 영역 API 에러 표시 (+ 다시 시도)
export default function ErrorBlock({ message, onRetry }) {
  return (
    <div className="error-block" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn-secondary" onClick={onRetry}>
          다시 시도
        </button>
      )}
    </div>
  );
}
