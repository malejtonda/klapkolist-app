// Drives the real app in Chromium at iPhone size, with Google's script replaced by a stand-in.
// usage: node tools/e2e.mjs [screenshot dir]     (needs Playwright: NODE_PATH or a local install)
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = process.argv[2];
if (out) fs.mkdirSync(out, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!fs.existsSync(f)){ res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
}).listen(0);

let failed = 0;
const ok = (cond, what) => { console.log((cond ? 'PASS ' : 'FAIL ') + what); if (!cond) failed++; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// the stand-in for the Apps Script web app
const sent = [];
let scriptUp = true;
await page.route('https://script.google.com/**', route => {
  if (!scriptUp) return route.abort();
  const body = JSON.parse(route.request().postData());
  sent.push(body);
  const reply = body.key !== 'secret' ? { ok: false, error: 'Kód už neplatí' }
    : body.action === 'hello' ? { ok: true, name: 'Tonda' }
    : body.action === 'day' ? { ok: true, url: 'https://docs.google.com/spreadsheets/d/x' }
    : body.action === 'backups' ? { ok: true, files: [{ id: 'b1', name: 'Tonda – tel', when: Date.now() }] }
    : body.action === 'restore' ? { ok: true, json: sent.findLast(b => b.action === 'backup').json }
    : { ok: true };
  route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(reply) });
});
const code = 'KLAPKA1.' + Buffer.from(JSON.stringify({ u: 'https://script.google.com/macros/s/abc/exec', k: 'secret', n: 'Tonda' })).toString('base64url');

let n = 0;
const shot = async name => { await page.waitForTimeout(350); if (out) await page.screenshot({ path: path.join(out, `${String(++n).padStart(2, '0')}-${name}.png`) }); };
const tap = sel => page.locator(sel).first().click();
const text = async sel => (await page.locator(sel).first().textContent()).trim();
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('klapkolist_v2')));
const url = `http://localhost:${server.address().port}/`;

