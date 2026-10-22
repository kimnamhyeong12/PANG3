import * as SecureStore from 'expo-secure-store';
import { fetch as expoFetch } from 'expo/fetch';
import { createSessionClient } from './sessionClient';
import { File, Paths, Directory } from 'expo-file-system';

const KEY = 'pang3.auth.session.v1';
const listeners = new Set();
export const session = createSessionClient({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || '', transport: expoFetch,
  storage: {
    async get() { const value = await SecureStore.getItemAsync(KEY); return value ? JSON.parse(value) : null; },
    set: (value) => SecureStore.setItemAsync(KEY, JSON.stringify(value), { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }),
    remove: () => SecureStore.deleteItemAsync(KEY),
  },
  onExpired: () => listeners.forEach((listener) => listener()),
});
export const apiFetch = (url, options) => session.fetch(url, options);
export const subscribeAuthExpired = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
export async function protectedImageSource(uri) {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!base || !uri?.startsWith(`${base}/api/files/`)) return { uri };
  return { uri, headers: await session.headers() };
}

export async function downloadProtectedFile(url, name = 'report.hwpx') {
  const response = await apiFetch(url);
  if (!response.ok) throw new Error('파일을 다운로드하지 못했습니다.');
  const directory = new Directory(Paths.cache, 'protected-files');
  directory.create({ intermediates: true, idempotent: true });
  const file = new File(directory, `${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`);
  file.write(new Uint8Array(await response.arrayBuffer()));
  return file.uri;
}
export async function localImageForEditing(uri) {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL;
  return base && uri?.startsWith(`${base}/api/files/`) ? downloadProtectedFile(uri, 'photo.jpg') : uri;
}
