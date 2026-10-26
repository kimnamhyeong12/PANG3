import { locationKey } from './routeSession';

export const isVisitComplete = (row) => ['complete', 'completed', 'done'].includes(
  String(row?.status ?? row?.taskStatus ?? row?.task_status ?? '').toLowerCase()
);

export const hasVisitCoordinates = (row) => row?.lat != null && row?.lng != null &&
  Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng)) &&
  Math.abs(Number(row.lat)) <= 90 && Math.abs(Number(row.lng)) <= 180;

export function visitDistance(a, b) {
  if (!hasVisitCoordinates(a) || !hasVisitCoordinates(b)) return Infinity;
  const rad = Math.PI / 180;
  const x = Math.sin((Number(b.lat) - Number(a.lat)) * rad / 2) ** 2 +
    Math.cos(Number(a.lat) * rad) * Math.cos(Number(b.lat) * rad) *
    Math.sin((Number(b.lng) - Number(a.lng)) * rad / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
}

export function numberVisitOrder(rows) {
  let number = 0;
  return rows.map((row) => ({ ...row, priority: null, visitOrderVersion: 2,
    markerNumber: isVisitComplete(row) ? null : ++number }));
}

// Immediate offline recommendation, including the fixed return endpoint when registered.
// Keep a destination already being guided to at the front when visits are added.
export function recommendVisitOrder(rows, start, pinnedKey = null, returnLocation = null) {
  const pending = rows.filter((row) => !isVisitComplete(row));
  const completed = rows.filter(isVisitComplete);
  const pinned = pending.find((row) => locationKey(row) === pinnedKey);
  const remaining = pending.filter((row) => row !== pinned);
  if (!hasVisitCoordinates(start)) return numberVisitOrder([...(pinned ? [pinned] : []), ...remaining, ...completed]);
  const ordered = [];
  let cursor = pinned || start;
  while (remaining.length) {
    let nearest = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (visitDistance(cursor, remaining[i]) < visitDistance(cursor, remaining[nearest])) nearest = i;
    }
    const [next] = remaining.splice(nearest, 1);
    ordered.push(next);
    cursor = next;
  }
  // Bound work for large imported lists so numbering never stalls the map.
  if (ordered.length <= 500) {
    for (let pass = 0; pass < (ordered.length <= 100 ? 4 : 1); pass++) {
      let improved = false;
      for (let i = 0; i < ordered.length - 1; i++) {
        for (let j = i + 1; j < ordered.length; j++) {
          const before = i === 0 ? pinned || start : ordered[i - 1];
          const after = ordered[j + 1] || (hasVisitCoordinates(returnLocation) ? returnLocation : null);
          const oldCost = visitDistance(before, ordered[i]) + (after ? visitDistance(ordered[j], after) : 0);
          const newCost = visitDistance(before, ordered[j]) + (after ? visitDistance(ordered[i], after) : 0);
          if (newCost + 0.5 < oldCost) {
            ordered.splice(i, j - i + 1, ...ordered.slice(i, j + 1).reverse());
            improved = true;
          }
        }
      }
      if (!improved) break;
    }
  }
  return numberVisitOrder([...(pinned ? [pinned] : []), ...ordered, ...completed]);
}

export function promoteVisit(rows, key) {
  const target = rows.find((row) => locationKey(row) === key && !isVisitComplete(row));
  if (!target) return rows;
  // Provisional display only; the server optimizes the remaining visits using cached durations.
  return numberVisitOrder([target, ...rows.filter((row) => row !== target && !isVisitComplete(row)), ...rows.filter(isVisitComplete)]);
}

export const visitSetKey = (rows) => JSON.stringify(rows.map((row) => [
  locationKey(row), Number(row.lat), Number(row.lng), isVisitComplete(row),
]).sort((a, b) => a[0].localeCompare(b[0])));
