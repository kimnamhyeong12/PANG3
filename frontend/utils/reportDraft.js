import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { isLocalPhoto } from './reportPhotos';

const queues = new Map();
const PICKER_OWNER_KEY = 'pang3:reportPhotoPicker';
export const draftKey = (userId, workspace, taskId, mode = 'latest') =>
  `pang3:reportDraft:${userId}:${workspace}:${taskId}:${mode}`;

function enqueue(key, action) {
  const next = (queues.get(key) || Promise.resolve()).catch(() => {}).then(action);
  queues.set(key, next);
  next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => {});
  return next;
}
const directory = (key) => new Directory(Paths.document, 'report-drafts', encodeURIComponent(key));

export function preservePhoto(key, uri) {
  if (!uri || !isLocalPhoto(uri)) return uri;
  const dir = directory(key);
  dir.create({ intermediates: true, idempotent: true });
  if (uri.startsWith(dir.uri.replace(/\/+$/, '') + '/')) return uri;
  const target = new File(dir, `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  new File(uri).copy(target);
  return target.uri;
}

export const readDraft = async (key) => {
  await (queues.get(key) || Promise.resolve()).catch(() => {});
  const raw = await AsyncStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
};

export const writeDraft = (key, snapshot) => enqueue(key, async () => {
  const photos = snapshot.photos.map((photo) => ({ ...photo, uri: preservePhoto(key, photo.uri) }));
  const editor = snapshot.photoEditor ? { ...snapshot.photoEditor, uri: preservePhoto(key, snapshot.photoEditor.uri) } : null;
  const draft = { ...snapshot, photos, photoEditor: editor,
    markedMapUri: preservePhoto(key, snapshot.markedMapUri), updatedAt: new Date().toISOString() };
  await AsyncStorage.setItem(key, JSON.stringify(draft));
  // Keep superseded files until save/discard: an older queued snapshot must not
  // delete a just-captured image that the next snapshot has not persisted yet.
  return draft;
});

export const clearDraft = (key) => enqueue(key, async () => {
  await AsyncStorage.removeItem(key);
  const dir = directory(key);
  if (dir.exists) dir.delete();
});

export const beginPhotoPick = async (key, index, snapshot) => {
  await writeDraft(key, snapshot);
  await AsyncStorage.setItem(PICKER_OWNER_KEY, JSON.stringify({ key, index }));
};
export const pendingPhotoPick = async (key) => {
  const raw = await AsyncStorage.getItem(PICKER_OWNER_KEY);
  const owner = raw ? JSON.parse(raw) : null;
  return owner?.key === key ? owner : null;
};
export const endPhotoPick = async (key) => {
  if (await pendingPhotoPick(key)) await AsyncStorage.removeItem(PICKER_OWNER_KEY);
};
