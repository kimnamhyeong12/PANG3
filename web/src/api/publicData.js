import { api } from './client.js';

// SgisBoundaryController GET /api/sgis/boundaries?admCode= (기본 21100 = 부산 사하구)
// → GeoJSON FeatureCollection (WGS84), feature.properties: { adm_cd, adm_nm, addr_en, x, y }
export function fetchBoundaries(admCode) {
  return api.get('/api/sgis/boundaries', { admCode });
}

// AedController GET /api/aeds/by-dong?admCode= (SGIS 행정동 코드, 예: 21100510)
// → [{ aedId, modelName, address, productName, businessTel, lat, lng, sido, sigungu, adminDong }]
export function fetchAedsByDong(admCode) {
  return api.get('/api/aeds/by-dong', { admCode });
}

// BusStopController GET /api/bus-stops/by-dong?admCode=
// → [{ busStopId, externalId, name, arsNo, lat, lng, stopType, sido, sigungu, adminDong }]
export function fetchBusStopsByDong(admCode) {
  return api.get('/api/bus-stops/by-dong', { admCode });
}

// 경계 feature의 행정동 코드(adm_cd)별로 by-dong API를 호출해 합친다 (일부 실패해도 나머지는 사용)
export async function fetchByDongs(admCodes, fetcher, idKey) {
  const results = await Promise.allSettled(admCodes.map((code) => fetcher(code)));
  const failed = results.filter((r) => r.status === 'rejected');
  const merged = new Map();
  results
    .filter((r) => r.status === 'fulfilled')
    .forEach((r) => (r.value ?? []).forEach((item) => merged.set(item[idKey], item)));
  return { items: [...merged.values()], failedCount: failed.length };
}

// AedController GET /api/aeds → 부산 전체 AED (엔티티 그대로, 필드는 by-dong과 동일)
export function fetchAllAeds() {
  return api.get('/api/aeds');
}

// BusStopController GET /api/bus-stops → 전체 버스정류장
export function fetchAllBusStops() {
  return api.get('/api/bus-stops');
}

// POST /api/aeds/update-administrative-areas → { success, updatedCount }
// 부산 전체 행정동 경계와 좌표를 비교해 sido/sigungu/adminDong을 다시 계산해 저장한다.
export function updateAedAdministrativeAreas() {
  return api.post('/api/aeds/update-administrative-areas');
}

// POST /api/bus-stops/update-administrative-areas → { success, updatedCount }
export function updateBusStopAdministrativeAreas() {
  return api.post('/api/bus-stops/update-administrative-areas');
}
