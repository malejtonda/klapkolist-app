// Automatic delivery to Google Drive, through a small script the owner runs in their own Google
// account (see google/README.md). Whenever there is a signal, each shooting day that changed is
// sent as a table to its tab in the project's Google Sheet, and the whole data as a backup file.
// Without a signal the changes simply wait. A finished day is sent one last time and then left alone.
import { dayTable } from './sheet.js';
import { uid } from './util.js';
import { data, backupJSON, onChange, recall, persist } from './store.js';

const KEY = 'klapkolist_sync';
const CODE_PREFIX = 'KLAPKA1.';
const API = 1;
const DAY_DELAY = 20 * 1000;          // after the last change, so a burst of taps is one upload
const BACKUP_EVERY = 5 * 60 * 1000;
const RETRY = [30, 60, 120, 300].map(s => s * 1000);
const FINAL = 'final';

// conn: { url, key, name } · sent: { ndId: hash | 'final' } · sheets: { projectId: url }
let state = { savedAt: 0, device: uid(), conn: null, sent: {}, sheets: {}, backupHash: '', backupAt: 0, lastOk: 0 };
let running = false, timer = 0, failures = 0, lastError = '';
const watchers = [];
export function onSyncStatus(fn){ watchers.push(fn); }
const changed = () => watchers.forEach(fn => fn());
function remember(){ state.savedAt = Date.now(); persist(KEY, state); }

export function hash(text){
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++){ h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

// ----- what needs sending -----
function dayPayload(proj, nd, index){
  return { project: { id: proj.id, name: proj.name }, day: { id: nd.id, name: nd.name, index }, table: dayTable(nd) };
}
// Days whose table differs from what was last sent. A finished day goes once more, then never again.
export function pendingDays(d, sent){
  const jobs = [];
  d.projects.forEach(proj => proj.nds.forEach((nd, index) => {
    if (nd.finished && sent[nd.id] === FINAL) return;
    const payload = dayPayload(proj, nd, index);
    const h = hash(JSON.stringify(payload));
    if (nd.finished) jobs.push({ nd, payload, mark: FINAL });
    else if (sent[nd.id] !== h) jobs.push({ nd, payload, mark: h });
  }));
  return jobs;
}
function backupDue(){
  // savedAt changes on every save; the backup only matters when something else did
  const h = hash(JSON.stringify({ ...data, savedAt: 0 }));
  return h !== state.backupHash ? h : null;
}

// ----- status, for the indicator -----
// 'off' not connected · 'ok' everything is in Drive · 'pending' waiting to send · 'offline' · 'error'
export function syncStatus(){
  if (!state.conn) return { state: 'off' };
  // the backup file follows a few minutes behind the tables; that lag is not worth a warning
  const waiting = pendingDays(data, state.sent).length > 0;
  const base = { name: state.conn.name, lastOk: state.lastOk, error: lastError };
  if (!waiting) return { state: 'ok', ...base };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { state: 'offline', ...base };
  return { state: failures ? 'error' : 'pending', ...base };
}
export function sheetUrl(projectId){ return state.sheets[projectId] || null; }

// ----- talking to the script -----
async function call(conn, action, body = {}){
  const res = await fetch(conn.url, {
    method: 'POST',
    // text/plain keeps this a "simple" request, which is the only kind Apps Script accepts cross-site
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ api: API, key: conn.key, device: state.device, action, ...body })
  });
  if (!res.ok) throw new Error(`Google odpověděl ${res.status}`);
  const out = await res.json().catch(() => { throw new Error('Skript neodpověděl správně — je nasazený pro „kohokoli“?'); });
  if (!out.ok) throw new Error(out.error || 'Skript požadavek odmítl');
  return out;
}

async function run(){
  if (running || !state.conn) return;
  running = true;
  try{
    for (const job of pendingDays(data, state.sent)){
      const out = await call(state.conn, 'day', job.payload);
      state.sent[job.nd.id] = job.mark;
      if (out.url) state.sheets[job.payload.project.id] = out.url;
      remember(); changed();
    }
    const h = backupDue();
    if (h && (Date.now() - state.backupAt > BACKUP_EVERY || document.hidden)){
      await call(state.conn, 'backup', { json: backupJSON() });
      state.backupHash = h; state.backupAt = Date.now();
    }
    failures = 0; lastError = ''; state.lastOk = Date.now();
    remember();
    if (backupDue()) schedule(BACKUP_EVERY - (Date.now() - state.backupAt));
  }catch(e){
    lastError = e.message || String(e);
    schedule(RETRY[Math.min(failures++, RETRY.length - 1)]);
  }finally{
    running = false;
    changed();
  }
  if (pendingDays(data, state.sent).length && !failures) schedule(DAY_DELAY);   // changed while sending
}
function schedule(ms){
  clearTimeout(timer);
  timer = setTimeout(run, Math.max(0, ms));
}
export function syncNow(){ failures = 0; schedule(0); }

// ----- connecting -----
// The code from the Google Sheet's Klapkolist menu: the script's address, a key and the person's name.
export function parseCode(code){
  try{
    const b64 = code.trim().slice(CODE_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const { u, k, n } = JSON.parse(new TextDecoder().decode(bytes));
    if (!code.trim().startsWith(CODE_PREFIX) || !/^https:\/\/script\.google\.com\//.test(u) || !k) return null;
    return { url: u, key: k, name: n || '' };
  }catch{ return null; }
}
export async function connect(code){
  const conn = parseCode(code);
  if (!conn) throw new Error('Tohle není kód pro připojení');
  const out = await call(conn, 'hello');
  state.conn = { ...conn, name: out.name || conn.name };
  state.sent = {}; state.sheets = {}; state.backupHash = ''; state.backupAt = 0;
  remember(); changed(); syncNow();
  return state.conn;
}
export function disconnect(){
  state.conn = null;
  remember(); changed();
}
// Backups in Drive made with this code: [{ id, name, when }]
export async function listDriveBackups(){ return (await call(state.conn, 'backups')).files; }
export async function fetchDriveBackup(id){ return JSON.parse((await call(state.conn, 'restore', { id })).json); }

export async function initSync(){
  const saved = await recall(KEY);
  if (saved) state = { ...state, ...saved };
  else remember();
  onChange(() => { changed(); if (state.conn) schedule(DAY_DELAY); });
  window.addEventListener('online', syncNow);
  // leaving the app: send what is waiting, backup included; coming back: catch up
  document.addEventListener('visibilitychange', () => { if (state.conn) schedule(document.hidden ? 0 : 2000); });
  if (state.conn) schedule(2000);
}