try{
  await page.goto(url);
  await tap('text=+ Nový projekt');
  await page.fill('.dialog input', 'Film');
  await page.keyboard.press('Enter');
  await tap('text=+ Natáčecí den');
  await page.fill('#import-ta', 'OB\tZA\n5\t13\n7\t21\n7\t22\n2\t4');
  await shot('import');
  await tap('text=Pokračovat');
  ok(await page.locator('.zblock').count() === 4, 'import: four záběry');

  // ----- rating: tap R on the waiting take, pick, the picker moves on to K, then Z -----
  await tap('[aria-label="Přidat take 1 a ohodnotit: Režie"]');
  await shot('picker');
  ok(await page.locator('.picker').count() === 1, 'tapping R opens the five buttons');
  await tap('[aria-label^="Režie: P+"]');
  ok((await text('.picker-who')) === 'K', 'after picking, the picker moves on to Kamera');
  await tap('[aria-label^="Kamera: BEREME"]');
  await tap('[aria-label^="Zvuk: PP"]');
  ok(await page.locator('.picker').count() === 0, 'picker closes after the last department');
  ok((await page.locator('#list .take:not(.ghost) .chip').allInnerTexts()).join(' ') === 'P+ BER PP', 'chips show the ratings');
  ok(await page.locator('.cell.has-best').count() === 1, 'map marks the záběr with a BEREME');
  await tap('[aria-label^="Take 1, Režie: použitelný, lepší"]');
  await tap('[aria-label^="Režie: P+"]');
  ok((await text('#list .take:not(.ghost) .chip')) === 'R', 'tapping the current rating clears it');
  await tap('[aria-label^="Take 1, Režie: nehodnoceno"]');
  await tap('[aria-label^="Režie: P,"]');
  await shot('rated');

  // ----- notes: opening does not bring up the keyboard -----
  await tap('#list .take-toggle');
  ok(await page.evaluate(() => document.activeElement === document.body), 'opening notes focuses nothing');
  ok(await page.locator('.take-body.slide-in').count() === 1, 'the notes slide in');
  ok(await page.locator('.take-body .field-in').count() === 4, 'four notes: R, K, Z and skript');
  await page.locator('.take-body .field-in').nth(2).fill('sjedeme wild');
  await page.locator('.take-body .field-in').nth(2).dispatchEvent('change');
  await page.locator('.take-body .field-in').nth(3).fill('letadlo v záběru');
  await page.locator('.take-body .field-in').nth(3).dispatchEvent('change');
  await shot('notes');
  await tap('#list .take-toggle');

  // quick notes: the earlier note is offered on the keyboard bar of the next take
  await tap('[aria-label="Přidat take 2 a otevřít poznámky"]');
  await page.locator('.take-body .field-in').nth(2).focus();
  await shot('quick-notes');
  ok((await page.locator('.take-body .sug-row .sug-chip').allInnerTexts()).includes('sjedeme wild'), 'earlier note offered right under the field');
  const chipBelow = await page.evaluate(() => { const i = document.activeElement, r = i.nextElementSibling; return r?.classList.contains('sug-row') && r.getBoundingClientRect().top >= i.getBoundingClientRect().bottom; });
  ok(chipBelow, 'the chips sit directly below the field being typed in');
  await tap('.sug-row .sug-chip');
  ok(await page.locator('.take-body .field-in').nth(2).inputValue() === 'sjedeme wild', 'tapping it fills the note');
  await page.evaluate(() => document.activeElement.blur());
  await tap('#list .take.open .take-toggle');

  // ----- a row without a take number -----
  await tap('.ghost-note');
  await page.locator('.take-body .field-in').nth(3).fill('ilustrační záběry');
  ok((await page.locator('#list .zblock').first().locator('.take-num').allInnerTexts()).join(',') === 'take 1,take 2,pozn.,take 3', 'note row sits among the takes');

  // ----- swipe to delete, and undo -----
  await tap('#list .take.open .take-toggle');
  await page.evaluate(() => { document.getElementById('list').scrollTop = 0; });
  const row = page.locator('#list .zblock').first().locator('.take:not(.ghost) .take-row').nth(1);
  const box = await row.boundingBox();
  // a short swipe springs back; the wrong direction does nothing
  await page.mouse.move(box.x + 40, box.y + 20); await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 22, { steps: 4 }); await page.mouse.up();
  await page.mouse.move(box.x + 300, box.y + 20); await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 22, { steps: 6 }); await page.mouse.up();
  const takes = () => page.locator('#list .zblock').first().locator('.take:not(.ghost)').count();
  ok(await takes() === 3, 'a short swipe or one to the left keeps the take');
  await page.mouse.move(box.x + 40, box.y + 20); await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 22, { steps: 4 });
  await shot('swipe');
  await page.mouse.move(box.x + 200, box.y + 22, { steps: 4 }); await page.mouse.up();
  ok(await takes() === 2, 'swipe right deletes the take');
  await shot('undo-toast');
  const toast = await page.locator('#toast').boundingBox(), dockBox = await page.locator('.dock').boundingBox();
  ok(toast.y + toast.height <= dockBox.y && toast.y > 844 / 2, 'the message sits just above the + Záběr button');
  await tap('.toast-act');
  ok(await takes() === 3, 'undo brings it back');
  ok((await stored()).projects[0].nds[0].zabery[0].takes[1].zvukNote === 'sjedeme wild', 'with its notes, in its place');

  // ----- swipe a záběr right to delete it, undo -----
  const zcount = () => page.locator('#list .zblock').count();
  const zhead = await page.locator('#z-' + (await stored()).projects[0].nds[0].zabery[3].id + ' .z-head').boundingBox();
  await page.mouse.move(zhead.x + 30, zhead.y + 30); await page.mouse.down();
  await page.mouse.move(zhead.x + 220, zhead.y + 32, { steps: 8 }); await page.mouse.up();
  ok(await zcount() === 3, 'swipe right on a záběr deletes it');
  await tap('.toast-act');
  ok(await zcount() === 4, 'and undo brings it back');

  // ----- number with a letter, and a time -----
  await tap('[aria-label="Záběr 7 | 22, upravit"]');
  await page.fill('[id^="e-s-"]', 'a');
  await page.fill('[id^="e-t-"]', '130');
  await shot('edit');
  const [del, cancel, save] = await Promise.all(['.z-actions .text-btn', '[aria-label="Zrušit úpravu"]', '[aria-label="Uložit"]'].map(sel => page.locator(sel).boundingBox()));
  ok(del.x < cancel.x && cancel.x < save.x && save.x + save.width > 330, 'edit: delete on the left, cancel and save on the right');
  await page.locator('[id^="e-t-"]').press('Enter');
  ok(await page.locator('[aria-label="Záběr 7 | 22A, upravit"]').count() === 1, 'záběr 22A');
  ok((await text('.z-time')) === '1:30', '130 typed is shown as 1:30');
  ok((await text('.map-time')).includes('1:30'), 'day total in the map');

  // ----- cancelled keeps its takes visible; done locks -----
  await tap('[aria-label^="Záběr 5 | 13: otevřeno"]');
  await tap('[aria-label^="Take 1, Režie"]');
  ok((await text('#toast')).includes('hotový'), 'a done záběr explains how to unlock');
  await tap('[aria-label^="Záběr 5 | 13: hotovo"]');
  ok(await page.locator('#list .zblock.cancelled .take').count() === 3, 'a cancelled záběr still shows its takes');
  await shot('cancelled');
  await tap('[aria-label^="Záběr 5 | 13: zrušeno"]');

  // ----- the dock is just + Záběr; reorder -----
  ok(await page.locator('.dock .btn').count() === 1, 'only + Záběr in the dock');
  await tap('[aria-label^="Záběr 7 | 21: otevřeno"]');
  await tap('[aria-label="Možnosti dne"]');
  await shot('day-menu');
  await tap('text=Seřadit záběry');
  const grip = await page.locator('.sort-grip').nth(3).boundingBox();
  await page.mouse.move(grip.x + 20, grip.y + 20); await page.mouse.down();
  await page.mouse.move(grip.x + 20, grip.y - 60, { steps: 6 }); await page.waitForTimeout(100);
  await shot('reorder');
  await page.mouse.move(grip.x + 20, grip.y - 190, { steps: 10 }); await page.waitForTimeout(100);
  await page.mouse.up();
  ok((await page.locator('.sort-num').allInnerTexts()).join(' / ') === '2 | 4 / 5 | 13 / 7 | 21 / 7 | 22A', 'dragged the last záběr to the top');
  await tap('.dock >> text=Hotovo');
  ok((await stored()).projects[0].nds[0].zabery[0].obraz === 2, 'new order is saved');

  // ----- the table -----
  await tap('[aria-label="Možnosti dne"]');
  await tap('text=Export / kopírovat');
  const tsv = (await page.inputValue('#export-ta')).split('\n').map(l => l.split('\t'));
  ok(tsv[0].join('|') === 'OB|ZA|TA|REŽIE|poznámky režie|KAMERA|poznámky kamera|ZVUK|poznámky zvuk|skript poznámky', 'export has your columns');
  ok(tsv[2].join('|') === '5|13|1|P||BEREME||PP|sjedeme wild|letadlo v záběru', 'a take row');
  ok(tsv[4].join('|') === '5|13||||||||ilustrační záběry', 'a note row');
  await shot('export');
  await tap('[aria-label="Zpět"]');

  // ----- Google Drive -----
  await tap('[aria-label="Zpět"]'); await tap('[aria-label="Zpět"]');
  await tap('[aria-label="Nastavení"]');
  await shot('settings');
  await tap('text=Připojit Google Drive');
  await page.fill('.dialog input', code);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.innerText.includes('Vše odesláno'), null, { timeout: 8000 }).catch(() => {});
  await shot('connected');
  const day = sent.find(b => b.action === 'day');
  ok(sent[0]?.action === 'hello' && !!day, 'connecting sends the day straight away');
  ok(day?.project.name === 'Film' && day.day.name === 'ND1' && day.table.rows.length === 6, 'with the project, the day and its table');
  ok(sent.some(b => b.action === 'backup' && JSON.parse(b.json).projects.length === 1), 'and a backup of everything');

  // no signal: changes wait, then go by themselves
  await tap('[aria-label="Zpět"]');
  ok(await page.locator('.sync-ok').count() === 1, 'indicator: all in Drive');
  scriptUp = false; await ctx.setOffline(true);
  await tap('.row-open'); await tap('.row-open');
  await tap('[aria-label="Přidat take 1 a ohodnotit: Zvuk"]');
  await tap('[aria-label^="Zvuk: P-"]');
  ok(await page.locator('.sync-offline').count() === 1, 'offline: indicator says waiting');
  await shot('offline');
  const before = sent.length;
  scriptUp = true; await ctx.setOffline(false);
  await page.waitForFunction(() => document.querySelector('.sync-ok'), null, { timeout: 8000 }).catch(() => {});
  ok(sent.length > before && await page.locator('.sync-ok').count() === 1, 'back online: sent without being asked');

  // finished day: one last send, then locked and left alone
  await tap('[aria-label="Možnosti dne"]'); await tap('text=Dokončit den'); await tap('.dialog .btn-primary');
  await page.waitForFunction(() => document.querySelector('.sync-ok'), null, { timeout: 8000 }).catch(() => {});
  await shot('finished');
  const afterFinish = sent.filter(b => b.action === 'day').length;
  await tap('[aria-label^="Take 1, Zvuk"]');
  ok((await text('#toast')).includes('dokončený'), 'a finished day is locked');
  ok(await page.locator('.take.ghost').count() === 0, 'and offers no new takes');
  await tap('[aria-label="Zpět"]');
  await tap('[aria-label^="Možnosti: ND1"]'); await tap('text=Přejmenovat');
  await page.fill('.dialog input', 'Den 1'); await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  ok(sent.filter(b => b.action === 'day').length === afterFinish, 'its tab is not sent again');

  // ----- nothing gets lost -----
  await page.reload();
  ok(await page.locator('text=Film').count() > 0, 'data is there after a restart');
  await page.evaluate(() => localStorage.removeItem('klapkolist_v2'));
  await page.reload();
  ok(await page.locator('text=Film').count() > 0, 'localStorage cleared by the phone: data comes back from the database');
  ok(!!(await stored())?.projects?.length, 'and is written back to both places');
  await page.evaluate(() => localStorage.setItem('klapkolist_v2', '{"broken'));
  await page.reload();
  ok(await page.locator('text=Film').count() > 0, 'unreadable saved data: the good copy is used');
  await tap('[aria-label^="Možnosti: Film"]'); await tap('text=Smazat'); await tap('.dialog .btn-primary');
  await page.waitForTimeout(300);
  ok(await page.locator('text=Žádný projekt').count() === 1, 'project deleted');
  await tap('[aria-label="Nastavení"]'); await tap('text=Starší verze');
  await shot('history');
  await tap('main .row-link'); await tap('.dialog .btn-primary');
  await page.waitForTimeout(400);
  ok(await page.locator('text=Film').count() > 0, 'and brought back from an earlier version');
  await tap('[aria-label="Nastavení"]'); await tap('text=Obnovit ze zálohy na Drive');
  await tap('.pick-list .row-link'); await tap('.dialog .btn-primary');
  await page.waitForTimeout(400);
  ok(await page.locator('text=Film').count() > 0, 'restore from the Drive backup works');
  await shot('projects');
}catch(e){ console.log('FAIL (stopped) ' + e.message.split('\n').slice(0, 3).join(' ')); failed++; if (out) await page.screenshot({ path: path.join(out, 'zz-stopped.png') }); }

ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close(); server.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
