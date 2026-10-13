const regionAliases = { 서울: '서울', 부산: '부산', 대구: '대구', 인천: '인천', 광주: '광주', 대전: '대전', 울산: '울산', 세종: '세종', 경기: '경기', 강원: '강원', 충북: '충청북', 충남: '충청남', 전북: '전북', 전남: '전라남', 경북: '경상북', 경남: '경상남', 제주: '제주' };
export function explicitRegion(query) {
  const first = query.trim().split(/\s+/)[0];
  return Object.entries(regionAliases).find(([short, full]) => first === short || first.startsWith(`${full}도`) || first.startsWith(`${full}광역시`) || first === `${full}특별시` || first === `${full}특별자치도`)?.[1] || '';
}
export function distanceMeters(a, b) {
  if (!a || !b || [a.lat, a.lng, b.lat, b.lng].some(value => value == null || value === '')) return null;
  const values = [a.lat, a.lng, b.lat, b.lng].map(Number);
  if (!values.every(Number.isFinite)) return null;
  const [lat1, lng1, lat2, lng2] = values.map(x => x * Math.PI / 180);
  const h = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function mergePlaceResults(addresses, places, query, center, limit = 7) {
  const region = explicitRegion(query);
  const rows = [...addresses.map(item => ({ ...item, id: `address:${item.x}:${item.y}`, place_name: item.road_address?.address_name || item.address_name, road_address_name: item.road_address?.address_name || item.address_name, isAddress: true })), ...places];
  const seen = new Set();
  return rows.filter(item => {
    if (!item.x || !item.y || !Number.isFinite(Number(item.x)) || !Number.isFinite(Number(item.y))) return false;
    const key = `${item.place_name}|${Number(item.x).toFixed(5)}|${Number(item.y).toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).map((item, index) => ({ ...item, distanceValue: distanceMeters(center, { lat: item.y, lng: item.x }), rank: index }))
    .sort((a, b) => {
      const matches = item => Boolean(region && (item.address_name || item.road_address_name || '').startsWith(region));
      // Preserve the provider's relevance order within the requested region.
      // Distance is display information, not a replacement for relevance.
      return Number(matches(b)) - Number(matches(a)) || a.rank - b.rank;
    }).slice(0, limit);
}
export async function searchPlaces(query, { center, signal, limit = 7 } = {}) {
  const key = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;
  if (!key) throw new Error('검색 서비스를 사용할 수 없습니다.');
  const q = query.trim();
  const coords = center && [center.lat, center.lng].every(value => value != null && value !== '' && Number.isFinite(Number(value))) ? center : null;
  const keywordUrl = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=15&sort=accuracy`;
  const urls = [`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(q)}&size=15&analyze_type=similar`, keywordUrl];
  // Search the local area by relevance, then supplement with national results.
  // Explicitly named regions take precedence over the user's current location.
  if (coords && !explicitRegion(q)) urls.push(`${keywordUrl}&x=${coords.lng}&y=${coords.lat}&radius=20000`);
  const responses = await Promise.allSettled(urls.map(async url => {
    const response = await fetch(url, { signal, headers: { Authorization: `KakaoAK ${key}` } });
    if (!response.ok) throw new Error('검색 결과를 불러오지 못했습니다.');
    return (await response.json()).documents || [];
  }));
  if (signal?.aborted) throw new Error('검색 취소');
  if (responses.every(result => result.status === 'rejected')) throw new Error('검색 결과를 불러오지 못했습니다. 다시 시도해 주세요.');
  const places = [...(responses[2]?.value || []), ...(responses[1].value || [])];
  return mergePlaceResults(responses[0].value || [], places, q, coords, limit);
}
export function placeLocation(place) {
  return { detailAddress: place.place_name || place.address_name, roadAddress: place.road_address_name || place.address_name || '', lat: Number(place.y), lng: Number(place.x) };
}
export function isRegisteredPlace(place, locations) {
  const target = placeLocation(place);
  return locations.some(item => { const distance = distanceMeters(target, item); return distance != null && distance < 15 &&
    (item.detailAddress === target.detailAddress || Boolean(target.roadAddress && item.roadAddress === target.roadAddress));
  });
}
// Consume sheet travel first on upward drags; consume list travel first downward.
export function sheetDrag(startY, startScroll, dy, collapsedY, maxScroll) {
  if (dy < 0) { const travel = Math.min(startY, -dy); return { y: startY - travel, scroll: Math.min(maxScroll, startScroll + -dy - travel) }; }
  const travel = Math.min(startScroll, dy);
  return { y: Math.min(collapsedY, startY + dy - travel), scroll: startScroll - travel };
}
