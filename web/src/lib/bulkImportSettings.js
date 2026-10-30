const normalize = value => String(value ?? '').toLowerCase().replace(/[\s_().·\/\[\]-]/g, '');
const aliases = {
  name: ['방문지명', '방문지이름', '시설물명', '시설명', '상호명', '건물명', '장소명', '명칭', 'name'],
  address: ['도로명주소', '소재지도로명주소', '소재지', '주소', '지번주소', 'roadaddress', 'address'],
  detail: ['상세주소', '상세위치', '추가주소', 'detailaddress'],
  lat: ['위도', '위도좌표', 'latitude', 'lat'],
  lng: ['경도', '경도좌표', 'longitude', 'lng', 'lon'],
};

export function detectBulkImportSettings(rows) {
  const header = (rows[0] || []).map(normalize);
  const find = key => {
    for (const alias of aliases[key]) {
      const indices = header.flatMap((value, index) => value === normalize(alias) ? [index] : []);
      if (indices.length === 1) return indices[0];
    }
    return -1;
  };
  const name = find('name'), address = find('address'), detail = find('detail'), lat = find('lat'), lng = find('lng');
  // Recognize explicit titles; keep an unrecognized first row as data.
  // The user can change this choice without resetting the selected columns.
  return { hasHeader: [name, address, detail, lat, lng].some(index => index >= 0),
    addressMode: 'single', addressColumns: address >= 0 ? [address] : [],
    detailColumn: detail, latColumn: lat, lngColumn: lng, separator: ' ',
    nameMode: name >= 0 ? 'column' : 'default', nameColumn: name, fixedName: '' };
}
