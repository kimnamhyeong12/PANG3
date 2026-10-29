// Pure geometry, shared by the transport guard, device canvas and HTML pin hotspots.
export function validReportMap(spec) {
  return spec && Number.isInteger(spec.width) && Number.isInteger(spec.height)
    && spec.width >= 256 && spec.width <= 1920 && spec.height >= 256 && spec.height <= 1200
    && Array.isArray(spec.markers) && spec.markers.length <= 202
    && spec.markers.every(m => Number.isInteger(m.n) && m.n > 0 && m.n <= 10000
      && Number.isFinite(m.lat) && Math.abs(m.lat) <= 90 && Number.isFinite(m.lng) && Math.abs(m.lng) <= 180
      && /^#[0-9a-f]{6}$/i.test(m.color));
}

export function planReportMap(spec) {
  if (!validReportMap(spec)) throw new Error('위치도 좌표와 마커를 확인해 주세요.');
  const { width, height, markers } = spec;
  if (!markers.length) return { points: [], tiles: [], width, height };
  const project = (marker, zoom) => {
    const scale = 256 * 2 ** zoom, s = Math.sin(Math.max(-85, Math.min(85, marker.lat)) * Math.PI / 180);
    return { n: marker.n, x: (marker.lng + 180) / 360 * scale,
      y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale };
  };
  let points, minX, maxX, minY, maxY, zoom;
  for (zoom = 17; zoom >= 7; zoom--) {
    points = markers.map(m => project(m, zoom));
    minX = Math.min(...points.map(p => p.x)); maxX = Math.max(...points.map(p => p.x));
    minY = Math.min(...points.map(p => p.y)); maxY = Math.max(...points.map(p => p.y));
    if (markers.length === 1 || maxX - minX <= width - 112 && maxY - minY <= height - 142 || zoom === 7) break;
  }
  const left = (minX + maxX) / 2 - width / 2, top = (minY + maxY) / 2 - height / 2 - 14;
  const limit = 2 ** zoom, tiles = [];
  for (let y = Math.floor(top / 256); y <= Math.floor((top + height) / 256); y++) {
    if (y < 0 || y >= limit) continue;
    for (let x = Math.floor(left / 256); x <= Math.floor((left + width) / 256); x++)
      tiles.push({ z: zoom, x: ((x % limit) + limit) % limit, y,
        dx: Math.round(x * 256 - left), dy: Math.round(y * 256 - top) });
  }
  return { width, height, zoom, tiles, points: points.map(p => ({ ...p, x: p.x - left, y: p.y - top })) };
}
