// The Klapkolist data model: project → shooting days (nds) → záběry → takes.
// Pure functions over plain objects: no DOM, no storage, so they can be tested on their own.
//
// data = { version, savedAt, projects: [{ id, name, nds: [Day] }],
//          dictionary: { key: [value] }, noteHistory: { rezie: [Note], … }, settings: { times } }
// Day   = { id, name, finished?, zabery: [Zaber] }
// Zaber = { id, obraz, zaber, suffix, status?: 'done' | 'cancelled', time?: seconds, takes: [Take] }
// Take  = { id, number | null, rezie, rezieNote, kamera, kameraNote, zvuk, zvukNote, skriptNote,
//           properties: [{ key, value }] }
//         number null = a row without a take number (wild track, empty run, illustration shots)
// Note  = { text, count }
import { uid, fold } from './util.js';

export const VERSION = 2;

// The three departments that rate a take. Everything per-department loops over this.
export const DEPTS = [
  { key: 'rezie',  note: 'rezieNote',  letter: 'R', name: 'Režie' },
  { key: 'kamera', note: 'kameraNote', letter: 'K', name: 'Kamera' },
  { key: 'zvuk',   note: 'zvukNote',   letter: 'Z', name: 'Zvuk' }
];
// Everyone who writes a note on a take: the departments, and the script supervisor (no rating).
export const NOTES = [...DEPTS, { key: 'skript', note: 'skriptNote', letter: 'S', name: 'Skript' }];

// What a department thinks of a take, worst to best. '' = not rated yet.
export const RATINGS = [
  { code: 'PP',     short: 'PP',  name: 'nepoužitelný' },
  { code: 'P-',     short: 'P-',  name: 'použitelný, ale nic moc' },
  { code: 'P',      short: 'P',   name: 'použitelný' },
  { code: 'P+',     short: 'P+',  name: 'použitelný, lepší' },
  { code: 'BEREME', short: 'BER', name: 'bereme' }
];
export const BEST = 'BEREME';
export function ratingOf(code){ return RATINGS.find(r => r.code === code) || null; }

export function newTake(number){
  const t = { id: uid(), number };
  DEPTS.forEach(d => { t[d.key] = ''; });
  NOTES.forEach(n => { t[n.note] = ''; });
  t.properties = [];
  return t;
}
export function takeLabel(t){ return t.number == null ? 'pozn.' : `take ${t.number}`; }
export function hasNote(t, n){ return !!(t[n.note] || '').trim(); }
export function takeHasData(t){ return DEPTS.some(d => t[d.key]) || NOTES.some(n => hasNote(t, n)) || t.properties.length > 0; }

// ----- záběr -----
export function newZaber(obraz, zaber, suffix = ''){ return { id: uid(), obraz, zaber, suffix, takes: [] }; }
export function zNumber(z){ return `${z.zaber}${z.suffix || ''}`; }
export function zLabel(z){ return `${z.obraz} | ${zNumber(z)}`; }
// "3A" → { zaber: 3, suffix: 'A' }; null when it doesn't start with a number
export function parseZNumber(text){
  const m = String(text).trim().match(/^(\d+)\s*([^\d\s].*)?$/);
  return m ? { zaber: parseInt(m[1]), suffix: (m[2] || '').trim().toUpperCase() } : null;
}
export function sameNumber(z, obraz, zaber, suffix = ''){ return z.obraz === obraz && z.zaber === zaber && (z.suffix || '') === suffix; }
export function findZaber(nd, obraz, zaber, suffix = ''){ return nd.zabery.find(z => sameNumber(z, obraz, zaber, suffix)); }
export function zaberOfTake(nd, takeId){ return nd.zabery.find(z => z.takes.some(t => t.id === takeId)) || null; }
export function compareZ(a, b){ return a.obraz - b.obraz || a.zaber - b.zaber || (a.suffix || '').localeCompare(b.suffix || ''); }

