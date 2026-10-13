const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const moduleUrl = file => `data:text/javascript;base64,${Buffer.from(fs.readFileSync(path.join(__dirname, file), 'utf8')).toString('base64')}`;
(async () => {
  const { searchPlaces, isInDistrict } = await import(moduleUrl('../utils/placeSearch.js'));
  const { canDownloadReport } = await import(moduleUrl('../utils/reportAvailability.js'));
  for (const status of ['pending', undefined, null, 'unknown']) assert.equal(canDownloadReport({ progressStatus: status }), false);
  for (const status of ['working', 'complete']) assert.equal(canDownloadReport({ progressStatus: status }), true);
  process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY = 'test-only';
  const district = { region_type: 'H', region_1depth_name: '부산광역시', region_2depth_name: '강서구' };
  const school = { id: 'local', place_name: '초등학교', address_name: '부산 강서구 명지동', x: '128.9', y: '35.1' };
  const otherCity = { ...school, id: 'seoul', address_name: '서울 강서구 화곡동' };
  const otherDistrict = { ...school, id: 'neighbor', address_name: '부산 사하구 하단동' };
  assert.equal(isInDistrict(school, district), true);
  assert.equal(isInDistrict(otherCity, district), false);
  assert.equal(isInDistrict(otherDistrict, district), false);
  assert.equal(isInDistrict({ ...school, address_name: '부산 강서구외 지역' }, district), false);
  const urls = [];
  const center = { lat: 35.1, lng: 128.9 };
  global.fetch = async url => {
    urls.push(url);
    const data = url.includes('coord2regioncode') ? { documents: [district] } :
      url.includes('/address.') ? { documents: [] } :
      url.includes('page=2') ? { documents: [{ ...school, id: 'second', place_name: '두번째 초등학교', x: '128.91' }], meta: { is_end: true } } :
      { documents: [otherCity, school, otherDistrict], meta: { is_end: false } };
    return { ok: true, json: async () => data };
  };
  const rows = await searchPlaces('초등학교', { center, districtOnly: true, limit: 30 });
  assert.deepEqual(rows.map(row => row.id), ['local', 'second']);
  assert.ok(urls.some(url => url.includes('coord2regioncode') && url.includes('x=128.9')));
  assert.ok(urls.filter(url => url.includes('/search/')).every(url => decodeURIComponent(url).includes('부산광역시 강서구 초등학교')));
  urls.length = 0;
  await searchPlaces('초등학교', { center, districtOnly: true });
  assert.ok(!urls.some(url => url.includes('coord2regioncode')), 'unchanged GPS reuses the district');
  urls.length = 0;
  await assert.rejects(searchPlaces('초등학교', { districtOnly: true }), /현재 위치/);
  assert.equal(urls.length, 0, 'missing GPS must not trigger nationwide search');
  global.fetch = async () => { throw new Error('offline'); };
  await assert.rejects(searchPlaces('초등학교', { center, districtOnly: true }));
  await assert.rejects(searchPlaces('초등학교', { center: { lat: 37, lng: 127 }, districtOnly: true }));
  global.fetch = async () => ({ ok: true, json: async () => ({ documents: [otherCity, otherDistrict], meta: { is_end: true } }) });
  assert.deepEqual(await searchPlaces('초등학교', { center, districtOnly: true }), [], 'no local results must not fall back nationally');
  console.log('Current district checks passed: GPS region, border/city filtering, pagination, no national fallback and report download eligibility');
})().catch(error => { console.error(error); process.exitCode = 1; });
