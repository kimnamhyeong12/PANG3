export const dateKey = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
export function currentMonthRange(now = new Date()) {
  const year = now.getFullYear(), month = now.getMonth() + 1;
  return { start: dateKey(year, month, 1), end: dateKey(year, month, new Date(year, month, 0, 12).getDate()) };
}
export function calendarCells(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const leading = (new Date(year, month - 1, 1, 12).getDay() + 6) % 7;
  const count = new Date(year, month, 0, 12).getDate();
  const cells = Array(leading).fill(null);
  for (let day = 1; day <= count; day++) cells.push(dateKey(year, month, day));
  while (cells.length % 7) cells.push(null);
  return cells;
}
export function shiftMonth(monthKey, offset) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1 + offset, 1, 12);
  return dateKey(date.getFullYear(), date.getMonth() + 1, 1).slice(0, 7);
}
export function selectRangeDate(start, end, side, value) {
  return side === 'start' ? { start: value, end: end && value > end ? value : end }
    : { start: start && value < start ? value : start, end: value };
}
