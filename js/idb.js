// A very small promise wrapper over IndexedDB, the phone's durable database.
// Where IndexedDB is missing or refuses to open, every call quietly does nothing.
const DB = 'klapkolist';
const STORES = ['kv', 'snapshots'];
let opening = null;

function open(){
  if (!opening) opening = new Promise(resolve => {
    try{
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => STORES.forEach(s => req.result.createObjectStore(s));
      req.onsuccess = () => resolve(req.result);
      req.onerror = req.onblocked = () => resolve(null);
    }catch{ resolve(null); }
  });
  return opening;
}
async function run(store, mode, fn){
  const db = await open();
  if (!db) return null;
  return new Promise(resolve => {
    try{
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req.result ?? null);
      tx.onerror = tx.onabort = () => resolve(null);
    }catch{ resolve(null); }
  });
}
export const idbGet = (store, key) => run(store, 'readonly', s => s.get(key));
export const idbPut = (store, key, value) => run(store, 'readwrite', s => s.put(value, key));
export const idbDelete = (store, key) => run(store, 'readwrite', s => s.delete(key));
export const idbKeys = store => run(store, 'readonly', s => s.getAllKeys()).then(k => k || []);
