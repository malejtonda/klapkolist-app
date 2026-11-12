// The app's data and where it is kept. Everything is on the phone, in two places at once:
// localStorage (written instantly, so nothing is lost if the app is closed mid-tap) and IndexedDB
// (which the phone is much less likely to clear). On start the newer of the two wins.
// On top of that, snapshots of the whole data are kept so an earlier state can be brought back.
import { normalize, VERSION } from './model.js';
import { idbGet, idbPut, idbDelete, idbKeys } from './idb.js';

const KEY = 'klapkolist_v2';
const OLD_KEY = 'klapkolist_data';        // before version 2; not carried over
const SNAPSHOT_EVERY = 10 * 60 * 1000;

export let data = normalize(null);
let lastSnapshot = 0;
const listeners = { change: [], external: [], error: [] };
export function onChange(fn){ listeners.change.push(fn); }       // after every save
export function onExternalChange(fn){ listeners.external.push(fn); }   // another open copy of the app saved
export function onSaveError(fn){ listeners.error.push(fn); }
const emit = (name, ...a) => listeners[name].forEach(fn => fn(...a));

// ----- a value kept in both places -----
function readLocal(key){
  let raw = null;
  try{ raw = localStorage.getItem(key); if (raw == null) return null; return JSON.parse(raw); }
  catch{
    // unreadable: put it aside instead of letting the next save overwrite it
    if (raw) idbPut('kv', `rescue_${key}_${Date.now()}`, raw);
    return null;
  }
}
function writeLocal(key, value){
  try{ localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch{ return false; }
}
const stamp = v => (v && typeof v.savedAt === 'number' ? v.savedAt : -1);
export function newer(a, b){ return stamp(b) > stamp(a) ? b : a; }
// The newer of the two copies, or null.
export async function recall(key){ return newer(readLocal(key), await idbGet('kv', key)); }
// Returns false only when neither place took it.
export async function persist(key, value){
  const local = writeLocal(key, value);
  const db = await idbPut('kv', key, value) !== null;
  return local || db;
}

// ----- the data -----
export async function load(){
  try{ localStorage.removeItem(OLD_KEY); }catch{}
  let found = await recall(KEY);
  if (found?.version !== VERSION) found = null;
  if (!found){
    const snaps = await listSnapshots();   // both copies gone: fall back to the latest snapshot
    if (snaps.length) found = JSON.parse((await idbGet('snapshots', snaps[0].ts)).json);
  }
  data = normalize(found);
  if (found) persist(KEY, data);          // whichever copy was missing or older has it again
  lastSnapshot = (await idbKeys('snapshots')).pop() || 0;
  navigator.storage?.persist?.().catch(() => {});   // ask the phone not to clear our data
}
export function save(){
  data.savedAt = Date.now();
  const snapshotDue = data.savedAt - lastSnapshot > SNAPSHOT_EVERY;
  persist(KEY, data).then(ok => { if (!ok) emit('error'); });
  if (snapshotDue) snapshotNow();
  emit('change');
}
export function backupJSON(){ return JSON.stringify(data, null, 2); }
// Restore from a backup or snapshot: everything on the phone is replaced (after a snapshot of it).
export async function replaceData(raw){
  await snapshotNow();
  data = normalize(raw);
  save();
}

// Another copy of the app (a second tab) saved: take its data instead of overwriting it later.
function adoptNewer(){
  const other = readLocal(KEY);
  if (other?.version !== VERSION || stamp(other) <= stamp(data)) return;
  data = normalize(other);
  emit('external');
}
if (typeof window !== 'undefined'){
  window.addEventListener('storage', e => { if (e.key === KEY) adoptNewer(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) adoptNewer(); });
}

// ----- snapshots -----
const DAY = 24 * 60 * 60 * 1000;
// Which snapshots to keep: the newest 12, then the last one of each day for two weeks.
export function snapshotsToKeep(stamps, now){
  const sorted = [...stamps].sort((a, b) => b - a);
  const keep = new Set(sorted.slice(0, 12));
  const days = new Set();
  sorted.forEach(ts => {
    const day = new Date(ts).toDateString();
    if (now - ts < 14 * DAY && !days.has(day)){ days.add(day); keep.add(ts); }
  });
  return keep;
}
function summary(d){
  const zabery = d.projects.flatMap(p => p.nds.flatMap(nd => nd.zabery));
  return { projects: d.projects.length, zabery: zabery.length, takes: zabery.reduce((a, z) => a + z.takes.length, 0) };
}
export async function snapshotNow(){
  const ts = Date.now();
  if (!summary(data).projects) return;      // nothing worth keeping
  lastSnapshot = ts;
  await idbPut('snapshots', ts, { ts, json: JSON.stringify(data), ...summary(data) });
  const all = await idbKeys('snapshots');
  const keep = snapshotsToKeep(all, ts);
  await Promise.all(all.filter(k => !keep.has(k)).map(k => idbDelete('snapshots', k)));
}
// → [{ ts, projects, zabery, takes }], newest first
export async function listSnapshots(){
  const keys = (await idbKeys('snapshots')).sort((a, b) => b - a);
  const all = await Promise.all(keys.map(k => idbGet('snapshots', k)));
  return all.filter(Boolean).map(({ ts, projects, zabery, takes }) => ({ ts, projects, zabery, takes }));
}
export async function restoreSnapshot(ts){
  const snap = await idbGet('snapshots', ts);
  if (!snap) return false;
  await replaceData(JSON.parse(snap.json));
  return true;
}

// ----- lookups -----
export function findProject(id){ return data.projects.find(p => p.id === id); }
// A shooting day and its project, or null when either is gone.
export function findDay(projectId, ndId){
  const proj = findProject(projectId);
  const nd = proj?.nds.find(n => n.id === ndId);
  return nd ? { proj, nd } : null;
}
