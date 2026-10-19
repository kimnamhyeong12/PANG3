import { apiFetch } from './auth';

const numeric = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value === 'string' && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return Number(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const numerator = numeric(value.numerator), denominator = numeric(value.denominator);
    return denominator !== 0 ? numerator / denominator : NaN;
  }
  if (typeof value === 'string' && value.includes('/')) {
    const parts = value.trim().split('/');
    return parts.length === 2 && numeric(parts[1]) !== 0 ? numeric(parts[0]) / numeric(parts[1]) : NaN;
  }
  return NaN;
};

function coordinate(raw, reference, latitude) {
  let parts = raw;
  if (typeof raw === 'string' && /[,°'"\s]/.test(raw.trim())) {
    parts = raw.trim().split(/[,°'"\s]+/).filter(Boolean);
  }
  let value;
  if (Array.isArray(parts)) {
    if (parts.length !== 3) return NaN;
    const [degrees, minutes, seconds] = parts.map(numeric);
    if (![degrees, minutes, seconds].every(Number.isFinite) || minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) return NaN;
    value = (degrees < 0 ? -1 : 1) * (Math.abs(degrees) + minutes / 60 + seconds / 3600);
  } else value = numeric(parts);
  const ref = String(reference ?? '').trim().toUpperCase();
  if (ref && !(latitude ? ['N', 'S'] : ['E', 'W']).includes(ref)) return NaN;
  if (ref) value = (['S', 'W'].includes(ref) ? -1 : 1) * Math.abs(value);
  return Number.isFinite(value) && Math.abs(value) <= (latitude ? 90 : 180) ? value : NaN;
}

export function photoCoordinates(exif) {
  if (!exif || typeof exif !== 'object') return null;
  const gps = exif['{GPS}'] || exif.GPS || {};
  const lat = coordinate(exif.GPSLatitude ?? gps.Latitude, exif.GPSLatitudeRef ?? gps.LatitudeRef, true);
  const lng = coordinate(exif.GPSLongitude ?? gps.Longitude, exif.GPSLongitudeRef ?? gps.LongitudeRef, false);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export function photoItem(asset, index) {
  const fileName = String(asset.fileName || `사진_${index + 1}.jpg`);
  const coordinates = photoCoordinates(asset.exif);
  return { id: `${index}:${asset.uri}`, uri: asset.uri, fileName,
    name: fileName.replace(/\.[^.]+$/, '').slice(0, 255) || `사진 ${index + 1}`,
    width: asset.width, height: asset.height, ...coordinates,
    selected: !!coordinates && !!asset.uri,
    error: !asset.uri ? '사진 파일을 읽을 수 없습니다.' : !coordinates ? '사진 EXIF에 유효한 GPS 위치가 없습니다.' : '' };
}

// One authenticated multipart request creates a visit and its photo record.
// Never retry after an ambiguous response: a committed visit may already exist.
export async function importPhotos({ items, context, buildForm, fetchImpl = apiFetch, onProgress }) {
  if (!items.length) throw new Error('등록할 사진을 선택해 주세요.');
  for (const item of items) {
    if (item.error || !Number.isFinite(item.lat) || Math.abs(item.lat) > 90 || !Number.isFinite(item.lng) || Math.abs(item.lng) > 180) throw new Error('GPS 위치가 있는 사진만 등록할 수 있습니다.');
    if (!String(item.name || '').trim() || item.name.trim().length > 255) throw new Error('방문지 이름은 1~255자로 입력해 주세요.');
  }
  const result = { savedCount: 0, failures: [], unknownCount: 0, pendingCount: items.length, processedCount: 0 };
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    let upload;
    let sent = false;
    let timer;
    try {
      upload = await buildForm(item, context);
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), 60000);
      sent = true;
      const response = await fetchImpl(context.url, { method: 'POST', body: upload.body, signal: controller.signal });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const error = new Error(data?.message || data?.detail || `사진 등록 실패 (HTTP ${response.status})`);
        error.definite = [400, 401, 403, 413, 415, 422, 429].includes(response.status);
        error.stop = [401, 403, 429].includes(response.status);
        throw error;
      }
      if (!data || !Number.isSafeInteger(data.taskId) || data.taskId <= 0 || !Number.isSafeInteger(data.progressId) || data.progressId <= 0) throw new Error('서버의 사진 등록 결과를 확인할 수 없습니다.');
      result.savedCount++;
      result.processedCount++;
      result.pendingCount--;
    } catch (error) {
      const unknown = sent && !error.definite;
      result.failures.push({ fileName: item.fileName, reason: error?.name === 'AbortError' ? '사진 전송 응답 대기 시간이 초과되었습니다.' : error?.message || '사진 등록 실패', unknown });
      result.pendingCount--;
      if (unknown) result.unknownCount++;
      else result.processedCount++;
      if (unknown || error.stop) {
        onProgress?.({ ...result, failures: [...result.failures] });
        return result;
      }
    } finally {
      clearTimeout(timer);
      try { await upload?.cleanup?.(); } catch { /* cache cleanup does not change server outcome */ }
    }
    onProgress?.({ ...result, failures: [...result.failures] });
  }
  return result;
}
