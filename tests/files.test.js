// The service worker must cache every file the app loads, or the app breaks offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const walk = dir => readdirSync(dir).flatMap(f => statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]);

test('sw.js caches exactly the app files', () => {
  const listed = [...readFileSync(join(root, 'sw.js'), 'utf8').matchAll(/^\s*'\.\/([^']*)',?$/gm)].map(m => m[1]).filter(Boolean);
  const onDisk = ['index.html', 'manifest.webmanifest',
    ...['js', 'styles', 'fonts', 'icons'].flatMap(d => walk(join(root, d)).map(f => relative(root, f)))];
  assert.deepEqual([...listed].sort(), [...onDisk].sort());
});

test('every file referenced from the page, styles and scripts exists', () => {
  const refs = [];
  const collect = (file, re) => { for (const m of readFileSync(join(root, file), 'utf8').matchAll(re)) refs.push(join(file, '..', m[1])); };
  collect('index.html', /(?:href|src)="\.\/([^"]+)"/g);
  collect('manifest.webmanifest', /"src":\s*"\.\/([^"]+)"/g);
  walk(join(root, 'styles')).forEach(f => collect(relative(root, f), /url\(([^)]+)\)/g));
  walk(join(root, 'js')).forEach(f => collect(relative(root, f), /from '(\.[^']+)'/g));
  refs.forEach(r => assert.ok(statSync(join(root, r)).isFile(), r));
});
