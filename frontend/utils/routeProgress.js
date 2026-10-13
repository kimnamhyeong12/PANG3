const point = value => {
  const lat = value?.lat ?? value?.latitude ?? value?.y;
  const lng = value?.lng ?? value?.longitude ?? value?.x;
  return lat != null && lng != null && lat !== '' && lng !== '' &&
    Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? { lat: Number(lat), lng: Number(lng) } : null;
};

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
