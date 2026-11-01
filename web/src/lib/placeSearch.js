import { loadKakaoMaps } from './kakaoLoader.js';
import { explicitRegion, isNearbyCategoryQuery, mergePlaceResults } from '../../../frontend/utils/placeSearch.js';
export async function searchPlaces(query, { center, signal, limit = 7 } = {}) {
  const q = query.trim(), kakao = await loadKakaoMaps();
  const coords = center && Number.isFinite(Number(center.lat)) && Number.isFinite(Number(center.lng)) ? center : null;
  const nearby = isNearbyCategoryQuery(q);
  if (nearby && !coords) throw Error('현재 위치를 확인한 뒤 주변 장소를 검색해 주세요.');
  const check = () => { if (signal?.aborted) throw new DOMException('검색 취소', 'AbortError'); };
  const keyword = (text, options = {}) => new Promise((resolve, reject) => new kakao.maps.services.Places().keywordSearch(text, (rows, status, pagination) => {
    if (status === kakao.maps.services.Status.ERROR) reject(Error('장소를 검색하지 못했습니다. 다시 시도해 주세요.'));
    else resolve({ rows: rows || [], pagination });
  }, options));
  const address = () => new Promise((resolve, reject) => new kakao.maps.services.Geocoder().addressSearch(q, (rows, status) => {
    if (status === kakao.maps.services.Status.ERROR) reject(Error('주소를 검색하지 못했습니다. 다시 시도해 주세요.')); else resolve(rows || []);
  }));
  const options = coords && !explicitRegion(q) ? { location: new kakao.maps.LatLng(coords.lat, coords.lng) } : {};
  let rows;
  if (nearby) {
    const category = q.replace(/^(내\s*주변|근처|주변)\s*/, ''); rows = [];
    for (const radius of [5000, 10000, 20000]) { check(); const result = await keyword(category, { ...options, location: new kakao.maps.LatLng(coords.lat, coords.lng), radius, sort: kakao.maps.services.SortBy.DISTANCE, size: 15 }); rows = mergePlaceResults([], result.rows, category, coords, limit); if (rows.length) break; }
  } else {
    const initial = await Promise.allSettled([address(), keyword(q, { ...options, size: 15 })]); check();
    if (initial.every(r => r.status === 'rejected')) throw Error('장소를 검색하지 못했습니다. 다시 시도해 주세요.');
    const addresses = initial[0].value || [], places = initial[1].value?.rows || [];
    rows = mergePlaceResults(addresses, places, q, coords, limit);
    for (let page = 2; initial[1].value?.pagination?.hasNextPage && page <= 3 && rows.length < limit; page++) { const result = await keyword(q, { ...options, size: 15, page }); places.push(...result.rows); rows = mergePlaceResults(addresses, places, q, coords, limit); check(); if (!result.pagination?.hasNextPage) break; }
  }
  check(); return rows.map(row => ({ ...row, label: row.place_name || row.address_name, address: row.road_address_name || row.road_address?.address_name || row.address_name, lat: Number(row.y), lng: Number(row.x) }));
}
