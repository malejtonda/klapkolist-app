import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newer, snapshotsToKeep } from '../js/store.js';
import { pendingDays, parseCode, hash } from '../js/sync.js';
import { newZaber, addTake } from '../js/model.js';

test('of the two saved copies, the newer one wins; a missing or stampless one never does', () => {
  const a = { savedAt: 10 }, b = { savedAt: 20 };
  assert.equal(newer(a, b), b);
  assert.equal(newer(b, a), b);
  assert.equal(newer(null, a), a);
  assert.equal(newer(a, null), a);
  assert.equal(newer(a, {}), a);
  assert.equal(newer(null, null), null);
});

test('snapshots: the newest 12 are kept, then one per day for two weeks', () => {
  const MIN = 60 * 1000, DAY = 24 * 60 * MIN;
  const now = new Date(2026, 10, 12, 18, 0).getTime();
  const today = Array.from({ length: 30 }, (_, i) => now - i * 10 * MIN);          // every 10 minutes
  const earlier = Array.from({ length: 20 }, (_, i) => [now - (i + 1) * DAY, now - (i + 1) * DAY - 60 * MIN]).flat();
  const keep = snapshotsToKeep([...today, ...earlier], now);
  today.slice(0, 12).forEach(ts => assert.ok(keep.has(ts)));
  assert.ok(!keep.has(today[20]));
  for (let d = 1; d <= 13; d++){
    assert.ok(keep.has(now - d * DAY), `last snapshot of day -${d}`);
    assert.ok(!keep.has(now - d * DAY - 60 * MIN), `earlier snapshot of day -${d}`);
  }
  assert.ok(!keep.has(now - 15 * DAY));
});

test('only days that changed are sent; a finished day goes once more and then never', () => {
  const nd = { id: 'n1', name: 'ND1', zabery: [newZaber(1, 1)] };
  const d = { projects: [{ id: 'p', name: 'Film', nds: [nd, { id: 'n2', name: 'ND2', zabery: [] }] }] };
  const sent = {};
  let jobs = pendingDays(d, sent);
  assert.deepEqual(jobs.map(j => j.nd.id), ['n1', 'n2']);
  jobs.forEach(j => { sent[j.nd.id] = j.mark; });
  assert.deepEqual(pendingDays(d, sent), []);

  addTake(nd.zabery[0]).rezie = 'P';
  assert.deepEqual(pendingDays(d, sent).map(j => j.nd.id), ['n1']);
  sent.n1 = pendingDays(d, sent)[0].mark;

  nd.zabery[0].time = 30;               // app-only: not in the table, nothing to send
  assert.deepEqual(pendingDays(d, sent), []);

  nd.finished = true;
  jobs = pendingDays(d, sent);
  assert.deepEqual(jobs.map(j => j.mark), ['final']);
  sent.n1 = jobs[0].mark;
  d.projects[0].name = 'Film 2';        // renaming the project must not touch the finished tab
  assert.deepEqual(pendingDays(d, sent).map(j => j.nd.id), ['n2']);

  delete nd.finished;                   // reopened: the phone owns the tab again
  assert.deepEqual(pendingDays(d, sent).map(j => j.nd.id), ['n1', 'n2']);
});

test('connection code', () => {
  const code = 'KLAPKA1.' + Buffer.from(JSON.stringify({ u: 'https://script.google.com/macros/s/abc/exec', k: 'key', n: 'Tonda Š.' })).toString('base64url');
  assert.deepEqual(parseCode(`  ${code}\n`), { url: 'https://script.google.com/macros/s/abc/exec', key: 'key', name: 'Tonda Š.' });
  assert.equal(parseCode('hello'), null);
  assert.equal(parseCode('KLAPKA1.' + Buffer.from(JSON.stringify({ u: 'https://evil.example/exec', k: 'key' })).toString('base64url')), null);
  assert.equal(hash('a'), hash('a'));
  assert.notEqual(hash('a'), hash('b'));
});
