// 카카오맵 JS SDK를 한 번만 로드한다 (services: 주소 검색용 Geocoder/Places)
let loadingPromise = null;

export function loadKakaoMaps() {
  if (window.kakao?.maps?.LatLng) return Promise.resolve(window.kakao);
  if (loadingPromise) return loadingPromise;

  const appKey = import.meta.env.VITE_KAKAO_MAP_KEY;
  if (!appKey) return Promise.reject(new Error('VITE_KAKAO_MAP_KEY가 설정되지 않았습니다.'));

  loadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false&libraries=services`;
    script.async = true;
    script.onload = () => {
      if (!window.kakao?.maps) {
        reject(new Error('카카오맵 SDK를 초기화하지 못했습니다.'));
        return;
      }
      window.kakao.maps.load(() => resolve(window.kakao));
    };
    script.onerror = () => {
      loadingPromise = null;
      script.remove();
      reject(new Error('카카오맵 SDK를 불러오지 못했습니다. 앱 키와 카카오 개발자 콘솔의 사이트 도메인 등록을 확인해주세요.'));
    };
    document.head.appendChild(script);
  });
  return loadingPromise;
}
