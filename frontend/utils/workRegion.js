import data from '../constants/koreaRegions.json';

export const REGIONS = data.regions;
export const DISTRICTS_BY_REGION = data.districtsByRegion;
export const emptyWorkRegion = () => ({ sido: '', sigungu: '', gu: '' });
export function regionBoundariesPath({ sido, sigungu, admCode } = {}) {
  if (sido && sigungu) return `/api/sgis/boundaries/by-region?sido=${encodeURIComponent(sido)}&sigungu=${encodeURIComponent(sigungu)}`;
  return /^\d{5}$/.test(String(admCode || '')) ? `/api/sgis/boundaries?admCode=${admCode}` : null;
}
export const childDistricts = ({ sido, sigungu }) => data.subdistrictsByRegion[sido]?.[sigungu] || [];
export const serializeWorkRegion = ({ sigungu, gu }) => [sigungu, gu].filter(Boolean).join(' ');
export function isWorkRegionComplete(value) {
  return REGIONS.includes(value.sido)
    && Boolean(DISTRICTS_BY_REGION[value.sido]?.includes(value.sigungu))
    && (!childDistricts(value).length || childDistricts(value).includes(value.gu));
}
export function isOptionalWorkRegionValid(value) {
  return (!value.sido && !value.sigungu && !value.gu) || isWorkRegionComplete(value);
}
export function selectWorkRegion(value, level, selected) {
  if (level === 'sido') return { sido: selected, sigungu: '', gu: '' };
  if (level === 'sigungu') return { ...value, sigungu: selected, gu: '' };
  return { ...value, gu: selected };
}
export function parseWorkRegion(sido, stored) {
  const aliases = { 광주광역시: '전남광주통합특별시', 전라남도: '전남광주통합특별시',
    강원도: '강원특별자치도', 전라북도: '전북특별자치도' };
  const normalizedSido = aliases[sido] || sido || '';
  const text = String(stored || '').trim().replace(/\s+/g, ' ');
  const compact = text.replace(/\s+/g, '');
  const sigungu = (DISTRICTS_BY_REGION[normalizedSido] || []).find(item => text === item || text.startsWith(`${item} `)
    || (data.subdistrictsByRegion[normalizedSido]?.[item] || []).some(gu => compact === `${item}${gu}`.replace(/\s+/g, ''))) || '';
  const value = { sido: normalizedSido, sigungu, gu: '' };
  value.gu = childDistricts(value).find(gu => compact === `${sigungu}${gu}`.replace(/\s+/g, '')) || '';
  if (!childDistricts(value).includes(value.gu)) value.gu = '';
  return value;
}
