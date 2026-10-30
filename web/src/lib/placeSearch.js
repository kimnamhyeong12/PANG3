import { loadKakaoMaps } from './kakaoLoader.js';
export async function searchPlaces(query) {
  const kakao = await loadKakaoMaps();
  const rows = await new Promise((resolve, reject) => new kakao.maps.services.Places().keywordSearch(query, (items, status) => {
    if (status === kakao.maps.services.Status.OK) return resolve(items);
    new kakao.maps.services.Geocoder().addressSearch(query, (addresses, addressStatus) => {
      if (addressStatus === kakao.maps.services.Status.ERROR) return reject(new Error('장소를 검색하지 못했습니다. 다시 시도해 주세요.'));
      resolve(addresses || []);
    });
  }));
  return rows.map(row => ({
    label: row.place_name || row.address_name,
    address: row.road_address_name || row.road_address?.address_name || row.address_name,
    lat: Number(row.y),
    lng: Number(row.x)
  }));
}
