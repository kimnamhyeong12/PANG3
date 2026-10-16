export const PHOTO_TYPES = [
  { key: 'before', label: '작업 전' },
  { key: 'during', label: '작업 중' },
  { key: 'after', label: '작업 후' },
];
export const emptyPhotos = () => PHOTO_TYPES.map(({ key, label }) => ({ type: key, label, uri: null, path: null, comment: '' }));
export const isLocalPhoto = (uri) => /^(file:|content:|blob:|data:)/.test(uri || '');

// Recording a later stage advances the suggested status. Removing content or
// editing an earlier stage never silently reopens work that is already finished.
export function statusFromRecords(currentStatus, photos, fieldMemo = '') {
  const hasRecord = (type) => photos.some(photo => photo.type === type && (photo.uri || String(photo.comment || '').trim()));
  if (['complete', 'completed', 'done'].includes(currentStatus) || hasRecord('after')) return 'complete';
  if (['working', 'progress', 'in_progress'].includes(currentStatus) || hasRecord('during') || String(fieldMemo).trim()) return 'working';
  return 'pending';
}

export function restorePhotos(saved = [], resolveUrl = (value) => value) {
  const slots = emptyPhotos();
  saved.forEach((photo, index) => {
    const prefix = String(photo.comment || '').split('|')[0];
    const type = PHOTO_TYPES.find((entry) => entry.key === photo.type || entry.label === prefix) ||
      (!photo.type && !PHOTO_TYPES.some((entry) => entry.label === prefix) ? PHOTO_TYPES[index] : null);
    if (!type) return;
    const raw = photo.uri || photo.path;
    slots[PHOTO_TYPES.indexOf(type)] = { type: type.key, label: type.label, path: photo.path || null,
      uri: resolveUrl(raw) || raw || null,
      comment: String(photo.comment || '').startsWith(type.label + '|') ? String(photo.comment).slice(type.label.length + 1) : photo.comment || '' };
  });
  return slots;
}

export function photoManifest(photos) {
  let uploadIndex = 0;
  return photos.map((photo) => ({ type: photo.type, comment: photo.comment || '',
    ...(!photo.uri ? { action: 'delete' } : isLocalPhoto(photo.uri)
      ? { action: 'upload', uploadIndex: uploadIndex++ } : { action: 'keep', path: photo.path }) }));
}

// Address + coordinates allows re-registered visits at the same place to share history.
// Name alone is never an identity: different coordinates keep similarly named places apart.
export function reportPlaceKey(report) {
  const address = String(report.roadAddress || report.detailAddress || '').trim().replace(/\s+/g, ' ');
  const lat = report.taskLatitude ?? report.latitude;
  const lng = report.taskLongitude ?? report.longitude;
  if (address && lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    return `${address}:${Number(lat).toFixed(5)}:${Number(lng).toFixed(5)}`;
  }
  return `task:${report.taskId}`;
}

export function groupReportsByPlace(reports) {
  const groups = new Map();
  reports.forEach((report) => {
    const key = reportPlaceKey(report);
    if (!groups.has(key)) groups.set(key, { key, name: report.detailAddress || report.roadAddress || `방문지 ${report.taskId}`, items: [] });
    groups.get(key).items.push(report);
  });
  return Array.from(groups.values()).map((group) => ({ ...group,
    items: [...group.items].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))) }));
}
