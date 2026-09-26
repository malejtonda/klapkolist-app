// The Klapkolist data model: project → shooting days (nds) → záběry → takes.
// Pure functions over plain objects: no DOM, no storage, so they can be tested on their own.
//
// data = { projects: [{ id, name, nds: [{ id, name, zabery: [Zaber] }] }],
//          dictionary: { key: [value] }, noteHistory: { rezie: [], kamera: [], zvuk: [] }, settings: { stars } }
// Zaber = { id, obraz, zaber, status?: 'done' | 'cancelled', takes: [Take] }
// Take  = { id, number, star, rezie, rezieNote, kamera, kameraNote, zvuk, zvukNote, properties: [{ key, value }] }
import { uid, fold } from './util.js';

// The three departments that sign off a take. Everything per-department loops over this.
export const DEPTS = [
  { key: 'rezie',  note: 'rezieNote',  letter: 'R', name: 'Režie',  header: 'REŽIE' },
  { key: 'kamera', note: 'kameraNote', letter: 'K', name: 'Kamera', header: 'KAMERA' },
  { key: 'zvuk',   note: 'zvukNote',   letter: 'Z', name: 'Zvuk',   header: 'ZVUK' }
];

export function newTake(number){
  const t = { id: uid(), number, star: false };
  DEPTS.forEach(d => { t[d.key] = false; t[d.note] = ''; });
  t.properties = [];
  return t;
}
export function hasNote(t, d){ return !!(t[d.note] || '').trim(); }
export function takeHasData(t){ return DEPTS.some(d => t[d.key] || t[d.note]) || t.properties.length > 0; }

// ----- záběr status: marked by hand, nothing is marked automatically -----
export const STATUS_LABEL = { open: 'otevřeno', done: 'hotovo', cancelled: 'zrušeno' };
export function zState(z){ return z.status === 'done' || z.status === 'cancelled' ? z.status : 'open'; }
// A záběr marked done is locked: its takes can be read, not changed.
export function isLocked(z){ return z.status === 'done'; }
// OTEVŘENO → HOTOVO → ZRUŠENO → OTEVŘENO
export function cycleStatus(z){
  const next = { open: 'done', done: 'cancelled', cancelled: 'open' }[zState(z)];
  if (next === 'open') delete z.status; else z.status = next;
  return next;
}
export function ndStats(nd){
  const live = nd.zabery.filter(z => zState(z) !== 'cancelled');
  return { total: live.length, done: live.filter(z => zState(z) === 'done').length };
}
export function zLabel(z){ return `${z.obraz} | ${z.zaber}`; }
export function findZaber(nd, obraz, zaber){ return nd.zabery.find(z => z.obraz === obraz && z.zaber === zaber); }
export function zaberOfTake(nd, takeId){ return nd.zabery.find(z => z.takes.some(t => t.id === takeId)) || null; }

// ----- changes -----
// One tap: the next free number in the same obraz as the last záběr.
export function addZaberAfterLast(nd){
  const last = nd.zabery[nd.zabery.length - 1];
  const obraz = last ? last.obraz : 1;
  let zaber = last ? last.zaber + 1 : 1;
  while (findZaber(nd, obraz, zaber)) zaber++;
  const z = { id: uid(), obraz, zaber, takes: [] };
  nd.zabery.push(z);
  return z;
}
export function nextTakeNumber(z){ return z.takes.length ? Math.max(...z.takes.map(t => t.number)) + 1 : 1; }
// Only one take per záběr carries the star.
export function setStar(z, t, on){
  if (on) z.takes.forEach(x => { x.star = false; });
  t.star = on;
}
export function addTake(z, patch = {}){
  const t = newTake(nextTakeNumber(z));
  Object.assign(t, patch);
  z.takes.push(t);
  if (t.star) setStar(z, t, true);
  return t;
}

// Rows from the Sheets import (see sheet.js) merged into a day: new záběry are added,
// existing ones get their status and extra takes.
export function importRows(nd, rows, dictionary){
  rows.forEach(row => {
    let z = findZaber(nd, row.obraz, row.zaber);
    if (!z){ z = { id: uid(), obraz: row.obraz, zaber: row.zaber, takes: [] }; nd.zabery.push(z); }
    if (row.status) z.status = row.status;
    if (!row.take) return;    // just OBRAZ + ZÁBĚR: the záběr starts empty, its first take waits in the faint row
    const t = newTake(row.take);
    DEPTS.forEach(d => { t[d.key] = !!row[d.key]; t[d.note] = row[d.note] || ''; });
    t.properties = row.properties || [];
    t.properties.forEach(p => addToDict(dictionary, p.key, p.value));
    z.takes.push(t);
    if (row.star) setStar(z, t, true);
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
// Notes, kept per department so režie never suggests kamera's notes. Most recent first.
export function rememberNote(history, dept, text){
  const v = (text || '').trim();
  if (!v) return false;
  const list = history[dept];
  const i = list.findIndex(x => fold(x) === fold(v));
  if (i >= 0) list.splice(i, 1);
  list.unshift(v);
  if (list.length > 80) list.length = 80;
  return true;
}

// ----- loading -----
// Whatever was stored (or restored from a backup), made safe to use. Old formats are upgraded here.
export function normalize(raw){
  const data = raw && typeof raw === 'object' ? raw : {};
  if (!Array.isArray(data.projects)) data.projects = [];
  if (!data.dictionary || typeof data.dictionary !== 'object') data.dictionary = {};
  Object.keys(data.dictionary).forEach(k => { if (!Array.isArray(data.dictionary[k])) data.dictionary[k] = []; });
  if (!data.settings || typeof data.settings !== 'object') data.settings = {};
  if (data.settings.stars === undefined) data.settings.stars = true;
  data.projects.forEach(p => {
    if (!Array.isArray(p.nds)) p.nds = [];
    p.nds.forEach(nd => {
      if (!Array.isArray(nd.zabery)) nd.zabery = [];
      // old format: one status per obraz
      if (nd.obrazStatus && typeof nd.obrazStatus === 'object'){
        nd.zabery.forEach(z => { const st = nd.obrazStatus[z.obraz]; if (st && st !== 'open' && !z.status) z.status = st; });
        delete nd.obrazStatus;
      }
      nd.zabery.forEach(z => {
        if (z.status === 'open') delete z.status;
        if (!Array.isArray(z.takes)) z.takes = [];
        z.takes.forEach(t => { if (!Array.isArray(t.properties)) t.properties = []; });
      });
    });
  });
  if (!data.noteHistory || typeof data.noteHistory !== 'object'){
    // first run with note suggestions: seed them from the notes already written
    data.noteHistory = {};
    DEPTS.forEach(d => { data.noteHistory[d.key] = []; });
    eachTake(data, t => DEPTS.forEach(d => {
      const v = (t[d.note] || '').trim(), list = data.noteHistory[d.key];
      if (v && !list.some(x => fold(x) === fold(v))) list.push(v);
    }));
  }
  DEPTS.forEach(d => { if (!Array.isArray(data.noteHistory[d.key])) data.noteHistory[d.key] = []; });
  return data;
}
function eachTake(data, fn){ data.projects.forEach(p => p.nds.forEach(nd => nd.zabery.forEach(z => z.takes.forEach(fn)))); }
