const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const asModule = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
(async () => {
  const photosUrl = asModule(fs.readFileSync(path.join(__dirname, '../utils/reportPhotos.js'), 'utf8'));
  const { restorePhotos, photoManifest, groupReportsByPlace, emptyPhotos, statusFromRecords } = await import(photosUrl);
  const records = emptyPhotos();
  assert.equal(statusFromRecords('pending', records), 'pending');
  records[0].uri = 'file:///before.jpg';
  assert.equal(statusFromRecords('pending', records), 'pending');
  records[1].comment = '공사 진행 중';
  assert.equal(statusFromRecords('pending', records), 'working', 'a during memo is enough to suggest working');
  records[2].comment = '   ';
  assert.equal(statusFromRecords('working', records), 'working', 'blank after memos do not finish work');
  records[2].comment = '작업 마침';
  assert.equal(statusFromRecords('working', records), 'complete', 'an after memo suggests finished');
  records[2].comment = ''; records[2].uri = 'file:///after.jpg';
  assert.equal(statusFromRecords('pending', records), 'complete', 'an after photo also suggests finished');
  assert.equal(statusFromRecords('complete', emptyPhotos()), 'complete', 'deleting content must not reopen finished work');
  assert.equal(statusFromRecords('pending', emptyPhotos(), '현장 기록'), 'working');
  const during = restorePhotos([{ path: '/photo/during.jpg', comment: '작업 중|배수 공사' }]);
  assert.equal(during[0].uri, null);
  assert.equal(during[1].uri, '/photo/during.jpg');
  assert.equal(during[1].comment, '배수 공사');
  const mixed = restorePhotos([{ type: 'after', path: '/after.jpg', comment: '작업 후|끝' },
    { type: 'before', path: '/before.jpg', comment: '작업 전|시작' }]);
  mixed[1].uri = 'file:///during.jpg';
  const manifest = photoManifest(mixed);
  assert.deepEqual(manifest.map((slot) => slot.action), ['keep', 'upload', 'keep']);
  assert.equal(manifest[1].uploadIndex, 0);
  mixed[0].uri = null;
  assert.equal(photoManifest(mixed)[0].action, 'delete');
  const groups = groupReportsByPlace([
    { taskId: 1, detailAddress: '공사 A', roadAddress: '주소 A', latitude: 35, longitude: 129, createdAt: '2026-10-12' },
    { taskId: 2, detailAddress: '공사 A 재방문', roadAddress: '주소 A', latitude: 35, longitude: 129, createdAt: '2026-10-13' },
    { taskId: 3, detailAddress: '공사 A', roadAddress: '주소 B', latitude: 36, longitude: 130, createdAt: '2026-10-13' },
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[0].items[0].taskId, 2);

  const store = new Map(), files = new Set(), events = [];
  class Directory {
    constructor(...parts) { this.uri = parts.map((p) => p.uri || p).join('/'); }
    get exists() { return [...files].some((uri) => uri.startsWith(this.uri + '/')); }
    create() {}
    delete() { for (const uri of files) if (uri.startsWith(this.uri + '/')) files.delete(uri); }
  }
  class File {
    constructor(...parts) { this.uri = parts.map((p) => p.uri || p).join('/'); }
    copy(target) { if (!files.has(this.uri)) throw new Error('Missing photo'); files.add(target.uri); }
  }
  global.__draftTest = { Directory, File, Paths: { document: 'file:///documents' },
    AsyncStorage: { getItem: async (key) => store.get(key),
      setItem: async (key, value) => { await new Promise((resolve) => setTimeout(resolve, 5)); store.set(key, value); events.push('write'); },
      removeItem: async (key) => { store.delete(key); events.push('clear'); } } };
  const source = fs.readFileSync(path.join(__dirname, '../utils/reportDraft.js'), 'utf8')
    .replace("import AsyncStorage from '@react-native-async-storage/async-storage';", 'const { AsyncStorage } = global.__draftTest;')
    .replace("import { Directory, File, Paths } from 'expo-file-system';", 'const { Directory, File, Paths } = global.__draftTest;')
    .replace("'./reportPhotos'", JSON.stringify(photosUrl));
  const { draftKey, preservePhoto, writeDraft, readDraft, clearDraft, beginPhotoPick, pendingPhotoPick, endPhotoPick } = await import(asModule(source));
  const key = draftKey(7, 'group1', 1);
  assert.notEqual(key, draftKey(8, 'group1', 1));
  assert.notEqual(key, draftKey(7, 'group2', 1));
  files.add('file:///cache/shot.jpg');
  const durable = preservePhoto(key, 'file:///cache/shot.jpg');
  files.delete('file:///cache/shot.jpg');
  const form = { photos: [{ uri: durable }], markedMapUri: null, fieldMemo: '공사 메모' };
  await writeDraft(key, form);
  assert.equal((await readDraft(key)).fieldMemo, '공사 메모');
  assert(files.has((await readDraft(key)).photos[0].uri));
  const older = writeDraft(key, { ...form, fieldMemo: '이전' });
  const newer = writeDraft(key, { ...form, fieldMemo: '최신' });
  await Promise.all([older, newer]);
  assert.equal((await readDraft(key)).fieldMemo, '최신');
  await beginPhotoPick(key, 1, form);
  assert.equal((await pendingPhotoPick(key)).index, 1);
  assert.equal(await pendingPhotoPick(draftKey(8, 'group1', 1)), null);
  await endPhotoPick(draftKey(8, 'group1', 1));
  assert(await pendingPhotoPick(key));
  await endPhotoPick(key);
  assert.equal(await pendingPhotoPick(key), null);
  const pending = writeDraft(key, form), clearing = clearDraft(key);
  await Promise.all([pending, clearing]);
  assert.equal(await readDraft(key), null);
  assert.equal(events.at(-1), 'clear');
  assert(!files.has(durable));
  console.log('Report UX checks passed: photo slots, place history, draft isolation, durable photos and queued save/clear');
})().catch((error) => { console.error(error); process.exitCode = 1; });
