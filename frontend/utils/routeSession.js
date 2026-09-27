export const locationKey = (location) => String(location.id ?? `${location.lat},${location.lng},${location.detailAddress}`);

// Server task status remains authoritative; the session only owns visit order and geometry.
export function restoreRouteSession(rows, session, day) {
  if (!session || session.day !== day || !session.optimized || !Array.isArray(session.order) || !Array.isArray(session.routeSegments)) return null;
  const byId = new Map(rows.map((row) => [locationKey(row), row]));
  const remaining = session.order.flatMap((id, index) => {
    const row = byId.get(id);
    return row && row.status !== 'complete' ? [{ row, segment: session.routeSegments[index], index }] : [];
  });
  const orderedIds = new Set(session.order);
  if (rows.some((row) => row.status !== 'complete' && !orderedIds.has(locationKey(row)))) return null;
  if (remaining.some((item) => !item.segment)) return null;
  const nextIndex = remaining.findIndex((item) => item.index >= (session.currentSegmentIndex || 0));
  return {
    locations: [...remaining.map((item) => item.row), ...rows.filter((row) => row.status === 'complete')],
    segments: remaining.map((item) => item.segment),
    currentSegmentIndex: Math.max(0, nextIndex),
    isGuiding: Boolean(session.isGuiding && remaining.length),
    optimized: remaining.length > 0,
  };
}
