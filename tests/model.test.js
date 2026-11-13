import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, VERSION, cycleStatus, isLocked, ndStats, addZaberAfterLast, nextOpenZaber, moveZaber, newZaber,
  addTake, addNoteRow, removeTake, removeZaber, nextTakeNumber, takeHasData, hasBest, parseZNumber, zLabel, compareZ,
  parseTime, formatTime, rememberNote, noteSuggestions, addToDict, dictValues } from '../js/model.js';
import { plural, fold } from '../js/util.js';

test('status cycles open → done → cancelled → open; only an open záběr of an open day can change', () => {
  const z = newZaber(1, 1), nd = { zabery: [z] };
  assert.equal(isLocked(nd, z), false);
  assert.deepEqual([cycleStatus(z), isLocked(nd, z), cycleStatus(z), isLocked(nd, z), cycleStatus(z)], ['done', true, 'cancelled', true, 'open']);
  assert.equal('status' in z, false);
  assert.equal(isLocked({ finished: true }, z), true);
});

test('day stats leave out cancelled záběry, and add up the times', () => {
  const nd = { zabery: [{ status: 'done', time: 90 }, { status: 'cancelled', time: 600 }, { time: 45 }, {}].map(z => ({ takes: [], ...z })) };
  assert.deepEqual(ndStats(nd), { total: 3, done: 1, time: 135 });
});

test('time is typed on the number pad', () => {
  assert.deepEqual(['130', '1:30', '45', '0:07', '1005', '', ' '].map(parseTime), [90, 90, 45, 7, 605, null, null]);
  assert.equal(parseTime('abc'), undefined);
  assert.deepEqual([90, 7, 605, null].map(formatTime), ['1:30', '0:07', '10:05', '']);
});

test('záběr numbers can carry a letter', () => {
  assert.deepEqual(parseZNumber('3A'), { zaber: 3, suffix: 'A' });
  assert.deepEqual(parseZNumber(' 12 b '), { zaber: 12, suffix: 'B' });
  assert.deepEqual(parseZNumber('7'), { zaber: 7, suffix: '' });
  assert.equal(parseZNumber('A3'), null);
  assert.equal(zLabel(newZaber(2, 3, 'A')), '2 | 3A');
  const sorted = [newZaber(2, 3, 'A'), newZaber(2, 3), newZaber(1, 9), newZaber(2, 10)].sort(compareZ).map(zLabel);
  assert.deepEqual(sorted, ['1 | 9', '2 | 3', '2 | 3A', '2 | 10']);
});

test('quick add takes the next free number in the last obraz', () => {
  const nd = { zabery: [newZaber(3, 5), newZaber(3, 6), newZaber(3, 1)] };
  assert.deepEqual([1, 2, 3, 4].map(() => addZaberAfterLast(nd).zaber), [2, 3, 4, 7]);
  const empty = { zabery: [] };
  assert.equal(zLabel(addZaberAfterLast(empty)), '1 | 1');
});

test('next open záběr wraps round and skips done and cancelled', () => {
  const [a, b, c, d] = [{}, { status: 'done' }, { status: 'cancelled' }, {}].map((x, i) => Object.assign(newZaber(1, i + 1), x));
  const nd = { zabery: [a, b, c, d] };
  assert.equal(nextOpenZaber(nd, a.id), d);
  assert.equal(nextOpenZaber(nd, d.id), a);
  assert.equal(nextOpenZaber(nd, undefined), a);
  assert.equal(nextOpenZaber({ zabery: [a, b] }, a.id), null);
});

test('reordering and undoable deletes', () => {
  const nd = { zabery: [1, 2, 3, 4].map(n => newZaber(1, n)) };
  moveZaber(nd, 0, 2);
  assert.deepEqual(nd.zabery.map(z => z.zaber), [2, 3, 1, 4]);
  const undo = removeZaber(nd, nd.zabery[1]);
  assert.deepEqual(nd.zabery.map(z => z.zaber), [2, 1, 4]);
  undo();
  assert.deepEqual(nd.zabery.map(z => z.zaber), [2, 3, 1, 4]);
  const z = nd.zabery[0], t1 = addTake(z), t2 = addTake(z);
  const back = removeTake(z, t1);
  assert.deepEqual(z.takes, [t2]);
  back();
  assert.deepEqual(z.takes, [t1, t2]);
});

