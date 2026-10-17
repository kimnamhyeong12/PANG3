const KINDS = new Set(['camera', 'section', 'school', 'caution']);

export function safetyGuideNotice(data, destinationKey) {
  if (!data || !destinationKey || data.destinationKey !== destinationKey || data.visible !== true || !KINDS.has(data.kind)) return null;
  if (typeof data.distance !== 'number' || !Number.isFinite(data.distance) || data.distance < 0 || data.distance > 1500) return null;
  const speedLimit = Number.isInteger(data.speedLimit) && data.speedLimit > 0 && data.speedLimit <= 200 ? data.speedLimit : null;
  return { destinationKey, kind: data.kind, label: String(data.label || '안전 안내'),
    distance: Math.round(data.distance), speedLimit, overSpeed: data.overSpeed === true };
}
