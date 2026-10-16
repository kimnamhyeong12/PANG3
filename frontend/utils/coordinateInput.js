// Incomplete input (a minus sign or a trailing decimal point) must not move the map.
export function coordinateInput(latitude, longitude) {
  const number = /^-?\d+(?:\.\d+)?$/;
  const latText = String(latitude).trim(), lngText = String(longitude).trim();
  if (!number.test(latText) || !number.test(lngText)) return null;
  const lat = Number(latText), lng = Number(lngText);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng } : null;
}
