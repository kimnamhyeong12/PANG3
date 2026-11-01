// Same row validation as frontend/utils/bulkUpload.js.
const text = (value) => String(value ?? '').trim();

export function locationName(row) {
  return text(row.name) || text(row.detailAddress) || text(row.roadAddress) || text(row.address) || `방문지 ${row.rowNumber}`;
}

export function nameSettingsError(mode, fixedName, nameColumn, columnCount) {
  if (mode === 'fixed' && !text(fixedName)) return '방문지 이름을 입력해 주세요.';
  if (mode === 'fixed' && text(fixedName).length > 255) return '방문지 이름은 255자 이하로 입력해 주세요.';
  if (mode === 'column' && !(Number.isInteger(nameColumn) && nameColumn >= 0 && nameColumn < columnCount)) {
    return '이름으로 사용할 컬럼을 선택해 주세요.';
  }
  return '';
}

export function locationError(row) {
  if (row.nameRequired && !text(row.name)) return '선택한 이름 컬럼의 값이 비어 있습니다.';
  if (locationName(row).length > 255) return '방문지 이름은 255자 이하여야 합니다.';
  const lat = text(row.lat);
  const lng = text(row.lng);
  if (!lat && !lng) return '위도·경도 값이 비어 있습니다.';
  if (!lat) return '위도 값이 비어 있습니다.';
  if (!lng) return '경도 값이 비어 있습니다.';
  for (const [value, min, max, label] of [[lat, -90, 90, '위도'], [lng, -180, 180, '경도']]) {
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) || !Number.isFinite(Number(value))) {
      return `${label}가 숫자가 아닙니다.`;
    }
    if (Number(value) < min || Number(value) > max) return `${label} 범위가 올바르지 않습니다.`;
  }
  return '';
}

export function coordinateColumnsError(latColumn, lngColumn, columnCount) {
  const selected = (index) => Number.isInteger(index) && index >= 0 && index < columnCount;
  if (!selected(latColumn) || !selected(lngColumn)) return '위도 컬럼과 경도 컬럼을 모두 선택해 주세요.';
  if (latColumn === lngColumn) return '위도와 경도는 서로 다른 컬럼을 선택해 주세요.';
  return '';
}
