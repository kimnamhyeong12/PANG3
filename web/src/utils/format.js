const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function formatToday(date = new Date()) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAYS[date.getDay()]})`;
}

// LocalDate 응답: "2026-10-05" (Jackson 설정에 따라 [2026, 10, 5] 배열일 수도 있어 둘 다 처리)
export function formatDate(value) {
  if (!value) return '-';
  if (Array.isArray(value)) {
    const [y, m, d] = value;
    return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`;
  }
  return String(value).slice(0, 10).replaceAll('-', '.');
}

// LocalDateTime 응답: "2026-10-05T12:31:59.111" → "2026.10.05 12:31"
export function formatDateTime(value) {
  if (!value) return '-';
  if (Array.isArray(value)) {
    const [y, m, d, hh = 0, mm = 0] = value;
    const pad = (n) => String(n).padStart(2, '0');
    return `${y}.${pad(m)}.${pad(d)} ${pad(hh)}:${pad(mm)}`;
  }
  const [date, time = ''] = String(value).split('T');
  return `${date.replaceAll('-', '.')} ${time.slice(0, 5)}`.trim();
}
