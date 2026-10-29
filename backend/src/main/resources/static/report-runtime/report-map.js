import { planReportMap } from './report-map-plan.js';
import { layoutReportMarkers } from './report-marker-layout.js';

// One per document. Keep a small compressed tile cache; decoded bitmaps are always closed immediately.
export function createMapRenderer(requestTile) {
  const cache = new Map();
  let cacheBytes = 0;
  const getTile = async tile => {
    const key = `${tile.z}/${tile.x}/${tile.y}`;
    if (cache.has(key)) { const value = cache.get(key); cache.delete(key); cache.set(key, value); return value; }
    const result = await requestTile(tile);
    if (result.error) throw new Error(result.error);
    cache.set(key, result); cacheBytes += result.data.length;
    while (cache.size > 48 || cacheBytes > 8 * 1024 * 1024) {
      const first = cache.keys().next().value;
      cacheBytes -= cache.get(first).data.length; cache.delete(first);
    }
    return result;
  };
  return async spec => {
    const plan = planReportMap(spec);
    if (!plan.points.length) return { empty: true };
    const canvas = document.createElement('canvas');
    canvas.width = plan.width; canvas.height = plan.height;
    const context = canvas.getContext('2d');
    let attribution = '';
    try {
      context.fillStyle = '#E8EEF5'; context.fillRect(0, 0, canvas.width, canvas.height);
      for (const tile of plan.tiles) {
        const result = await getTile(tile);
        attribution = result.attribution || attribution;
        const binary = atob(result.data);
        const bitmap = await createImageBitmap(new Blob([Uint8Array.from(binary, c => c.charCodeAt(0))]));
        try {
          if (bitmap.width !== 256 || bitmap.height !== 256) throw new Error('지도 배경 크기가 올바르지 않습니다.');
          context.drawImage(bitmap, tile.dx, tile.dy, 256, 256);
        } finally { bitmap.close(); }
      }
      const labels = layoutReportMarkers(plan.points, plan.width, plan.height);
      const markers = new Map(spec.markers.map(m => [m.n, m]));
      for (const label of labels.filter(label => label.moved)) {
        const p = label.point, dx = label.x - p.x, dy = label.y - p.y, length = Math.hypot(dx, dy);
        context.beginPath(); context.moveTo(p.x, p.y); context.lineTo(label.x - dx / length * 15, label.y - dy / length * 15);
        context.strokeStyle = '#fff'; context.lineWidth = 5; context.stroke();
        context.strokeStyle = markers.get(p.n).color; context.lineWidth = 2; context.stroke();
      }
      for (const label of labels.filter(label => label.moved)) {
        circle(context, label.point.x, label.point.y, 6); context.fillStyle = '#fff'; context.fill();
        circle(context, label.point.x, label.point.y, 3.5); context.fillStyle = markers.get(label.point.n).color; context.fill();
      }
      for (const label of labels) {
        const color = markers.get(label.point.n).color;
        if (label.moved) {
          circle(context, label.x, label.y, 15); context.fillStyle = '#4F9588'; context.fill();
          context.strokeStyle = '#fff'; context.lineWidth = 5; context.stroke();
          context.strokeStyle = color; context.lineWidth = 3; context.stroke();
          number(context, label.point.n, label.x, label.y);
        } else pin(context, label.point.x, label.point.y, label.point.n, color);
      }
      if (attribution) {
        context.font = '11px sans-serif'; context.textAlign = 'left'; context.textBaseline = 'alphabetic';
        const width = context.measureText(attribution).width + 10;
        context.fillStyle = 'rgba(255,255,255,.8)'; context.fillRect(canvas.width - width, canvas.height - 16, width, 16);
        context.fillStyle = '#40536F'; context.fillText(attribution, canvas.width - width + 5, canvas.height - 4);
      }
      return { data: canvas.toDataURL('image/jpeg', 0.7).split(',')[1] };
    } finally { canvas.width = canvas.height = 0; }
  };
}
function circle(context, x, y, radius) { context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); }
function number(context, n, x, y) {
  context.fillStyle = '#fff'; context.font = `bold ${String(n).length > 2 ? 10 : 12}px sans-serif`;
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(String(n), x, y);
}
function pin(context, x, y, n, color) {
  const cy = y - 24;
  context.beginPath(); context.arc(x, cy, 15, 0, Math.PI * 2);
  context.moveTo(x - 15 * .62, cy + 15 * .78); context.lineTo(x, y); context.lineTo(x + 15 * .62, cy + 15 * .78); context.closePath();
  context.save(); context.shadowColor = 'rgba(0,0,0,.28)'; context.shadowOffsetX = 1.5; context.shadowOffsetY = 2.5;
  context.fillStyle = '#4F9588'; context.fill(); context.restore();
  circle(context, x, cy, 13); context.lineWidth = 4; context.strokeStyle = color; context.stroke();
  circle(context, x, cy, 15); context.lineWidth = 1.2; context.strokeStyle = '#fff'; context.stroke();
  number(context, n, x, cy);
}
