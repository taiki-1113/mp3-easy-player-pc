// Independent from the iPhone app. Only the parent directory handle is persisted.
const DB = 'mp3-easy-player-pc-handles';
let connection;
function open() {
  return connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('settings');
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); connection = null; };
      resolve(db);
    };
    request.onerror = () => { connection = null; reject(request.error); };
    request.onblocked = () => { connection = null; reject(new Error('保存先が使用中です。他の画面を閉じて再試行してください。')); };
  });
}
export async function loadDirectory() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings');
    const request = tx.objectStore('settings').get('directory');
    tx.oncomplete = () => resolve(request.result ?? null);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
export async function saveDirectory(handle) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put(handle, 'directory');
    tx.oncomplete = resolve;
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
