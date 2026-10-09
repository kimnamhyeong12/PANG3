const KOREA_OFFSET_MS = 9 * 60 * 60 * 1000;

export const koreaDayKey = (date = new Date()) =>
  new Date(date.getTime() + KOREA_OFFSET_MS).toISOString().slice(0, 10);

// completedAt is stored by the server as an Asia/Seoul local date-time.
export const completionDayKey = (item) => {
  const value = item?.completedAt ?? item?.completed_at;
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || null;
};

export const isCurrentWork = (item, today = koreaDayKey()) => {
  const status = String(item?.status ?? item?.taskStatus ?? item?.task_status ?? '').toLowerCase();
  if (!['complete', 'completed', 'done'].includes(status)) return true;
  return completionDayKey(item) === today;
};
