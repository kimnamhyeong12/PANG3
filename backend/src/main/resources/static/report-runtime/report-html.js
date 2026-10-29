import { CSS, MAP_SCRIPT, PAGE_SCRIPT } from './report-html-style.js';
import { layoutReportMarkers } from './report-marker-layout.js';
import { planReportMap } from './report-map-plan.js';

const COLORS = ['#2477F3', '#12A9A5', '#BE9446', '#E34D59', '#4F9588', '#1551A6', '#C87973', '#078A88'];
const AUTHOR_COLORS = ['#2477F3', '#12A9A5', '#BE9446', '#7A5BD6', '#E34D59', '#1551A6', '#C87973', '#078A88'];
const LABELS = { adminDong: '행정동', year: '연도', author: '작성자', category: '분류' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const multiline = value => esc(value).replace(/\r?\n/g, '<br>');
const date = value => String(value || '-').slice(0, 10);
const scriptJson = value => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const validPosition = item => Number.isFinite(item.lat) && Number.isFinite(item.lng) && Math.abs(item.lat) <= 90 && Math.abs(item.lng) <= 180;

// Same projection/fit and collision layout as StaticMapService, preserving clickable static pins.
function staticSpots(markers, width = 960, height = 560) {
  return layoutReportMarkers(planReportMap({ markers, width, height }).points, width, height);
}

export function renderReportHtml(data, images, generatedAt = new Date()) {
  const report = data.report || {}, project = data.project || {}, summary = data.summary || {}, period = summary.period || {};
  const sections = data.sections || [], groupBy = report.groupBy || 'adminDong';
  const authors = new Map(), markers = [], entries = [];
  const authorColor = item => {
    const name = item.author?.name || '-';
    if (!authors.has(name)) authors.set(name, AUTHOR_COLORS[authors.size % AUTHOR_COLORS.length]);
    return authors.get(name);
  };
  const image = key => {
    const value = images.get(key);
    if (value && !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value)) throw new Error('사진 형식이 올바르지 않습니다.');
    return value;
  };
  for (const section of sections) for (const item of section.items || []) {
    const n = entries.length + 1, color = authorColor(item);
    entries.push({ n, item, section, color });
    if (validPosition(item)) markers.push({ n, lat: item.lat, lng: item.lng, color, title: String(item.title || '') });
  }
  let html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${esc(report.title)}</title><style>${CSS}</style></head><body><main class="rp">`;
  const status = report.status === 'DRAFT' ? '<span class="rp-badge">초안</span> '
    : report.status ? `<span class="rp-badge rp-final">확정 v${esc(report.version)}</span> ` : '';
  const range = period.from || period.to ? `${period.from || ''} ~ ${period.to || ''}` : '-';
  html += `<header class="rp-head"><div class="rp-kicker">${esc(project.groupName)} · ${esc(project.name)}</div><h1>${esc(report.title)}</h1><div class="rp-sub">${status}기간 ${esc(range)} · 총 ${esc(summary.totalCount ?? entries.length)}건 · ${esc(LABELS[groupBy] || groupBy)}별 · 작성자 ${esc((summary.authors || []).join(', ') || '-')}</div></header>`;
  html += '<section class="rp-sec rp-mapbox">';
  const overview = image(data.overviewMapImage);
  if (overview) {
    html += `<div class="rp-static" id="report-static-map"><img alt="위치도" src="${overview}">`;
    for (const spot of staticSpots(markers)) html += `<a class="rp-hot" href="#item-${spot.point.n}" data-n="${spot.point.n}" title="${spot.point.n}번 항목으로 이동" style="left:${Math.max(0, Math.min(100, spot.x / 960 * 100))}%;top:${Math.max(0, Math.min(100, spot.y / 560 * 100))}%"></a>`;
    html += '</div>';
  }
  html += `<div id="report-map" class="rp-map"></div><script type="application/json" id="report-markers">${scriptJson(markers)}</script>`;
  html += `<div class="rp-legend">${[...authors].map(([name, color]) => `<span><i style="border-color:${color}"></i>${esc(name)}</span>`).join('')}</div>`;
  html += `<div id="report-fallback"><table class="rp-table"><thead><tr><th class="rp-num">번호</th><th>위치</th><th>${esc(LABELS[groupBy] || '섹션')}</th><th>완료일</th></tr></thead><tbody>`;
  html += entries.map(({ n, item, section }) => `<tr data-n="${n}" title="눌러서 이 항목으로 이동"><td class="rp-num">${n}</td><td>${esc(item.address || '-')}</td><td>${esc(section.label)}</td><td>${esc(date(item.completedAt))}</td></tr>`).join('') || '<tr><td colspan="4" class="rp-empty">담긴 항목이 없습니다.</td></tr>';
  html += '</tbody></table></div></section>';
  let number = 0;
  sections.forEach((section, index) => {
    html += `<section class="rp-group"><h2 style="border-left-color:${COLORS[index % COLORS.length]}">${esc(section.label)} <small>${(section.items || []).length}건</small></h2>`;
    for (const item of section.items || []) {
      const n = ++number, color = authorColor(item);
      html += `<article class="rp-card" id="item-${n}"><div class="rp-card-head"><span class="rp-no" style="border-color:${color}">${n}</span><div><h3>${esc(String(item.title || '').trim() || item.address || '-')}</h3><div class="rp-meta">${esc(item.address || '-')} · ${esc(date(item.completedAt))} · ${esc(item.author?.name)}${item.category ? ' · ' + esc(item.category) : ''}</div></div></div>`;
      const photos = (item.photos || []).map(photo => {
        const src = image(photo.url); if (!src) return '';
        const slot = String(photo.slot || ''), caption = String(photo.comment || '').trim();
        const slotClass = ({ '작업 전': 'before', '작업 중': 'during', '작업 후': 'after' })[slot] || 'other';
        return `<figure><div class="rp-img"><img src="${src}" alt="${esc((slot + ' ' + caption).trim())}">${slot ? `<span class="rp-slot rp-slot-${slotClass}">${esc(slot)}</span>` : ''}</div>${caption ? `<figcaption>${multiline(caption)}</figcaption>` : ''}</figure>`;
      }).join('');
      if (photos) html += `<div class="rp-photos">${photos}</div>`;
      const map = image(item.mapImage);
      html += `<div class="rp-detail${map ? '' : ' rp-nomap'}">${map ? `<figure class="rp-locmap"><img src="${map}" alt="위치도 ${esc(item.address || '-')}"><figcaption>위치도 · ${esc(item.address || '-')}</figcaption></figure>` : ''}<div class="rp-detail-text"><div class="rp-label">본문</div><p class="rp-text">${multiline(String(item.comment || '').trim() || '-')}</p></div></div></article>`;
    }
    html += '</section>';
  });
  const timestamp = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' }).format(generatedAt);
  html += `<footer class="rp-foot">생성 ${esc(timestamp)}${report.reportId ? ' · 보고서 #' + esc(report.reportId) : ''}</footer></main>`;
  html += '<div class="rp-lightbox" id="rp-lightbox" hidden><button type="button" class="rp-lb-close" aria-label="닫기">×</button><button type="button" class="rp-lb-prev" aria-label="이전 사진">‹</button><figure><img alt=""><figcaption></figcaption></figure><button type="button" class="rp-lb-next" aria-label="다음 사진">›</button></div>';
  return html + `<script>${MAP_SCRIPT}${PAGE_SCRIPT}</script></body></html>`;
}

export async function buildHtmlReport(descriptor, requestAsset, onProgress) {
  const images = new Map();
  let total = 0;
  try {
    for (let index = 0; index < descriptor.assets.length; index++) {
      const asset = descriptor.assets[index];
      onProgress(`사진·위치도를 불러오고 있어요. (${index + 1}/${descriptor.assets.length})`);
      const result = await requestAsset(index);
      if (result.error) throw new Error(result.error);
      if (result.empty && asset.optional) continue;
      const binary = atob(result.data || ''); total += binary.length;
      if (!binary.length || binary.length > 15 * 1024 * 1024 || total > 100 * 1024 * 1024) throw new Error('사진 용량이 큽니다. 보고서를 나누어 만들어 주세요.');
      const blob = new Blob([Uint8Array.from(binary, c => c.charCodeAt(0))]);
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      try {
        if (bitmap.width * bitmap.height > 24_000_000) throw new Error('사진 해상도가 너무 큽니다.');
        const scale = Math.min(1, 960 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        images.set(asset.path, canvas.toDataURL('image/jpeg', 0.7));
      } finally { bitmap.close(); canvas.width = canvas.height = 0; }
    }
    onProgress('이 기기에서 HTML 보고서를 만들고 있어요.');
    const html = renderReportHtml(descriptor.payload, images);
    if (new Blob([html]).size > 64 * 1024 * 1024) throw new Error('보고서 파일이 큽니다. 나누어 만들어 주세요.');
    return html;
  } finally { images.clear(); }
}
