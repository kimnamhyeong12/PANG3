import { STATUS } from '../../utils/taskStatus.js';

// 디자인 토큰과 같은 값 (SVG data URI 안에서는 CSS 변수를 쓸 수 없음)
export const COLORS = {
  navy: '#1B3A5C',
  green: '#1E8E5A',
  amber: '#B9790A',
  red: '#C0392B',
  gray: '#6B7280',
};

export const STATUS_COLOR = {
  [STATUS.PENDING]: COLORS.red,
  [STATUS.WORKING]: COLORS.amber,
  [STATUS.COMPLETE]: COLORS.green,
};

const svgUrl = (svg) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

function pinSvg(color, selected) {
  const stroke = selected ? COLORS.navy : '#FFFFFF';
  const strokeWidth = selected ? 3 : 2;
  return svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">` +
      `<path d="M14 1C7 1 1.5 6.4 1.5 13.2 1.5 22.5 14 35 14 35s12.5-12.5 12.5-21.8C26.5 6.4 21 1 14 1z" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}"/>` +
      `<circle cx="14" cy="13" r="4.5" fill="#FFFFFF"/></svg>`
  );
}

const cache = new Map();

function cached(key, create) {
  if (!cache.has(key)) cache.set(key, create());
  return cache.get(key);
}

export function taskMarkerImage(kakao, status, selected = false) {
  return cached(`task-${status}-${selected}`, () => {
    const size = selected ? new kakao.maps.Size(34, 44) : new kakao.maps.Size(28, 36);
    const offset = selected ? new kakao.maps.Point(17, 44) : new kakao.maps.Point(14, 36);
    return new kakao.maps.MarkerImage(pinSvg(STATUS_COLOR[status], selected), size, { offset });
  });
}

export function busStopMarkerImage(kakao) {
  return cached('bus', () =>
    new kakao.maps.MarkerImage(
      svgUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14">` +
          `<circle cx="7" cy="7" r="5.5" fill="${COLORS.gray}" stroke="#FFFFFF" stroke-width="2"/></svg>`
      ),
      new kakao.maps.Size(14, 14),
      { offset: new kakao.maps.Point(7, 7) }
    )
  );
}

export function aedMarkerImage(kakao) {
  return cached('aed', () =>
    new kakao.maps.MarkerImage(
      svgUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">` +
          `<rect x="1" y="1" width="18" height="18" rx="5" fill="${COLORS.navy}" stroke="#FFFFFF" stroke-width="2"/>` +
          `<path d="M10 5.5v9M5.5 10h9" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round"/></svg>`
      ),
      new kakao.maps.Size(20, 20),
      { offset: new kakao.maps.Point(10, 10) }
    )
  );
}

export function searchMarkerImage(kakao) {
  return cached('search', () =>
    new kakao.maps.MarkerImage(pinSvg(COLORS.navy, false), new kakao.maps.Size(28, 36), {
      offset: new kakao.maps.Point(14, 36),
    })
  );
}