// status: marked by hand, nothing is marked automatically
export const STATUS_LABEL = { open: 'otevřeno', done: 'hotovo', cancelled: 'zrušeno' };
export function zState(z){ return z.status === 'done' || z.status === 'cancelled' ? z.status : 'open'; }
// OTEVŘENO → HOTOVO → ZRUŠENO → OTEVŘENO
export function cycleStatus(z){
  const next = { open: 'done', done: 'cancelled', cancelled: 'open' }[zState(z)];
  if (next === 'open') delete z.status; else z.status = next;
  return next;
}
// Only an open záběr of an unfinished day can be changed. The rest can be read.
export function isLocked(nd, z){ return !!nd.finished || zState(z) !== 'open'; }
export function hasBest(z){ return z.takes.some(t => DEPTS.some(d => t[d.key] === BEST)); }

// ----- time (mm:ss per záběr, only in the app) -----
// "1:30", "130" → 90; "45" → 45; '' → null. Typed on the number pad, so the colon is optional.
export function parseTime(text){
  const s = String(text).trim();
  if (!s) return null;
  const m = s.match(/^(\d+)\s*[:.,]\s*(\d{1,2})$/);
  if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
  if (!/^\d+$/.test(s)) return undefined;   // not a time
  return Math.floor(parseInt(s) / 100) * 60 + parseInt(s) % 100;
}
export function formatTime(seconds){
  if (seconds == null) return '';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// ----- day -----
export function ndStats(nd){
  const live = nd.zabery.filter(z => zState(z) !== 'cancelled');
  return {
    total: live.length,
    done: live.filter(z => zState(z) === 'done').length,
    time: live.reduce((a, z) => a + (z.time || 0), 0)
  };
}
// One tap: the next free number in the same obraz as the last záběr.
export function addZaberAfterLast(nd){
  const last = nd.zabery[nd.zabery.length - 1];
  const obraz = last ? last.obraz : 1;
  let zaber = last ? last.zaber + 1 : 1;
  while (findZaber(nd, obraz, zaber)) zaber++;
  const z = newZaber(obraz, zaber);
  nd.zabery.push(z);
  return z;
}
// The first open záběr after this one (wrapping round), or null when none is open.
export function nextOpenZaber(nd, afterId){
  const i = nd.zabery.findIndex(z => z.id === afterId);
  const order = [...nd.zabery.slice(i + 1), ...nd.zabery.slice(0, i + 1)];
  return order.find(z => zState(z) === 'open' && z.id !== afterId) || null;
}
export function moveZaber(nd, from, to){
  if (from === to || from < 0 || to < 0 || from >= nd.zabery.length || to >= nd.zabery.length) return;
  nd.zabery.splice(to, 0, nd.zabery.splice(from, 1)[0]);
}

// ----- takes -----
export function nextTakeNumber(z){ return Math.max(0, ...z.takes.map(t => t.number || 0)) + 1; }
export function addTake(z, patch = {}){
  const t = Object.assign(newTake(nextTakeNumber(z)), patch);
  z.takes.push(t);
  return t;
}
export function addNoteRow(z){
  const t = newTake(null);
  z.takes.push(t);
  return t;
}
// Removes the take and returns a function that puts it back where it was (for undo).
export function removeTake(z, t){
  const i = z.takes.indexOf(t);
  if (i < 0) return () => {};
  z.takes.splice(i, 1);
  return () => { z.takes.splice(Math.min(i, z.takes.length), 0, t); };
}
export function removeZaber(nd, z){
  const i = nd.zabery.indexOf(z);
  if (i < 0) return () => {};
  nd.zabery.splice(i, 1);
  return () => { nd.zabery.splice(Math.min(i, nd.zabery.length), 0, z); };
}

// Rows from the Sheets import (see sheet.js) merged into a day: new záběry are added in the order
// they come, existing ones get their status and extra takes.
export function importRows(nd, rows, dictionary){
  let z = null;
  rows.forEach(row => {
    if (row.obraz != null){
      z = findZaber(nd, row.obraz, row.zaber, row.suffix);
      if (!z){ z = newZaber(row.obraz, row.zaber, row.suffix); nd.zabery.push(z); }
    }
    if (!z) return;                 // a loose row before any záběr
    if (row.cancelled) z.status = 'cancelled';
    if (!row.hasTake) return;       // just OBRAZ + ZÁBĚR: the záběr starts empty
    const t = newTake(row.take);
    DEPTS.forEach(d => { t[d.key] = row[d.key] || ''; });
    NOTES.forEach(n => { t[n.note] = row[n.note] || ''; });
    t.properties = row.properties || [];
    t.properties.forEach(p => addToDict(dictionary, p.key, p.value));
    z.takes.push(t);
  });
}

// ----- remembered values -----
// Property names and their values, offered again next time.
export function addToDict(dictionary, key, value){
  const k = (key || '').trim().toLowerCase();
  if (!k) return;
  const list = dictionary[k] || (dictionary[k] = []);
  const v = (value || '').trim();
  if (v && !list.includes(v)) list.push(v);
}
export function dictValues(dictionary, key){ return dictionary[key.trim().toLowerCase()] || []; }

// Notes, kept per author so režie never gets kamera's notes offered. Most recent first, with how
// often each was used.
export function rememberNote(history, key, text){
  const v = (text || '').trim();
  if (!v) return false;
  const list = history[key];
  const i = list.findIndex(x => fold(x.text) === fold(v));
  const count = i >= 0 ? list.splice(i, 1)[0].count + 1 : 1;
  list.unshift({ text: v, count });
  if (list.length > 80) list.length = 80;
  return true;
}
// The notes to offer: most used first (recent first among equals), filtered by what is typed.
export function noteSuggestions(history, key, query, max = 12){
  const q = fold(query || '');
  return history[key]
    .filter(x => fold(x.text) !== q && (!q || fold(x.text).includes(q)))
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => b.count - a.count || a.i - b.i)
    .slice(0, max).map(x => x.text);
}

