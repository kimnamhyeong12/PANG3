import { locationKey } from './routeSession';
import { isVisitComplete, numberVisitOrder } from './visitOrder';

export const pendingCoordinates = (rows) => Object.fromEntries(rows.filter(row => !isVisitComplete(row))
  .map(row => [locationKey(row), `${Number(row.lat)},${Number(row.lng)}`]));

// Removal/completion preserves the relative order; adding, undoing or moving a stop needs a solve.
export function onlyRemovedVisits(before, after) {
  if (!before || Object.keys(after).length >= Object.keys(before).length) return false;
  return Object.entries(after).every(([key, coordinate]) => before[key] === coordinate);
}

export function stableVisitOrder(rows, pinnedKey = null) {
  const pending = rows.filter(row => !isVisitComplete(row)).map((row, index) => ({ row, index }));
  pending.sort((a, b) => {
    if (locationKey(a.row) === pinnedKey) return -1;
    if (locationKey(b.row) === pinnedKey) return 1;
    return (Number(a.row.markerNumber) || Infinity) - (Number(b.row.markerNumber) || Infinity) || a.index - b.index;
  });
  return numberVisitOrder([...pending.map(item => item.row), ...rows.filter(isVisitComplete)]);
}
