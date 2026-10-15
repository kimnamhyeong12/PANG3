export const locationKey = (location) => String(location.id ?? `${location.lat},${location.lng},${location.detailAddress}`);

export function numberVisits(rows, savedNumbers = {}, { visitOrderVersion } = {}) {
  if (visitOrderVersion === 2) {
    rows = rows.map((row) => Object.prototype.hasOwnProperty.call(savedNumbers, locationKey(row))
      ? { ...row, visitOrderVersion: 2, markerNumber: savedNumbers[locationKey(row)] }
      : row);
  }
  if (rows.length && rows.every((row) => row.visitOrderVersion === 2)) {
    let next = 0;
    return [...rows].sort((a, b) => (a.markerNumber || Infinity) - (b.markerNumber || Infinity))
      .map((row) => ({ ...row, markerNumber: row.status === 'complete' ? null : ++next }));
  }
  const numbers = { ...savedNumbers };
  rows.forEach((row) => {
    if (Number.isInteger(row.markerNumber) && row.markerNumber > 0) numbers[locationKey(row)] = row.markerNumber;
  });
  let next = Math.max(0, ...Object.values(numbers).filter(Number.isInteger));
  return rows.map((row) => {
    const key = locationKey(row);
    if (!numbers[key]) numbers[key] = ++next;
    return { ...row, markerNumber: numbers[key] };
  });
}

export function numberOptimizedVisits(optimized, completed) {
  const reserved = new Set(completed.map((row) => row.markerNumber));
  let next = 1;
  const numbered = optimized.map((row) => {
    while (reserved.has(next)) next++;
    return { ...row, markerNumber: next++ };
  });
  return [...numbered, ...completed];
}

// Server task status remains authoritative; the session only owns visit order and geometry.
export function restoreRouteSession(rows, session, day, { singleDestinationOnly = false, explicitlyEnded = false } = {}) {
  if (explicitlyEnded || !session || session.day !== day || !session.optimized || !Array.isArray(session.order) || !Array.isArray(session.routeSegments)) return null;
  const segment = session.routeSegments[0];
  if (segment?.destinationKey) {
    const target = rows.find((row) => locationKey(row) === segment.destinationKey);
    if (!target || ['complete', 'completed', 'done'].includes(String(target.status).toLowerCase())) return null;
    const previousTarget = session.locations?.find((row) => locationKey(row) === segment.destinationKey);
    if (previousTarget && (Math.abs(Number(previousTarget.lat) - Number(target.lat)) > 0.000001
      || Math.abs(Number(previousTarget.lng) - Number(target.lng)) > 0.000001)) return null;
    const numbers = session.visitNumbers || {};
    const ordered = [...rows].sort((a, b) =>
      (a.markerNumber || numbers[locationKey(a)] || Infinity) - (b.markerNumber || numbers[locationKey(b)] || Infinity));
    let next = 0;
    return {
      locations: ordered.map((row) => ({ ...row, priority: null,
        markerNumber: row.status === 'complete' ? null : ++next })),
      segments: [segment], currentSegmentIndex: 0,
      isGuiding: Boolean(session.isGuiding), optimized: true,
    };
  }
  // Legacy routes cover all visits. Do not resume those in the single-place UI.
  if (singleDestinationOnly) return null;
  rows = numberVisits(rows, session.visitNumbers || Object.fromEntries(session.order.map((id, index) => [id, index + 1])));
  const byId = new Map(rows.map((row) => [locationKey(row), row]));
  const remaining = session.order.flatMap((id, index) => {
    const row = byId.get(id);
    return row && row.status !== 'complete' ? [{ row, segment: session.routeSegments[index], index }] : [];
  });
  const orderedIds = new Set(session.order);
  const added = rows.filter((row) => row.status !== 'complete' && !orderedIds.has(locationKey(row)));
  if (remaining.some((item) => item.segment === undefined)) return null;
  const nextIndex = remaining.findIndex((item) => item.index >= (session.currentSegmentIndex || 0));
  return {
    locations: [...remaining.map((item) => item.row), ...added, ...rows.filter((row) => row.status === 'complete')],
    segments: [...remaining.map((item) => item.segment || null), ...added.map(() => null)],
    currentSegmentIndex: Math.max(0, nextIndex),
    isGuiding: Boolean(session.isGuiding && remaining.length),
    optimized: remaining.length > 0,
  };
}