// ----- loading -----
// Whatever was stored or restored from a backup, made safe to use. Data from before version 2
// (checkboxes and stars) is not carried over.
export function normalize(raw){
  const ok = raw && typeof raw === 'object' && raw.version === VERSION;
  const data = ok ? raw : { version: VERSION };
  const arr = (o, k) => { if (!Array.isArray(o[k])) o[k] = []; };
  const obj = (o, k) => { if (!o[k] || typeof o[k] !== 'object' || Array.isArray(o[k])) o[k] = {}; };
  arr(data, 'projects'); obj(data, 'dictionary'); obj(data, 'settings'); obj(data, 'noteHistory');
  if (typeof data.savedAt !== 'number') data.savedAt = 0;
  if (data.settings.times === undefined) data.settings.times = true;
  Object.keys(data.dictionary).forEach(k => arr(data.dictionary, k));
  NOTES.forEach(n => {
    arr(data.noteHistory, n.key);
    data.noteHistory[n.key] = data.noteHistory[n.key].filter(x => x && typeof x.text === 'string');
  });
  data.projects = data.projects.filter(p => p && typeof p === 'object');
  data.projects.forEach(p => {
    arr(p, 'nds');
    p.nds.forEach(nd => {
      arr(nd, 'zabery');
      nd.zabery.forEach(z => {
        if (z.status !== 'done' && z.status !== 'cancelled') delete z.status;
        if (typeof z.suffix !== 'string') z.suffix = '';
        arr(z, 'takes');
        z.takes.forEach(t => {
          DEPTS.forEach(d => { if (!ratingOf(t[d.key])) t[d.key] = ''; });
          NOTES.forEach(n => { if (typeof t[n.note] !== 'string') t[n.note] = ''; });
          arr(t, 'properties');
        });
      });
    });
  });
  return data;
}
