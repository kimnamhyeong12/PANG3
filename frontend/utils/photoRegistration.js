import { usablePhotoCoordinates } from './photoImport';

export function mergeRegistrationPhotos(previous, incoming, maximum = 20) {
  const merged = new Map(previous.map(item => [item.sourceId, item]));
  for (const item of incoming) {
    if (!merged.has(item.sourceId) && merged.size < maximum) {
      const name = item.name.trim() || suggestedPhotoName(item.address, [...merged.values()]);
      merged.set(item.sourceId, { ...item, name });
    }
  }
  return [...merged.values()];
}

// An address is a suggested label, never a visit identity or a merge key.
export function suggestedPhotoName(address, items) {
  const base = String(address || '').trim().slice(0, 245);
  if (!base) return '';
  const used = new Set(items.map(item => item.name.trim()));
  let name = base, number = 2;
  while (used.has(name)) name = `${base} (${number++})`;
  return name;
}

export function registrationProblem(items) {
  if (!items.length) return '사진을 선택해 주세요.';
  if (items.some(item => !item.uri)) return '읽을 수 없는 사진을 제외해 주세요.';
  if (items.some(item => !item.name.trim())) return '방문지명을 입력해 주세요.';
  if (items.some(item => !usablePhotoCoordinates(item.lat, item.lng))) return 'location-required';
  return '';
}

export async function photoAddress(lat, lng, { fetchImpl, key, signal }) {
  if (!key || !usablePhotoCoordinates(lat, lng)) return '';
  const response = await fetchImpl(`https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`, {
    signal, headers: { Authorization: `KakaoAK ${key}` },
  });
  if (!response.ok) throw new Error('주소를 확인하지 못했습니다.');
  const data = await response.json();
  return data.documents?.[0]?.road_address?.address_name || data.documents?.[0]?.address?.address_name || '';
}
