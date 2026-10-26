const regionAliases = { 서울: '서울', 부산: '부산', 대구: '대구', 인천: '인천', 광주: '광주', 대전: '대전', 울산: '울산', 세종: '세종', 경기: '경기', 강원: '강원', 충북: '충청북', 충남: '충청남', 전북: '전북', 전남: '전라남', 경북: '경상북', 경남: '경상남', 제주: '제주' };
const nearbyCategories = new Set(['학교', '초등학교', '중학교', '고등학교', '대학교', '병원', '약국', '편의점', '마트', '식당', '음식점', '카페', '주유소', '공원', '은행', '우체국', '주민센터', '행정복지센터', '경찰서', '지구대', '파출소', '소방서', '어린이집', '유치원']);
export const isNearbyCategoryQuery = query => /^(내\s*주변|근처|주변)\s+\S/.test(query.trim()) || nearbyCategories.has(query.trim().replace(/^(내\s*주변|근처|주변)\s*/, ''));
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
export function searchViewportPlaces(places) {
  if (!places.length) return [];
  const anchor = { lat: places[0].y, lng: places[0].x };
  return places.filter(place => {
    const distance = distanceMeters(anchor, { lat: place.y, lng: place.x });
    return distance != null && distance <= 20000;
  });
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
let cachedDistrict = null;
export function isInDistrict(item, district) {
  if (item.address?.region_1depth_name && item.address?.region_2depth_name) {
    return explicitRegion(item.address.region_1depth_name) === explicitRegion(district.region_1depth_name)
      && item.address.region_2depth_name === district.region_2depth_name;
  }
  return [item.address_name, item.road_address_name, item.road_address?.address_name].some(address => {
    const parts = String(address || '').trim().split(/\s+/);
    const city = explicitRegion(parts[0]);
    const expectedCity = explicitRegion(district.region_1depth_name);
    const area = district.region_2depth_name.trim().split(/\s+/);
    return Boolean(city && expectedCity && city === expectedCity && area.every((name, index) => parts[index + 1] === name));
  });
}
async function searchCurrentDistrict(q, coords, key, signal, limit) {
  const request = async url => {
    const response = await fetch(url, { signal, headers: { Authorization: `KakaoAK ${key}` } });
    if (!response.ok) throw new Error('현재 구의 검색 결과를 불러오지 못했습니다. 다시 시도해 주세요.');
    return response.json();
  };
  const position = `${Number(coords.lat).toFixed(5)}:${Number(coords.lng).toFixed(5)}`;
  let district = cachedDistrict?.position === position ? cachedDistrict.region : null;
  if (!district) {
    const data = await request(`https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${encodeURIComponent(coords.lng)}&y=${encodeURIComponent(coords.lat)}`);
    district = data.documents?.find(item => item.region_type === 'H') || data.documents?.find(item => item.region_type === 'B');
    if (!district?.region_1depth_name || !district?.region_2depth_name) throw new Error('현재 위치의 시·군·구를 확인하지 못했습니다.');
    cachedDistrict = { position, region: district };
  }
  const query = encodeURIComponent(`${district.region_1depth_name} ${district.region_2depth_name} ${q}`);
  // Restrict by administrative address rather than a radius, which crosses district borders.
  const keywordUrl = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${query}&size=15&sort=accuracy`;
  const initial = await Promise.allSettled([
    request(`https://dapi.kakao.com/v2/local/search/address.json?query=${query}&size=15&analyze_type=similar`),
    request(`${keywordUrl}&page=1`),
  ]);
  if (signal?.aborted) throw new Error('검색 취소');
  if (initial.every(result => result.status === 'rejected')) throw new Error('현재 구의 검색 결과를 불러오지 못했습니다. 다시 시도해 주세요.');
  const addresses = (initial[0].value?.documents || []).filter(item => isInDistrict(item, district));
  const places = (initial[1].value?.documents || []).filter(item => isInDistrict(item, district));
  let lastPage = initial[1].value;
  let rows = mergePlaceResults(addresses, places, q, coords, limit);
  for (let page = 2; lastPage && !lastPage.meta?.is_end && page <= 3 && rows.length < limit; page++) {
    lastPage = await request(`${keywordUrl}&page=${page}`);
    places.push(...(lastPage.documents || []).filter(item => isInDistrict(item, district)));
    rows = mergePlaceResults(addresses, places, q, coords, limit);
  }
  return rows;
}
export async function searchPlaces(query, { center, signal, limit = 7, districtOnly = false } = {}) {
  const key = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;
  if (!key) throw new Error('검색 서비스를 사용할 수 없습니다.');
  const q = query.trim();
  const coords = center && [center.lat, center.lng].every(value => value != null && value !== '' && Number.isFinite(Number(value))) ? center : null;
  if (districtOnly) {
    if (!coords) throw new Error('현재 위치를 확인한 뒤 검색해 주세요. 위치 권한과 GPS를 확인해 주세요.');
    return searchCurrentDistrict(q, coords, key, signal, limit);
  }
  if (isNearbyCategoryQuery(q)) {
    if (!coords) throw new Error('현재 위치를 확인한 뒤 주변 장소를 검색해 주세요.');
    const category = q.replace(/^(내\s*주변|근처|주변)\s*/, '');
    for (const radius of [5000, 10000, 20000]) {
      const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(category)}&size=15&sort=distance&x=${coords.lng}&y=${coords.lat}&radius=${radius}`;
      const response = await fetch(url, { signal, headers: { Authorization: `KakaoAK ${key}` } });
      if (!response.ok) throw new Error('주변 검색 결과를 불러오지 못했습니다. 다시 시도해 주세요.');
      const items = (await response.json()).documents || [];
      if (items.length) return mergePlaceResults([], items, category, coords, limit);
    }
    return [];
  }
  const keywordUrl = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=15&sort=accuracy`;
  // Give the provider a nearby reference point without excluding other districts.
  const positionedKeyword = coords && !explicitRegion(q) ? `${keywordUrl}&x=${coords.lng}&y=${coords.lat}` : keywordUrl;
  const urls = [`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(q)}&size=15&analyze_type=similar`, positionedKeyword];
  const responses = await Promise.allSettled(urls.map(async url => {
    const response = await fetch(url, { signal, headers: { Authorization: `KakaoAK ${key}` } });
    if (!response.ok) throw new Error('검색 결과를 불러오지 못했습니다.');
    return (await response.json()).documents || [];
  }));
  if (signal?.aborted) throw new Error('검색 취소');
  if (responses.every(result => result.status === 'rejected')) throw new Error('검색 결과를 불러오지 못했습니다. 다시 시도해 주세요.');
  const places = responses[1].value || [];
  return mergePlaceResults(responses[0].value || [], places, q, coords, limit);
}
export function placeLocation(place) {
  return { detailAddress: place.place_name || place.address_name, roadAddress: place.road_address_name || place.address_name || '', lat: Number(place.y), lng: Number(place.x) };
}
export function isRegisteredPlace(place, locations) {
  const target = placeLocation(place);
  return locations.some(item => { if (['complete','completed','done'].includes(String(item.status ?? item.taskStatus ?? '').toLowerCase())) return false; const distance = distanceMeters(target, item); return distance != null && distance < 15 &&
    (item.detailAddress === target.detailAddress || Boolean(target.roadAddress && item.roadAddress === target.roadAddress));
  });
}
// Consume sheet travel first on upward drags; consume list travel first downward.
export function sheetDrag(startY, startScroll, dy, collapsedY, maxScroll) {
  if (dy < 0) { const travel = Math.min(startY, -dy); return { y: startY - travel, scroll: Math.min(maxScroll, startScroll + -dy - travel) }; }
  const travel = Math.min(startScroll, dy);
  return { y: Math.min(collapsedY, startY + dy - travel), scroll: startScroll - travel };
}
