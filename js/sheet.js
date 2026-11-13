// The Klapkolist table as it goes to and from Google Sheets.
// dayTable() is the one description of a day as a table: the copy-paste export and the automatic
// Google Sheets delivery both use it. Import reads the columns by their header names, so it takes
// back its own export as well as a plain OBRAZ / ZÁBĚR list. With no header row, the columns are
// taken in the export order.
import { DEPTS, NOTES, BEST, ratingOf, zState, zNumber, parseZNumber } from './model.js';
import { fold } from './util.js';

const CANCELLED = 'ZRUŠENO';
const noteHeader = n => n.key === 'skript' ? 'skript poznámky' : `poznámky ${n.name.toLowerCase()}`;
export const COLUMNS = ['OB', 'ZA', 'TA',
  ...DEPTS.flatMap(d => [d.name.toUpperCase(), noteHeader(d)]),
  noteHeader(NOTES[NOTES.length - 1])];
const SKRIPT = NOTES[NOTES.length - 1];

// → { header: [text], rows: [[text]], zaber: [index of the row's záběr], cancelled: [bool] }
//   One row per take; a záběr without takes still gets its row. Property columns come last.
export function dayTable(nd){
  const propKeys = [...new Set(nd.zabery.flatMap(z => z.takes.flatMap(t => t.properties.map(p => p.key))))].sort();
  const table = { header: [...COLUMNS, ...propKeys], rows: [], zaber: [], cancelled: [] };
  nd.zabery.forEach((z, zi) => {
    const cancelled = zState(z) === 'cancelled';
    const takes = z.takes.length ? z.takes : [null];
    takes.forEach((t, ti) => {
      const skript = [cancelled && ti === 0 ? CANCELLED : '', t?.[SKRIPT.note] || ''].filter(Boolean).join(' · ');
      table.rows.push([
        String(z.obraz), zNumber(z), t?.number != null ? String(t.number) : '',
        ...DEPTS.flatMap(d => [t?.[d.key] || '', t?.[d.note] || '']),
        skript,
        ...propKeys.map(k => t?.properties.find(p => p.key === k)?.value || '')
      ].map(clean));
      table.zaber.push(zi);
      table.cancelled.push(cancelled);
    });
  });
  return table;
}
// a cell is one line of text: tabs and line breaks would shift the table
function clean(text){ return String(text).replace(/[\t\r\n]+/g, ' ').trim(); }

export function toTSV(nd){
  const t = dayTable(nd);
  return [t.header, ...t.rows].map(r => r.join('\t')).join('\n');
}

// ----- import -----
// Which column holds what: { obraz, zaber, take, rezie, rezieNote, …, skriptNote, stav, props: [[index, key]] }
function columnMap(header){
  const names = header.map(fold);
  const at = (...alts) => names.findIndex(n => alts.includes(n));
  const or = (i, fallback) => i < 0 ? fallback : i;
  // without a recognisable OBRAZ / ZÁBĚR column, they are the first two, as in the export
  const map = { obraz: or(at('ob', 'obraz'), 0), zaber: or(at('za', 'zaber'), 1), take: at('ta', 'take'), stav: at('stav'), props: [] };
  const isNote = i => /^pozn/.test(names[i] || '');
  DEPTS.forEach(d => {
    map[d.key] = at(fold(d.name));
    const named = at(fold(noteHeader(d)));
    map[d.note] = named >= 0 ? named : map[d.key] >= 0 && isNote(map[d.key] + 1) ? map[d.key] + 1 : -1;
  });
  map[SKRIPT.note] = at(fold(noteHeader(SKRIPT)), 'poznamky skript', 'skript');
  const known = new Set([...Object.values(map).filter(Number.isInteger), at('star')]);
  header.forEach((h, i) => { if (h.trim() && !known.has(i) && !isNote(i)) map.props.push([i, h.trim()]); });
  return map;
}
const EXPORT_MAP = columnMap(COLUMNS);

function isHeader(cols){ return cols.some(c => /^(ob|za|obraz|zaber)$/.test(fold(c))); }
function parseRating(text){
  const v = text.toUpperCase().replace(/\s/g, '');
  if (/^BER/.test(v)) return BEST;
  return ratingOf(v) ? v : '';
}

// → [{ obraz, zaber, suffix, hasTake, take, rezie, rezieNote, …, skriptNote, cancelled, properties }]
//   obraz is null for a row without numbers that belongs to the záběr above it.
export function parseImport(text){
  if (!text.trim()) return [];
  const lines = text.replace(/\s+$/, '').split(/\r?\n/).map(l => l.split('\t'));
  const map = isHeader(lines[0]) ? columnMap(lines.shift()) : EXPORT_MAP;
  const rows = [];
  lines.forEach(cols => {
    const cell = i => (i >= 0 && cols[i] !== undefined ? cols[i].trim() : '');
    const row = { obraz: null };
    const obraz = parseInt(cell(map.obraz)), zn = parseZNumber(cell(map.zaber));
    if (!isNaN(obraz) && zn) Object.assign(row, { obraz, ...zn });
    DEPTS.forEach(d => { row[d.key] = parseRating(cell(map[d.key])); });
    NOTES.forEach(n => { row[n.note] = cell(map[n.note]); });
    row.properties = map.props.filter(([i]) => cell(i)).map(([i, key]) => ({ key, value: cell(i) }));
    const marked = row[SKRIPT.note].match(new RegExp(`^${CANCELLED}(?:\\s*·\\s*)?(.*)$`, 'i'));
    if (marked) row[SKRIPT.note] = marked[1];
    row.cancelled = !!marked || fold(cell(map.stav)) === fold(CANCELLED);
    const content = DEPTS.some(d => row[d.key]) || NOTES.some(n => row[n.note]) || row.properties.length > 0;
    row.take = parseInt(cell(map.take)) || null;
    row.hasTake = row.take != null || content;
    if (row.obraz == null && (!content || !rows.length)) return;   // nothing to attach, or nothing to attach it to
    rows.push(row);
  });
  return rows;
}
