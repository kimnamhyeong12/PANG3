import { fetchBoundaries } from './publicData.js';

// SgisBoundaryService.SIDO_CODES 와 동일한 시·도 (구 명칭 별칭 제외)
export const SIDO_LIST = [
  { name: '서울특별시', code: '11' },
  { name: '부산광역시', code: '21' },
  { name: '대구광역시', code: '22' },
  { name: '인천광역시', code: '23' },
  { name: '광주광역시', code: '24' },
  { name: '대전광역시', code: '25' },
  { name: '울산광역시', code: '26' },
  { name: '세종특별자치시', code: '29' },
  { name: '경기도', code: '31' },
  { name: '강원특별자치도', code: '32' },
  { name: '충청북도', code: '33' },
  { name: '충청남도', code: '34' },
  { name: '전북특별자치도', code: '35' },
  { name: '전라남도', code: '36' },
  { name: '경상북도', code: '37' },
  { name: '경상남도', code: '38' },
  { name: '제주특별자치도', code: '39' },
];

// 시·도 코드로 SGIS 경계를 조회하면 하위 시·군·구 feature가 온다 → { name, code(adm_cd) }
// (앱의 하드코딩 표는 기장군을 21310으로 갖고 있지만 SGIS 실제 코드는 21510)
export async function fetchSigunguList(sidoCode) {
  const data = await fetchBoundaries(sidoCode);
  return (data?.features ?? [])
    .map((f) => ({
      code: f.properties?.adm_cd,
      name: String(f.properties?.adm_nm ?? '').split(/\s+/).slice(1).join(' '),
    }))
    .filter((r) => r.code && r.name)
    .sort((a, b) => a.code.localeCompare(b.code));
}
