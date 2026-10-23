import { apiFetch } from './auth';

export const BULK_CHUNK_SIZE = 200;

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

export function uploadContext(userId, groupId, apiBaseUrl) {
  const positiveId = (value) => /^\d+$/.test(text(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
  if (!positiveId(userId)) throw new Error('로그인 사용자 ID를 확인해 주세요.');
  if (groupId != null && !positiveId(groupId)) throw new Error('업무공간 ID를 확인해 주세요.');
  const base = text(apiBaseUrl).replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) throw new Error('EXPO_PUBLIC_API_BASE_URL을 설정해 주세요.');
  return { createdByUserId: Number(userId), groupId: groupId == null ? null : Number(groupId), url: `${base}/api/locations/bulk` };
}

function validResponse(data, chunk) {
  if (!data || data.totalCount !== chunk.length || !Number.isInteger(data.savedCount) ||
      !Number.isInteger(data.failedCount) || data.savedCount < 0 || data.failedCount < 0 ||
      data.savedCount + data.failedCount !== chunk.length || !Array.isArray(data.failures) ||
      data.failures.length !== data.failedCount) return false;
  const ids = new Set(chunk.map((row) => row.rowNumber));
  const failedIds = new Set();
  for (const failure of data.failures) {
    if (!ids.has(failure.rowNumber) || failedIds.has(failure.rowNumber) || typeof failure.reason !== 'string') return false;
    failedIds.add(failure.rowNumber);
  }
  return true;
}

// A lost response can follow committed inserts. Never retry a POST automatically.
export async function submitBulkRows({ rows, context, fetchImpl = apiFetch, onProgress }) {
  if (!rows.length || rows.some(locationError)) throw new Error('검증된 정상 행만 전송할 수 있습니다.');
  if (new Set(rows.map((row) => row.rowNumber)).size !== rows.length) throw new Error('원본 행 번호가 중복되었습니다.');
  const result = { totalCount: rows.length, processedCount: 0, savedCount: 0, failedCount: 0,
    failures: [], unknownCount: 0, pendingCount: rows.length, requestError: '' };
  for (let offset = 0; offset < rows.length; offset += BULK_CHUNK_SIZE) {
    const chunk = rows.slice(offset, offset + BULK_CHUNK_SIZE);
    try {
      const response = await fetchImpl(context.url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ createdByUserId: context.createdByUserId, groupId: context.groupId,
          locations: chunk.map(({ rowNumber, address, roadAddress, detailAddress, name, lat, lng }) => ({
            rowNumber, roadAddress: text(roadAddress) || text(address) || null,
            detailAddress: text(detailAddress) || null,
            name: text(name) || null,
            lat: text(lat),
            lng: text(lng),
          })) }),
      });
      let data;
      try { data = await response.json(); } catch { throw new Error(`서버 응답을 확인할 수 없습니다. (HTTP ${response.status})`); }
      if (!response.ok) throw new Error(data?.message || `요청 실패 (HTTP ${response.status})`);
      if (!validResponse(data, chunk)) throw new Error('서버의 등록 결과 형식이 올바르지 않습니다.');
      result.savedCount += data.savedCount;
      result.failedCount += data.failedCount;
      result.failures.push(...data.failures);
      result.processedCount += chunk.length;
      result.pendingCount = rows.length - result.processedCount;
    } catch (error) {
      result.unknownCount = chunk.length;
      result.pendingCount = rows.length - offset - chunk.length;
      result.requestError = error?.message || '네트워크 요청 실패';
      result.failures.push(...chunk.map(({ rowNumber }) => ({ rowNumber, reason: '저장 여부 확인 필요: ' + result.requestError })));
      result.failures.push(...rows.slice(offset + chunk.length).map(({ rowNumber }) => ({ rowNumber, reason: '앞선 요청 중단으로 미전송' })));
      onProgress?.({ ...result, failures: [...result.failures] });
      return result;
    }
    onProgress?.({ ...result, failures: [...result.failures] });
  }
  return result;
}
