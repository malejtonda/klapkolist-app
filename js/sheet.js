// The Klapkolist table as it goes to and from Google Sheets (tab-separated).
// Export writes COLUMNS followed by one column per property. Import reads the columns by their
// header names, so it takes back its own export as well as a sheet with fewer or reordered columns.
// With no header row, the columns are taken in the export order.
import { DEPTS, zState } from './model.js';
import { fold } from './util.js';

const NOTE = 'pozn.';
export const COLUMNS = ['OBRAZ', 'ZÁBĚR', 'TAKE', 'STAR', ...DEPTS.flatMap(d => [d.header, NOTE]), 'STAV'];
const STATUS_TEXT = { done: 'HOTOVO', cancelled: 'ZRUŠENO' };

export function toTSV(nd){
  const propKeys = [...new Set(nd.zabery.flatMap(z => z.takes.flatMap(t => t.properties.map(p => p.key))))].sort();
  const B = v => v ? 'TRUE' : 'FALSE';
  const rows = [[...COLUMNS, ...propKeys]];
  nd.zabery.forEach(z => {
    const stav = STATUS_TEXT[zState(z)] || '';
    if (!z.takes.length){ rows.push([z.obraz, z.zaber, ...Array(COLUMNS.length - 3).fill(''), stav, ...propKeys.map(() => '')]); return; }
    z.takes.forEach(t => rows.push([
      z.obraz, z.zaber, t.number, B(t.star),
      ...DEPTS.flatMap(d => [B(t[d.key]), t[d.note] || '']),
      stav,
      ...propKeys.map(k => (t.properties.find(p => p.key === k) || {}).value || '')
    ]));
  });
  return rows.map(r => r.join('\t')).join('\n');
}

// Which column holds what: { obraz, zaber, take, star, rezie, rezieNote, …, stav, props: [[index, key]] }
function columnMap(header){
  const names = header.map(fold);
  const at = name => names.indexOf(fold(name));
  // without a recognisable OBRAZ / ZÁBĚR column, they are the first two, as in the export
  const map = { obraz: at('OBRAZ') < 0 ? 0 : at('OBRAZ'), zaber: at('ZÁBĚR') < 0 ? 1 : at('ZÁBĚR'), take: at('TAKE'), star: at('STAR'), stav: at('STAV'), props: [] };
  DEPTS.forEach(d => {
    map[d.key] = at(d.header);
    map[d.note] = map[d.key] >= 0 && names[map[d.key] + 1]?.startsWith('pozn') ? map[d.key] + 1 : -1;
  });
  const known = new Set(Object.values(map).filter(Number.isInteger));
  header.forEach((h, i) => { if (h.trim() && !known.has(i) && !names[i].startsWith('pozn')) map.props.push([i, h.trim()]); });
  return map;
}
const EXPORT_MAP = columnMap(COLUMNS);

function isHeader(cols){ return cols.some(c => /obraz|zaber/.test(fold(c))); }

// → [{ obraz, zaber, take?, star, rezie, rezieNote, …, status?, properties }]
export function parseImport(text){
  if (!text.trim()) return [];
  const lines = text.trim().split(/\r?\n/).map(l => l.split('\t'));
  const map = isHeader(lines[0]) ? columnMap(lines.shift()) : EXPORT_MAP;
  const rows = [];
  lines.forEach(cols => {
    const cell = i => (i >= 0 && cols[i] !== undefined ? cols[i].trim() : '');
    const obraz = parseInt(cell(map.obraz)), zaber = parseInt(cell(map.zaber));
    if (isNaN(obraz) || isNaN(zaber)) return;
    const row = { obraz, zaber };
    if (cell(map.take)) row.take = parseInt(cell(map.take)) || 1;
    row.star = cell(map.star).toUpperCase() === 'TRUE';
    DEPTS.forEach(d => { row[d.key] = cell(map[d.key]).toUpperCase() === 'TRUE'; row[d.note] = cell(map[d.note]); });
    const stav = fold(cell(map.stav));
    if (stav === 'hotovo') row.status = 'done';
    if (stav === 'zruseno') row.status = 'cancelled';
    row.properties = map.props.filter(([i]) => cell(i)).map(([i, key]) => ({ key, value: cell(i) }));
    rows.push(row);
  });
  return rows;
}
