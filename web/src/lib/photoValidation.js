// Same validation and labels as app photo registration, without native dependencies.
export function usablePhotoCoordinates(lat, lng) {
  return typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90
    && typeof lng === 'number' && Number.isFinite(lng) && Math.abs(lng) <= 180
    && !(lat === 0 && lng === 0);
}


export function suggestedPhotoName(address, items) {
  const base = String(address || '').trim().slice(0, 245);
  if (!base) return '';
  const used = new Set(items.map(item => item.name.trim()));
  let name = base, number = 2;
  while (used.has(name)) name = `${base} (${number++})`;
  return name;
}
