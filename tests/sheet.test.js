import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toTSV, parseImport, COLUMNS } from '../js/sheet.js';
import { importRows, newTake } from '../js/model.js';

const strip = nd => nd.zabery.map(({ obraz, zaber, status, takes }) =>
  ({ obraz, zaber, status, takes: takes.map(t => ({ ...t, id: null })) }));

function sampleDay(){
  const t1 = Object.assign(newTake(1), { rezie: true, rezieNote: 'dobré', kamera: false, kameraNote: 'ostrost', zvuk: true,
    properties: [{ key: 'Objektiv', value: '50mm' }] });
  const t2 = Object.assign(newTake(2), { star: true, kamera: true, zvukNote: 'hluk',
    properties: [{ key: 'Filtr', value: 'ND 0.6' }] });
  return { zabery: [
    { id: 'a', obraz: 2, zaber: 2, takes: [t1, t2] },
    { id: 'b', obraz: 2, zaber: 3, status: 'cancelled', takes: [] },
    { id: 'c', obraz: 5, zaber: 8, status: 'done', takes: [Object.assign(newTake(1), { rezie: true, kamera: true, zvuk: true })] },
    { id: 'd', obraz: 5, zaber: 9, takes: [] }
  ] };
}

test('export → import gives back the same day', () => {
  const day = sampleDay();
  const back = { zabery: [] };
  importRows(back, parseImport(toTSV(day)), {});
  assert.deepEqual(strip(back), strip(day));
});

test('export header and one row per take', () => {
  const lines = toTSV(sampleDay()).split('\n');
  assert.deepEqual(lines[0].split('\t'), [...COLUMNS, 'Filtr', 'Objektiv']);
  assert.equal(lines.length, 1 + 2 + 1 + 1 + 1);
  assert.deepEqual(lines[3].split('\t').slice(0, 3), ['2', '3', '']);
  assert.equal(lines[3].split('\t')[COLUMNS.indexOf('STAV')], 'ZRUŠENO');
});

test('columns are found by header name, in any order', () => {
  const rows = parseImport('ZÁBĚR\tOBRAZ\tTAKE\tZVUK\tpozn.\tstav\n4\t1\t3\tTRUE\tšum\tHotovo');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].obraz, 1);
  assert.equal(rows[0].zaber, 4);
  assert.equal(rows[0].take, 3);
  assert.equal(rows[0].zvuk, true);
  assert.equal(rows[0].zvukNote, 'šum');
  assert.equal(rows[0].rezie, false);
  assert.equal(rows[0].status, 'done');
});

test('plain OBRAZ / ZÁBĚR list, with or without header; junk rows skipped', () => {
  for (const text of ['OBRAZ\tZÁBĚR\n2\t2\n2\t3\nx\ty\n5\t8', '2\t2\n2\t3\n\n5\t8']){
    const rows = parseImport(text);
    assert.deepEqual(rows.map(r => [r.obraz, r.zaber, r.take]), [[2, 2, undefined], [2, 3, undefined], [5, 8, undefined]]);
  }
  assert.deepEqual(parseImport('  '), []);
});

test('importing into a day keeps existing záběry and adds takes to them', () => {
  const nd = { zabery: [{ id: 'x', obraz: 2, zaber: 2, takes: [] }] };
  importRows(nd, parseImport('OBRAZ\tZÁBĚR\tTAKE\tSTAR\n2\t2\t1\tTRUE\n2\t2\t2\tTRUE\n3\t1'), {});
  assert.equal(nd.zabery.length, 2);
  assert.equal(nd.zabery[0].id, 'x');
  assert.deepEqual(nd.zabery[0].takes.map(t => t.star), [false, true], 'only one star per záběr');
});

test('imported properties go into the dictionary', () => {
  const dict = {};
  importRows({ zabery: [] }, parseImport('OBRAZ\tZÁBĚR\tTAKE\tObjektiv\n1\t1\t1\t35mm'), dict);
  assert.deepEqual(dict, { objektiv: ['35mm'] });
});
