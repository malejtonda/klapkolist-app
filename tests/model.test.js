import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, cycleStatus, zState, ndStats, addZaberAfterLast, addTake, setStar, nextTakeNumber,
  takeHasData, rememberNote, addToDict, dictValues } from '../js/model.js';
import { plural, fold, matchSuggestions } from '../js/util.js';

test('status cycles open → done → cancelled → open', () => {
  const z = { takes: [] };
  assert.deepEqual([cycleStatus(z), cycleStatus(z), cycleStatus(z)], ['done', 'cancelled', 'open']);
  assert.equal('status' in z, false);
});

test('day stats leave out cancelled záběry', () => {
  const nd = { zabery: [{ status: 'done' }, { status: 'cancelled' }, {}].map(z => ({ takes: [], ...z })) };
  assert.deepEqual(ndStats(nd), { total: 2, done: 1 });
});

test('quick add takes the next free number in the last obraz', () => {
  const nd = { zabery: [{ obraz: 3, zaber: 5, takes: [] }, { obraz: 3, zaber: 6, takes: [] }, { obraz: 3, zaber: 1, takes: [] }] };
  assert.equal(addZaberAfterLast(nd).zaber, 2);
  assert.equal(addZaberAfterLast(nd).zaber, 3);
  assert.equal(addZaberAfterLast(nd).zaber, 4);
  assert.equal(addZaberAfterLast(nd).zaber, 7);
  const empty = { zabery: [] };
  assert.deepEqual([addZaberAfterLast(empty).obraz, empty.zabery[0].zaber], [1, 1]);
});

test('takes: numbering, one star per záběr, data check', () => {
  const z = { takes: [] };
  const a = addTake(z), b = addTake(z, { star: true });
  assert.deepEqual([a.number, b.number, nextTakeNumber(z)], [1, 2, 3]);
  setStar(z, a, true);
  assert.deepEqual(z.takes.map(t => t.star), [true, false]);
  assert.equal(takeHasData(b), false);
  b.properties.push({ key: 'k', value: 'v' });
  assert.equal(takeHasData(b), true);
});

test('normalize: empty or broken data becomes a usable store', () => {
  for (const raw of [null, {}, { projects: 'x', dictionary: 3 }]){
    const d = normalize(raw);
    assert.deepEqual(d.projects, []);
    assert.equal(d.settings.stars, true);
    assert.deepEqual(d.noteHistory, { rezie: [], kamera: [], zvuk: [] });
  }
});

test('normalize: old per-obraz status and missing note history are upgraded', () => {
  const d = normalize({ projects: [{ id: 'p', name: 'P', nds: [{ id: 'n', obrazStatus: { 2: 'done', 3: 'open' }, zabery: [
    { obraz: 2, zaber: 1, takes: [{ rezieNote: 'Ostrost ' }, { rezieNote: 'ostrost', zvukNote: 'hluk' }] },
    { obraz: 3, zaber: 1 }
  ] }] }], dictionary: { objektiv: null } });
  const [z1, z2] = d.projects[0].nds[0].zabery;
  assert.equal(zState(z1), 'done');
  assert.equal(zState(z2), 'open');
  assert.equal('obrazStatus' in d.projects[0].nds[0], false);
  assert.deepEqual(z2.takes, []);
  assert.deepEqual(d.noteHistory.rezie, ['Ostrost']);
  assert.deepEqual(d.noteHistory.zvuk, ['hluk']);
  assert.deepEqual(d.dictionary.objektiv, []);
});

test('remembered notes: most recent first, no duplicates ignoring case and accents', () => {
  const h = { rezie: ['zaostření', 'b'] };
  assert.equal(rememberNote(h, 'rezie', '  '), false);
  rememberNote(h, 'rezie', 'Zaostreni');
  assert.deepEqual(h.rezie, ['Zaostreni', 'b']);
  assert.deepEqual(matchSuggestions(h.rezie, 'ZAOST'), ['Zaostreni']);
  assert.deepEqual(matchSuggestions(h.rezie, 'zaostreni'), [], 'an exact match is not offered again');
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
