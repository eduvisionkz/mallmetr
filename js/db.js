// IndexedDB қабаты: өлшеу жазбалары, модельдер, баптаулар
const DB_NAME = 'malmetr';
const DB_VERSION = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB қолжетімсіз')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('records')) {
        const s = db.createObjectStore('records', { keyPath: 'id' });
        s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('models')) db.createObjectStore('models', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then(r => { result = r; });
    t.oncomplete = () => resolve(result && result.__req ? result.__req.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}
const wrap = req => ({ __req: req });

export const db = {
  getAll: store => tx(store, 'readonly', s => wrap(s.getAll())),
  get: (store, key) => tx(store, 'readonly', s => wrap(s.get(key))),
  put: (store, value) => tx(store, 'readwrite', s => wrap(s.put(value))),
  delete: (store, key) => tx(store, 'readwrite', s => wrap(s.delete(key))),
  clear: store => tx(store, 'readwrite', s => wrap(s.clear())),
  async getSetting(key, fallback = null) {
    try { const r = await this.get('settings', key); return r ? r.value : fallback; }
    catch { return fallback; }
  },
  setSetting(key, value) { return this.put('settings', { key, value }); },
};

export function uid(prefix = '') {
  const r = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
  return prefix + r.replace(/-/g, '').slice(0, 12);
}

export async function nextAnimalId() {
  const all = await db.getAll('records');
  let max = 0;
  for (const r of all) {
    const m = /^Қ-(\d+)$/.exec(r.animalId || '');
    if (m) max = Math.max(max, +m[1]);
  }
  return 'Қ-' + String(max + 1).padStart(3, '0');
}

export function blobToDataURL(blob) {
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
}
export async function dataURLToBlob(url) { return (await fetch(url)).blob(); }
