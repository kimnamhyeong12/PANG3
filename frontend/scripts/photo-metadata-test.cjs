const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
function readModule(file, dependencies) {
  const exports = {};
  const source = babel.transformFileSync(path.join(__dirname, '..', file), {
    configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  new Function('require', 'exports', source)(name => {
    assert.ok(name in dependencies, `Unexpected import ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}
const importer = readModule('utils/photoImport.js', { './auth': { apiFetch: () => { throw Error('No network in tests'); } } });
const { mediaLibraryPhoto, resolvePhotoMetadata } = readModule('utils/photoMetadata.js', { './photoImport': importer });
(async () => {
  const queried = [];
  const readAssetInfo = async id => {
    queried.push(id);
    return { localUri: `file:///original/${id}.jpg`, location: { latitude: 35.123, longitude: 129.123 } };
  };
  // Same filenames do not identify the original: use the actual MediaStore IDs.
  const photos = ['42', '43'].map(id => mediaLibraryPhoto({ id, uri: `file:///gallery/${id}.jpg`, filename: 'same.jpg' }));
  const options = { platform: 'android', readAssetInfo };
  const resolved = await Promise.all(photos.map((asset, index) => resolvePhotoMetadata(asset, index, options)));
  assert.deepEqual(queried, ['42', '43']);
  assert.ok(resolved.every(item => item.selected && !item.error && item.lat === 35.123 && item.lng === 129.123));
  assert.equal(resolved[0].uri, 'file:///original/42.jpg');
  assert.equal(resolved[0].fileName, 'same.jpg');
  assert.notEqual(resolved[0].id, resolved[1].id);
  assert.throws(() => mediaLibraryPhoto({ uri: 'file:///cache/42.jpg' }));
  const noId = await resolvePhotoMetadata({ uri: 'file:///cache/42.jpg', fileName: '42.jpg' }, 0, options);
  assert.match(noId.error, /원본 사진 ID/);
  assert.deepEqual(queried, ['42', '43']); // Never guess an ID from a filename or cache URI.
  const denied = await resolvePhotoMetadata(photos[0], 0, { ...options, permissionError: '권한 없음' });
  assert.equal(denied.error, '권한 없음');
  assert.equal(queried.length, 2);
  for (const location of [undefined, { latitude: 0, longitude: 0 }, { latitude: null, longitude: 129 }]) {
    const missing = await resolvePhotoMetadata(photos[0], 0, { platform: 'android', readAssetInfo: async () => ({ location }) });
    assert.equal(missing.selected, false);
    assert.ok(missing.error);
    assert.equal(missing.lat, undefined);
  }
  const failure = await resolvePhotoMetadata(photos[0], 0, { platform: 'android', readAssetInfo: async () => { throw Error('Deleted'); } });
  assert.equal(failure.selected, false);
  const exif = await resolvePhotoMetadata({ uri: 'file:///ios.jpg', exif: { GPSLatitude: 35, GPSLongitude: 129 } }, 0, { platform: 'ios' });
  assert.equal(exif.coordinateSource, 'picker-exif');
  // The existing authenticated upload still receives the exact original GPS.
  const response = await importer.importPhotos({ items: resolved, context: { url: '/test' },
    buildForm: async item => { assert.equal(item.lng, 129.123); return { body: {} }; },
    fetchImpl: async () => ({ ok: true, json: async () => ({ taskId: 1, progressId: 2 }) }),
  });
  assert.equal(response.savedCount, 2);
  console.log('Photo metadata passed: original IDs, duplicate names, original URI/GPS, no-ID safety, missing GPS, permission errors, iOS and upload');
})().catch(error => { console.error(error); process.exitCode = 1; });
