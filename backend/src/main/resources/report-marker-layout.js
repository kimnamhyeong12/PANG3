// Shared by the web editor and the self-contained HTML report (exports stripped there).
export function layoutReportMarkers(input, width, height) {
  const points = [...input].sort((a, b) => a.n - b.n);
  const crowded = new Set();
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    if (Math.abs(points[i].x - points[j].x) < 40 && Math.abs(points[i].y - points[j].y) < 50) {
      crowded.add(points[i]); crowded.add(points[j]);
    }
  }
  const labels = points.filter(p => !crowded.has(p)).map(point => ({ point, x: point.x, y: point.y - 24, moved: false }));
  const crosses = (a, b, c, d) => {
    const side = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
  };
  points.forEach((p, i) => {
    if (!crowded.has(p)) return;
    const near = points.filter(q => Math.hypot(q.x - p.x, q.y - p.y) < 100);
    const cx = near.reduce((sum, q) => sum + q.x, 0) / near.length;
    const cy = near.reduce((sum, q) => sum + q.y, 0) / near.length;
    const direction = Math.hypot(p.x - cx, p.y - cy) < 0.1 ? -Math.PI / 2 + i * 2.399963229728653 : Math.atan2(p.y - cy, p.x - cx);
    let best = null, bestScore = Infinity;
    for (let ring = 0; ring < Math.ceil(Math.hypot(width, height) / 20); ring++) {
      const radius = 48 + ring * 20, steps = Math.max(24, Math.ceil(2 * Math.PI * radius / 18));
      for (let step = 0; step < steps; step++) {
        const angle = direction + 2 * Math.PI * step / steps;
        const x = p.x + radius * Math.cos(angle), y = p.y + radius * Math.sin(angle);
        if (x < 20 || x > width - 20 || y < 20 || y > height - 36) continue;
        if (points.some(q => Math.hypot(x - q.x, y - q.y) < 25)) continue;
        if (labels.some(q => x > q.x - 38 && x < q.x + 38 && y > q.y - 38 && y < (q.moved ? q.y + 18 : q.point.y + 4) + 20)) continue;
        let score = radius + 10 * (1 - Math.cos(angle - direction));
        labels.forEach(q => { if (q.moved && crosses(p, { x, y }, q.point, q)) score += 1000; });
        if (score < bestScore) { bestScore = score; best = { point: p, x, y, moved: true }; }
      }
      if (best && bestScore < radius + 20) break;
    }
    labels.push(best || { point: p, x: Math.max(20, Math.min(width - 20, p.x)), y: Math.max(20, Math.min(height - 36, p.y - 48)), moved: true });
  });
  return labels.sort((a, b) => a.point.n - b.point.n);
}

export function createReportMarkerLayer(map, kakao, container, markers, makePin, onPick, initialActive = null) {
  let active = initialActive;
  const entries = markers.map(marker => {
    const root = document.createElement('div');
    Object.assign(root.style, { position: 'relative', width: '0px', height: '0px' });
    const position = new kakao.maps.LatLng(marker.lat, marker.lng);
    const overlay = new kakao.maps.CustomOverlay({ position, content: root, xAnchor: 0, yAnchor: 0, zIndex: 5, map });
    return { marker, root, position, overlay, badge: null };
  });
  function setActive(n) {
    active = n;
    entries.forEach(entry => {
      const selected = entry.marker.n === active;
      if (entry.badge) { entry.badge.classList.toggle('is-active', selected); entry.badge.style.outline = selected ? '3px solid #7A5BD6' : ''; }
      entry.overlay.setZIndex(selected ? 10 : 5);
    });
  }
  function paint() {
    const width = container.clientWidth, height = container.clientHeight;
    if (width < 80 || height < 80) return;
    const projection = map.getProjection();
    const points = entries.map(entry => {
      const point = projection.containerPointFromCoords(entry.position);
      entry.overlay.setVisible(point.x > -60 && point.x < width + 60 && point.y > -60 && point.y < height + 60);
      return { n: entry.marker.n, x: point.x, y: point.y };
    }).filter(p => p.x > -60 && p.x < width + 60 && p.y > -60 && p.y < height + 60);
    const byNumber = new Map(entries.map(entry => [entry.marker.n, entry]));
    layoutReportMarkers(points, width, height).forEach(label => {
      const entry = byNumber.get(label.point.n), color = entry.marker.color || '#94A3B8';
      const root = entry.root;
      root.replaceChildren();
      if (!label.moved) {
        entry.badge = makePin(entry.marker, entry.marker.n === active, onPick);
        Object.assign(entry.badge.style, { position: 'absolute', left: '-15px', top: '-38px' });
        root.appendChild(entry.badge);
        return;
      }
      const dx = label.x - label.point.x, dy = label.y - label.point.y;
      const length = Math.hypot(dx, dy), endX = dx - dx / length * 15, endY = dy - dy / length * 15;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      Object.assign(svg.style, { position: 'absolute', overflow: 'visible', pointerEvents: 'none' });
      svg.setAttribute('width', '1'); svg.setAttribute('height', '1');
      ['#FFFFFF', color].forEach((stroke, index) => {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        for (const [key, value] of Object.entries({ x1: 0, y1: 0, x2: endX, y2: endY, stroke, 'stroke-width': index ? 2 : 5 })) line.setAttribute(key, String(value));
        svg.appendChild(line);
      });
      root.appendChild(svg);
      const dot = document.createElement('span');
      Object.assign(dot.style, { position: 'absolute', left: '-4px', top: '-4px', width: '8px', height: '8px', borderRadius: '50%', background: color, boxShadow: '0 0 0 2px #FFF', pointerEvents: 'none' });
      root.appendChild(dot);
      const badge = document.createElement('button');
      badge.type = 'button'; badge.textContent = String(entry.marker.n);
      badge.title = `${entry.marker.n}. ${entry.marker.title || ''}`;
      badge.setAttribute('aria-label', badge.title);
      Object.assign(badge.style, { position: 'absolute', left: `${dx - 15}px`, top: `${dy - 15}px`, boxSizing: 'border-box', width: '30px', height: '30px', borderRadius: '50%', border: `3px solid ${color}`, background: '#4F9588', color: '#FFF', boxShadow: '0 0 0 2px #FFF', padding: '0', font: `bold ${String(entry.marker.n).length > 2 ? 10 : 12}px sans-serif`, cursor: 'pointer' });
      badge.onclick = () => onPick?.(entry.marker.n);
      entry.badge = badge; root.appendChild(badge);
    });
    setActive(active);
  }
  kakao.maps.event.addListener(map, 'idle', paint);
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(paint) : null;
  observer?.observe(container);
  paint();
  return { setActive, destroy() {
    kakao.maps.event.removeListener(map, 'idle', paint);
    observer?.disconnect();
    entries.forEach(entry => entry.overlay.setMap(null));
  } };
}
