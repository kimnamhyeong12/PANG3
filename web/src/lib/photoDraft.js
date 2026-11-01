// IndexedDB keeps the original File, unlike JSON/localStorage. Drafts are scoped to user/workspace.
let database;
function open() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('pinwork-photo-registration', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  return database;
}
export async function readPhotoDraft(key) {
  const db = await open(); return new Promise((resolve, reject) => { const r = db.transaction('drafts').objectStore('drafts').get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
export async function writePhotoDraft(key, value) {
  const db = await open(); return new Promise((resolve, reject) => { const tx = db.transaction('drafts', 'readwrite'); const store = tx.objectStore('drafts'); if (value) store.put(value, key); else store.delete(key); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
}
