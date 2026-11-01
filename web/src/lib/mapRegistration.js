import { gps } from 'exifr';
import { usablePhotoCoordinates } from './photoValidation.js';
import { loadKakaoMaps } from './kakaoLoader.js';
export const koreaDay = (now = new Date()) => new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
export const taskTypes = ['점검', '공사', '안전', '환경', '민원'];
export const applicationStatus = { PENDING: '접수', REVIEWING: '검토 중', NEEDS_INFO: '보완 요청', APPROVED: '승인', REJECTED: '반려' };
export const validCoordinates = p => p?.lat != null && p?.lng != null && p.lat !== '' && p.lng !== '' && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) && Math.abs(Number(p.lat)) <= 90 && Math.abs(Number(p.lng)) <= 180;
export async function readOriginalPhoto(file) {
  if (!/\.(jpe?g|png)$/i.test(file.name)) throw Error('위치정보가 있는 JPG·PNG 원본 사진을 선택해 주세요.');
  if (!file.size) throw Error('사진 파일을 읽지 못했습니다. 다시 선택해 주세요.');
  if (file.size > 15 * 1024 * 1024) throw Error('15MB 이하의 사진을 선택해 주세요.');
  let point; try { point = await gps(file); } catch {}
  const coords = { lat: point?.latitude, lng: point?.longitude };
  if (!usablePhotoCoordinates(coords.lat, coords.lng)) throw Error('사진의 촬영 위치를 확인하지 못했습니다. 위치정보가 있는 원본 사진을 선택해 주세요.');
  return { file, ...coords };
}
export async function addressAt(point) {
  const k = await loadKakaoMaps();
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(''), 8000);
    new k.maps.services.Geocoder().coord2Address(point.lng, point.lat, rows => { clearTimeout(timer); resolve(rows?.[0]?.road_address?.address_name || rows?.[0]?.address?.address_name || ''); });
  });
}
export async function regionAt(point) {
  const k = await loadKakaoMaps();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('행정구역을 확인하지 못했습니다. 다시 시도해 주세요.')), 8000);
    new k.maps.services.Geocoder().coord2RegionCode(point.lng, point.lat, rows => {
      clearTimeout(timer); const r = rows?.find(v => v.region_type === 'H') || rows?.[0];
      if (!r) return reject(Error('행정구역을 확인하지 못했습니다. 다시 시도해 주세요.'));
      resolve({ sido: r.region_1depth_name, sigungu: r.region_2depth_name, adminDong: r.region_3depth_name });
    });
  });
}
export function facilityRegion(feature, group, user, personal) {
  const p = feature?.properties || {}, parts = String(p.adm_nm || p.adm_name || p.name || '').trim().split(/\s+/).filter(Boolean);
  return { sido: p.sido_nm || parts[0] || (personal ? user.workSido : group?.regionSido) || '', sigungu: p.sgg_nm || (parts.length >= 3 ? parts.slice(1, -1).join(' ') : '') || (personal ? user.workSigungu : group?.regionSigungu) || '', adminDong: parts.at(-1) || '', admCode: p.adm_cd || p.admCode || '' };
}
