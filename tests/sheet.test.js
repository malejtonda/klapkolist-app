import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayTable, toTSV, parseImport, COLUMNS } from '../js/sheet.js';
import { importRows, newTake, newZaber } from '../js/model.js';

const strip = nd => nd.zabery.map(({ obraz, zaber, suffix, status, takes }) =>
  ({ obraz, zaber, suffix, status, takes: takes.map(t => ({ ...t, id: null })) }));
const z = (obraz, zaber, suffix, extra, takes) => Object.assign(newZaber(obraz, zaber, suffix), extra, { takes });
const take = (n, patch) => Object.assign(newTake(n), patch);

function sampleDay(){
  return { zabery: [
    z(5, 13, '', {}, [
      take(1, { rezie: 'P+', kamera: 'P+', zvuk: 'P-', zvukNote: 'sjedeme wild' }),
      take(2, { rezie: 'BEREME', kamera: 'BEREME', zvuk: 'PP', skriptNote: 'letadlo v záběru', properties: [{ key: 'Objektiv', value: '50mm' }] })]),
    z(7, 22, '', {}, [
      take(1, { rezie: 'BEREME', kamera: 'BEREME', zvuk: 'BEREME' }),
      take(null, { skriptNote: 'ilustrační záběry' })]),
    z(2, 3, 'A', { status: 'cancelled' }, [take(1, { rezie: 'P', skriptNote: 'noviny' })]),
    z(2, 4, '', { status: 'cancelled' }, []),
    z(10, 35, '', { status: 'done', time: 45 }, [take(1), take(2, { kamera: 'P-', kameraNote: 'trochu špatný světlo' })]),
    z(10, 34, '', {}, [take(null, { rezie: 'PP', kamera: 'PP', zvuk: 'PP', skriptNote: 'prázdný jetí' }), take(1, { rezie: 'P+' })]),
    z(9, 1, '', {}, [])
  ] };
}

test('the table: your columns, one row per take, properties last', () => {
  const t = dayTable(sampleDay());
  assert.deepEqual(COLUMNS, ['OB', 'ZA', 'TA', 'REŽIE', 'poznámky režie', 'KAMERA', 'poznámky kamera', 'ZVUK', 'poznámky zvuk', 'skript poznámky']);
  assert.deepEqual(t.header, [...COLUMNS, 'Objektiv']);
  assert.deepEqual(t.rows[0], ['5', '13', '1', 'P+', '', 'P+', '', 'P-', 'sjedeme wild', '', '']);
  assert.deepEqual(t.rows[1], ['5', '13', '2', 'BEREME', '', 'BEREME', '', 'PP', '', 'letadlo v záběru', '50mm']);
  assert.deepEqual(t.rows[3].slice(0, 3), ['7', '22', ''], 'a note row has no take number');
  assert.equal(t.rows.length, 11);
  assert.ok(t.rows.every(r => r.length === t.header.length));
});

test('cancelled záběry are in the table, marked ZRUŠENO; done and time are not', () => {
  const t = dayTable(sampleDay());
  assert.deepEqual(t.rows[4], ['2', '3A', '1', 'P', '', '', '', '', '', 'ZRUŠENO · noviny', '']);
  assert.deepEqual(t.rows[5], ['2', '4', '', '', '', '', '', '', '', 'ZRUŠENO', '']);
  assert.deepEqual(t.cancelled, [false, false, false, false, true, true, false, false, false, false, false]);
  assert.deepEqual(t.zaber, [0, 0, 1, 1, 2, 3, 4, 4, 5, 5, 6]);
  assert.ok(!toTSV(sampleDay()).includes('HOTOVO'));
});

test('export → import gives back the same day (except done and time, which stay in the app)', () => {
  const day = sampleDay();
  const back = { zabery: [] };
  importRows(back, parseImport(toTSV(day)), {});
  const expected = strip(day);
  expected[4].status = undefined;
  assert.deepEqual(strip(back), expected);
});

test('a sheet typed by hand: BER, loose rows, filler cells, letter suffix', () => {
  const text = [
    'OB\tZA\tTA\tREŽIE\tpoznámky režie\tKAMERA\tpoznámky kamera\tZVUK\tpoznámky zvuk\tskript poznámky',
    '7\t22\t1\tBER\t\tBER\t\tBEREM\t\thodně možností',
    '\t\t\t\t\t\t\t\t\tilustrační záběry',
    '-\t\t\tㅤ\t\tㅤ\t\tㅤ\tprázdný jetí zvuku\t',
    '2\t3A\t1\tp+\t\tPP\t\tP-\t\t',
    '10\t34\t\tPP\t\tPP\t\tPP\t\tprázdný jetí'
  ].join('\n');
  const nd = { zabery: [] };
  importRows(nd, parseImport(text), {});
  assert.deepEqual(nd.zabery.map(x => [x.obraz, x.zaber, x.suffix, x.takes.length]), [[7, 22, '', 3], [2, 3, 'A', 1], [10, 34, '', 1]]);
  const [a, b, c] = nd.zabery[0].takes;
  assert.deepEqual([a.rezie, a.kamera, a.zvuk], ['BEREME', 'BEREME', 'BEREME']);
  assert.deepEqual([b.number, b.skriptNote], [null, 'ilustrační záběry']);
  assert.deepEqual([c.number, c.zvuk, c.zvukNote], [null, '', 'prázdný jetí zvuku']);
  assert.equal(nd.zabery[1].takes[0].rezie, 'P+');
  assert.deepEqual([nd.zabery[2].takes[0].number, nd.zabery[2].takes[0].rezie], [null, 'PP']);
});

test('plain OB / ZA list, with or without header; junk rows skipped', () => {
  for (const text of ['OBRAZ\tZÁBĚR\n2\t2\n2\t3\nx\ty\n5\t8', '2\t2\n2\t3\n\n5\t8']){
    const rows = parseImport(text);
    assert.deepEqual(rows.map(r => [r.obraz, r.zaber, r.hasTake]), [[2, 2, false], [2, 3, false], [5, 8, false]]);
  }
  assert.deepEqual(parseImport('  '), []);
});

test('importing into a day keeps existing záběry; properties go into the dictionary', () => {
  const nd = { zabery: [newZaber(2, 2)] };
  const id = nd.zabery[0].id, dict = {};
  importRows(nd, parseImport('OB\tZA\tTA\tObjektiv\n2\t2\t1\t35mm\n3\t1'), dict);
  assert.deepEqual(nd.zabery.map(x => x.takes.length), [1, 0]);
  assert.equal(nd.zabery[0].id, id);
  assert.deepEqual(dict, { objektiv: ['35mm'] });
});

test('notes cannot break the table', () => {
  const nd = { zabery: [z(1, 1, '', {}, [take(1, { rezieNote: 'a\tb\nc' })])] };
  assert.equal(toTSV(nd).split('\n').length, 2);
  assert.equal(dayTable(nd).rows[0][4], 'a b c');
});
