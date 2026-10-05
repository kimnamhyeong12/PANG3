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
