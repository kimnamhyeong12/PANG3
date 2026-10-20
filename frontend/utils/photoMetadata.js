import { photoCoordinates, photoItem } from './photoImport';

const locationCoordinates = (location) => {
  // Do not coerce null/empty values into zero, and never substitute device GPS.
  const lat = location?.latitude, lng = location?.longitude;
  return typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90
    && typeof lng === 'number' && Number.isFinite(lng) && Math.abs(lng) <= 180 ? { lat, lng } : null;
};

export async function resolvePhotoMetadata(asset, index, { platform, expoGo, readAssetInfo, permissionError } = {}) {
  const item = photoItem(asset, index);
  if (!item.error) return { ...item, coordinateSource: 'picker-exif' };
  if (platform !== 'android' || !asset.uri) return item;
  if (expoGo) return { ...item, error: 'Android Expo Go에서는 원본 사진 위치 조회가 제한됩니다. 개발용 앱에서 사진 위치 권한을 허용한 뒤 확인해 주세요.' };
  if (permissionError) return { ...item, error: permissionError };
  if (!asset.assetId) return { ...item, error: '갤러리 원본 사진 ID를 확인할 수 없습니다. 기기에 저장된 원본 사진을 선택해 주세요.' };
  try {
    const info = await readAssetInfo(asset.assetId);
    const coordinates = locationCoordinates(info?.location) || photoCoordinates(info?.exif);
    if (!coordinates) return { ...item, error: '갤러리 원본에도 읽을 수 있는 GPS가 없습니다. 사진 위치 권한과 원본의 위치 정보를 확인해 주세요.' };
    return { ...item, ...coordinates, selected: true, error: '', coordinateSource: 'media-library' };
  } catch {
    return { ...item, error: '갤러리 원본 GPS를 읽지 못했습니다. 앱의 사진 접근 권한과 사진 위치 정보 접근을 확인해 주세요.' };
  }
}
