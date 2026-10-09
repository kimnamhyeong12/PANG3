export function Spinner({ size = 18 }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />;
}

// 패널/테이블 영역용 로딩 표시
export function LoadingBlock({ label = '불러오는 중…' }) {
  return (
    <div className="loading-block" role="status">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

// 전체 화면 로딩 (그룹 정보 등)
export function LoadingScreen({ label }) {
  return (
    <div className="full-center">
      <LoadingBlock label={label} />
    </div>
  );
}

export function SkeletonLine({ width = '100%', height = 12 }) {
  return <span className="skeleton" style={{ width, height }} />;
}

// 테이블 자리 표시용 스켈레톤 행
export function SkeletonTable({ rows = 6, columns = 5 }) {
  return (
    <div className="skeleton-table" role="status" aria-label="불러오는 중">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="skeleton-row">
          {Array.from({ length: columns }, (_, c) => (
            <SkeletonLine key={c} width={c === 2 ? '90%' : '70%'} />
          ))}
        </div>
      ))}
    </div>
  );
}