test('takes: numbering skips note rows, ratings start empty', () => {
  const z = newZaber(1, 1);
  const a = addTake(z), n = addNoteRow(z), b = addTake(z);
  assert.deepEqual([a.number, n.number, b.number, nextTakeNumber(z)], [1, null, 2, 3]);
  assert.deepEqual([a.rezie, a.kamera, a.zvuk, a.skriptNote], ['', '', '', '']);
  assert.equal(takeHasData(a), false);
  assert.equal(hasBest(z), false);
  b.zvuk = 'BEREME';
  assert.equal(takeHasData(b), true);
  assert.equal(hasBest(z), true);
});

test('normalize: empty, broken or pre-version-2 data becomes a usable empty store', () => {
  for (const raw of [null, {}, { projects: 'x', dictionary: 3 }, { projects: [{ id: 'p', name: 'old', nds: [] }] }]){
    const d = normalize(raw);
    assert.equal(d.version, VERSION);
    assert.deepEqual(d.projects, []);
    assert.equal(d.settings.times, true);
    assert.deepEqual(d.noteHistory, { rezie: [], kamera: [], zvuk: [], skript: [] });
  }
});

test('normalize: repairs what is missing without touching what is there', () => {
  const d = normalize({ version: VERSION, savedAt: 5, projects: [{ id: 'p', name: 'P', nds: [{ id: 'n', zabery: [
    { obraz: 2, zaber: 1, status: 'open', takes: [{ number: 1, rezie: 'P+', kamera: 'nonsense', rezieNote: 'x' }] },
    { obraz: 3, zaber: 1, suffix: 'A', status: 'cancelled' }
  ] }] }], dictionary: { objektiv: null } });
  const [z1, z2] = d.projects[0].nds[0].zabery;
  assert.equal('status' in z1, false);
  assert.deepEqual([z1.suffix, z2.suffix, z2.status], ['', 'A', 'cancelled']);
  assert.deepEqual(z2.takes, []);
  const t = z1.takes[0];
  assert.deepEqual([t.rezie, t.kamera, t.zvuk, t.rezieNote, t.skriptNote, t.properties], ['P+', '', '', 'x', '', []]);
  assert.deepEqual(d.dictionary.objektiv, []);
  assert.equal(d.savedAt, 5);
});

test('remembered notes: the most used come first, no duplicates ignoring case and accents', () => {
  const h = { rezie: [] };
  assert.equal(rememberNote(h, 'rezie', '  '), false);
  ['auto', 'zaostření', 'letadlo', 'Zaostreni', 'auto', 'auto'].forEach(n => rememberNote(h, 'rezie', n));
  assert.deepEqual(h.rezie.map(x => [x.text, x.count]), [['auto', 3], ['Zaostreni', 2], ['letadlo', 1]]);
  assert.deepEqual(noteSuggestions(h, 'rezie', ''), ['auto', 'Zaostreni', 'letadlo']);
  assert.deepEqual(noteSuggestions(h, 'rezie', 'ZAOST'), ['Zaostreni']);
  assert.deepEqual(noteSuggestions(h, 'rezie', 'auto'), [], 'an exact match is not offered again');
});

test('dictionary keys are case-insensitive, values unique', () => {
  const d = {};
  addToDict(d, 'Objektiv', '50mm'); addToDict(d, 'objektiv ', '50mm'); addToDict(d, 'OBJEKTIV', '');
  assert.deepEqual(d, { objektiv: ['50mm'] });
  assert.deepEqual(dictValues(d, 'Objektiv'), ['50mm']);
});

test('Czech plurals and folding', () => {
  assert.deepEqual([1, 2, 4, 5, 0].map(n => plural(n, 'take', 'taky', 'taků')), ['take', 'taky', 'taky', 'taků', 'taků']);
  assert.equal(fold(' ZÁBĚR '), 'zaber');
});
