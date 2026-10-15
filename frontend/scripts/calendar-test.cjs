const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const code = fs.readFileSync(path.join(__dirname, '../utils/calendar.js'), 'utf8');
  const { currentMonthRange, calendarCells, shiftMonth, selectRangeDate } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  assert.deepEqual(currentMonthRange(new Date(2026, 9, 14, 12)), { start: '2026-10-01', end: '2026-10-31' });
  assert.equal(currentMonthRange(new Date(2024, 1, 1, 12)).end, '2024-02-29');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  const cells = calendarCells('2026-10');
  assert.equal(cells.length % 7, 0); assert.equal(cells[3], '2026-10-01');
  assert.equal(cells.filter(Boolean).length, 31);
  assert.deepEqual(selectRangeDate('2026-10-01', '2026-10-31', 'start', '2026-11-05'), { start: '2026-11-05', end: '2026-11-05' });
  assert.deepEqual(selectRangeDate('2026-10-01', '2026-10-31', 'end', '2026-09-20'), { start: '2026-09-20', end: '2026-09-20' });
  assert.deepEqual(selectRangeDate('', '', 'start', '2020-01-01'), { start: '2020-01-01', end: '' });
  assert.deepEqual(selectRangeDate('', '', 'end', '2020-12-31'), { start: '', end: '2020-12-31' });
  console.log('Report calendar checks passed: month defaults, leap day, year transitions and range ordering');
})().catch(error => { console.error(error); process.exit(1); });
