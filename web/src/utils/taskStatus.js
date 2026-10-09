// task.status(=taskStatus)는 자유 문자열. 백엔드/앱 기준:
//   complete·completed·done → 완료, working(앱 일부에서 in_progress·progress) → 진행중, 그 외(pending, 빈 값) → 미처리
export const STATUS = {
  PENDING: 'pending',
  WORKING: 'working',
  COMPLETE: 'complete',
};

export const STATUS_LABEL = {
  [STATUS.PENDING]: '미처리',
  [STATUS.WORKING]: '진행중',
  [STATUS.COMPLETE]: '완료',
};

export function normalizeStatus(task) {
  const raw = String(task?.status ?? task?.taskStatus ?? '').trim().toLowerCase();
  if (['complete', 'completed', 'done'].includes(raw)) return STATUS.COMPLETE;
  if (['working', 'in_progress', 'progress'].includes(raw)) return STATUS.WORKING;
  return STATUS.PENDING;
}
