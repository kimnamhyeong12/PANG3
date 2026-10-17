const point = value => {
  const lat = value?.lat ?? value?.latitude ?? value?.y;
  const lng = value?.lng ?? value?.longitude ?? value?.x;
  return lat != null && lng != null && lat !== '' && lng !== '' &&
    Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? { lat: Number(lat), lng: Number(lng) } : null;
};

// A straight progress rail represents distance along the route, not the aerial distance.
export function routeCompletion(totalDistance, remainingDistance) {
  if (totalDistance == null || remainingDistance == null) return null;
  const total = Number(totalDistance), remaining = Number(remainingDistance);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(remaining) || remaining < 0) return null;
  return Math.max(0, Math.min(1, (total - remaining) / total));
}

export function routeTrafficRail(sections) {
  const rows = (Array.isArray(sections) ? sections : []).map(section => {
    const points = (section.path || []).map(point);
    let distance = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      if (!a || !b) continue;
      const dy = (b.lat - a.lat) * Math.PI / 180;
      const dx = (b.lng - a.lng) * Math.PI / 180 * Math.cos((a.lat + b.lat) * Math.PI / 360);
      distance += Math.hypot(dx, dy) * 6371000;
    }
    const palette = { 1: '#DC2626', 2: '#F97316', 3: '#FACC15', 4: '#16A34A', 6: '#64748B' };
    return { distance, color: palette[Number(section.trafficState)] || '#9CA3AF' };
  }).filter(row => row.distance > 0);
  const total = rows.reduce((sum, row) => sum + row.distance, 0);
  let passed = 0;
  return rows.map(row => {
    const result = { color: row.color, start: passed / total, fraction: row.distance / total };
    passed += row.distance;
    return result;
  });
}

// Project GPS onto each route segment so even a two-point path updates smoothly.
export function remainingRouteProgress(segment, position) {
  const current = point(position);
  const points = (segment?.path || []).map(point);
  if (!current || points.length < 2 || points.some(value => !value)) return null;
  const scaleY = Math.PI * 6371000 / 180;
  const scaleX = scaleY * Math.cos(current.lat * Math.PI / 180);
  let total = 0, travelled = 0, nearest = Infinity;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1], b = points[index];
    const dx = (b.lng - a.lng) * scaleX, dy = (b.lat - a.lat) * scaleY;
    const px = (current.lng - a.lng) * scaleX, py = (current.lat - a.lat) * scaleY;
    const squared = dx * dx + dy * dy;
    const fraction = squared ? Math.max(0, Math.min(1, (px * dx + py * dy) / squared)) : 0;
    const offset = Math.hypot(px - dx * fraction, py - dy * fraction);
    const length = Math.sqrt(squared);
    if (offset < nearest) { nearest = offset; travelled = total + length * fraction; }
    total += length;
  }
  const ratio = total ? Math.max(0, Math.min(1, (total - travelled) / total)) : 0;
  const distance = Number(segment.totalDistance ?? segment.distance ?? total);
  const duration = Number(segment.totalDuration ?? segment.duration);
  return {
    distance: Math.round(Math.max(0, Number.isFinite(distance) ? distance : total) * ratio),
    duration: Number.isFinite(duration) ? Math.round(Math.max(0, duration) * ratio) : null,
    distanceFromPath: nearest,
  };
}
