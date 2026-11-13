// The shooting day: the shot map on top, then every záběr with its takes.
// Changes re-render only the záběr they touch (so the list doesn't jump and the keyboard stays up),
// plus the map and the done count in the header.
import { el, icon, showToast, undoToast, reducedMotion, animateHeight, blurIfInside, focusPending } from '../dom.js';
import { STATUS_LABEL, zState, isLocked, cycleStatus, ndStats, zLabel, zNumber, findZaber, zaberOfTake, compareZ, hasBest,
  addZaberAfterLast, removeZaber, parseTime, formatTime } from '../model.js';
import { data, findDay, save } from '../store.js';
import { navigate, goBack, refresh } from '../nav.js';
import { renderApp, header, openMenu, showDialog, syncButton } from '../ui.js';
import { syncKbBar } from '../keyboard.js';
import { swipeToDelete } from '../swipe.js';
import { sheetUrl, syncNow } from '../sync.js';
import { screenImport } from './import.js';
import { screenExport } from './export.js';
import { screenReorder } from './reorder.js';
import { renderTake, renderGhost } from './take.js';

// What is open on the day screen. Kept across re-renders, reset when another day is opened.
export const view = {
  nd: null,
  openTakeId: null,
  editZId: null,     // záběr whose number is being edited
  rating: null,      // { takeId, dept }: the rating being picked
  propAdd: {}        // takeId -> { step: 'key' } | { step: 'value', key }: a property being added
};
const listScroll = {};  // ndId -> scrollTop, so coming back lands where you left

export function screenDay(projectId, ndId){
  const found = findDay(projectId, ndId);
  if (!found){ goBack(); return; }
  const { nd } = found;
  if (view.nd !== nd) Object.assign(view, { nd, openTakeId: null, editZId: null, rating: null, propAdd: {} });
  const { total, done } = ndStats(nd);
  const some = nd.zabery.length > 0;

  const setFinished = on => {
    if (on) nd.finished = true; else delete nd.finished;
    Object.assign(view, { openTakeId: null, editZId: null, rating: null });
    save(); refresh(); syncNow();
  };
  const finish = () => showDialog('Dokončit den?',
    'Tabulka se do Google Sheets odešle naposledy a potom už ji aplikace nepřepisuje, takže ji můžete upravovat tam. Den se v telefonu zamkne.', [
      { label: 'Zrušit' }, { label: 'Dokončit', cls: 'btn-primary', action: () => setFinished(true) }]);
  const reopen = () => showDialog('Znovu otevřít den?',
    'Den půjde zase upravovat a jeho list v Google Sheets se znovu přepíše podle telefonu. Úpravy udělané v Sheets se ztratí.', [
      { label: 'Zrušit' }, { label: 'Otevřít', cls: 'btn-primary', action: () => setFinished(false) }]);
  const url = sheetUrl(projectId);
  const menu = e => openMenu(e.currentTarget, [
    { label: 'Export / kopírovat', action: () => navigate(screenExport, projectId, ndId) },
    !nd.finished && { label: 'Import ze Sheets', action: () => navigate(screenImport, projectId, ndId) },
    !nd.finished && nd.zabery.length > 1 && { label: 'Seřadit záběry', action: () => navigate(screenReorder, projectId, ndId) },
    url && { label: 'Otevřít Google tabulku', action: () => window.open(url, '_blank') },
    nd.finished ? { label: 'Znovu otevřít den', action: reopen } : { label: 'Dokončit den', action: finish }
  ].filter(Boolean));

  const head = header(nd.name, { back: true, count: `${done}/${total}`, actions: [
    syncButton(),
    el('button', { className: 'icon-btn', 'aria-label': 'Možnosti dne', 'aria-haspopup': 'menu', onClick: menu }, icon('dots'))
  ]});
  const list = el('main', { className: 'scroll' + (some ? '' : ' grain'), id: 'list' });
  if (some){
    list.append(el('section', { className: 'map', id: 'map', 'aria-label': 'Přehled záběrů' }, renderMap(nd)),
      ...nd.zabery.map(renderZBlock));
  } else {
    list.appendChild(el('div', { className: 'empty' },
      el('div', { className: 'display' }, 'Žádný záběr'),
      el('p', null, 'Vložte klapkolist ze Sheets, nebo přidejte první záběr tlačítkem dole.')));
  }

  const dock = nd.finished
    ? el('div', { className: 'dock' },
        el('span', { className: 'dock-note label' }, 'Den je dokončený'),
        el('button', { className: 'btn btn-line', onClick: reopen }, 'Znovu otevřít'))
    : el('div', { className: 'dock' + (some ? '' : ' dock-wrap') },
        some ? null : el('button', { className: 'btn btn-line btn-wide', onClick: () => navigate(screenImport, projectId, ndId) }, 'Import ze Sheets'),
        el('button', { className: 'btn btn-primary btn-grow', onClick: addZaber }, '+ Záběr'));

  renderApp(head, list, dock);
  list.scrollTop = listScroll[ndId] || 0;
  list.addEventListener('scroll', () => { listScroll[ndId] = list.scrollTop; }, { passive: true });
}

// ----- shot map: one row per obraz, sorted by number, so a skipped obraz or záběr shows as a gap -----
function renderMap(nd){
  const obs = [...new Set(nd.zabery.map(z => z.obraz))].sort((a, b) => a - b);
  const { time } = ndStats(nd);
  return el('div', { className: 'map-rows' },
    obs.map(ob => el('div', { className: 'map-row' },
      el('span', { className: 'map-ob tnum' }, '' + ob),
      el('div', { className: 'map-cells' }, nd.zabery.filter(z => z.obraz === ob).sort(compareZ).map(mapCell)))),
    data.settings.times && time ? el('div', { className: 'map-time label tnum' }, `Čas celkem ${formatTime(time)}`) : null);
}
function mapCell(z){
  const st = zState(z), best = st !== 'cancelled' && hasBest(z);
  return el('button', {
    className: 'cell tnum' + (st === 'cancelled' ? ' cancel' : st === 'done' ? ' done' : '') + (best ? ' has-best' : ''),
    'aria-label': `Záběr ${zLabel(z)}${st === 'open' ? '' : ', ' + STATUS_LABEL[st]}${best ? ', má BEREME' : ''}`,
    onClick: () => jumpTo(z)
  }, zNumber(z));
}
function updateStats(){
  const { total, done } = ndStats(view.nd);
  document.getElementById('bar-count').textContent = `${done}/${total}`;
  document.getElementById('map')?.replaceChildren(renderMap(view.nd));
}

function jumpTo(z){
  const list = document.getElementById('list');
  const block = document.getElementById('z-' + z.id);
  if (!list || !block) return;
  list.scrollTo({ top: Math.max(0, block.offsetTop - 4), behavior: reducedMotion() ? 'auto' : 'smooth' });
  const num = block.querySelector('.z-num');
  num.classList.remove('flash'); void num.offsetWidth; num.classList.add('flash');
  clearTimeout(num._t); num._t = setTimeout(() => num.classList.remove('flash'), 1200);
}

// One tap: next number in the same obraz, no dialog. Tap the number to change it.
function addZaber(){
  const z = addZaberAfterLast(view.nd);
  save(); refresh();
  requestAnimationFrame(() => jumpTo(z));
  showToast(`Záběr ${zLabel(z)} přidán — číslo změníte klepnutím na něj`);
}

// ----- re-rendering one záběr -----
export function rerenderZ(z){
  const old = document.getElementById('z-' + z.id);
  if (old){ blurIfInside(old); old.replaceWith(renderZBlock(z)); }
  focusPending();
  syncKbBar();
}
// After changing a záběr or its takes: save, redraw it, update the map and count.
export function commitZ(z){ save(); rerenderZ(z); updateStats(); }

export function locked(z){ return isLocked(view.nd, z); }
// A locked záběr can be read; taps that would change it only explain how to unlock it.
export function guard(z, fn){
  return (...a) => {
    if (!locked(z)) return fn(...a);
    showToast(view.nd.finished ? 'Den je dokončený — znovu ho otevřete v menu ⋯'
      : zState(z) === 'done' ? 'Záběr je hotový — pro úpravy ho odemkněte klepnutím na ✓'
      : 'Záběr je zrušený — pro úpravy ho obnovte klepnutím na ×', { ms: 2600 });
  };
}

function renderZBlock(z){
  const st = zState(z);
  const block = el('section', { className: 'zblock' + (st === 'cancelled' ? ' cancelled' : '') + (locked(z) ? ' locked' : ''), id: 'z-' + z.id, 'aria-label': `Záběr ${zLabel(z)}` });
  if (view.editZId === z.id){
    block.appendChild(renderZEdit(z));
  } else {
    const edit = guard(z, () => { view.editZId = z.id; rerenderZ(z); });
    const head = block.appendChild(el('div', { className: 'z-head' },
      el('button', { className: 'z-num display tnum', 'aria-label': `Záběr ${zLabel(z)}, upravit`, onClick: edit },
        el('span', null, '' + z.obraz), el('span', { className: 'z-sep', 'aria-hidden': 'true' }, '|'), el('span', null, zNumber(z))),
      data.settings.times && z.time != null ? el('button', { className: 'z-time tnum', 'aria-label': `Čas ${formatTime(z.time)}, upravit`, onClick: edit }, formatTime(z.time)) : null,
      el('button', { className: 'z-stat ' + st, 'aria-label': `Záběr ${zLabel(z)}: ${STATUS_LABEL[st]}. Klepnutím změníte stav.`, title: STATUS_LABEL[st],
        onClick: () => view.nd.finished ? guard(z)() : cycleZaber(z) },
        st === 'done' ? icon('tick') : st === 'cancelled' ? icon('cross') : null)));
    block.dataset.del = 'Smazat záběr';
    if (!view.nd.finished) swipeToDelete(head, block, () => deleteZaber(z));
  }
  z.takes.forEach(t => block.appendChild(renderTake(t, z)));
  if (!locked(z)) block.appendChild(renderGhost(z));   // done or cancelled: no new takes
  return block;
}

// Removed at once; the toast offers the way back.
function deleteZaber(z){
  const undo = removeZaber(view.nd, z);
  if (view.editZId === z.id) view.editZId = null;
  save(); refresh();
  undoToast(`Záběr ${zLabel(z)} smazán`, () => { undo(); save(); refresh(); });
}

function cycleZaber(z){
  if (cycleStatus(z) !== 'open'){
    // done or cancelled: nothing stays open for editing
    if (z.takes.some(t => t.id === view.openTakeId)) view.openTakeId = null;
    if (z.takes.some(t => t.id === view.rating?.takeId)) view.rating = null;
    if (view.editZId === z.id) view.editZId = null;
  }
  commitZ(z);
}

// Changing the number (and the time), inline. Enter walks the fields and saves at the end.
function renderZEdit(z){
  const nd = view.nd;
  const field = (id, label, value, attrs) => {
    const input = el('input', { className: 'field-in tnum', id: `${id}-${z.id}`, value, autocomplete: 'off', 'data-seq': '1', ...attrs });
    return { input, box: el('div', { className: 'field' }, el('label', { className: 'label', for: input.id }, label), input) };
  };
  const num = { type: 'text', inputmode: 'numeric', pattern: '[0-9]*' };
  const obraz = field('e-ob', 'Obraz', String(z.obraz), num);
  const zaber = field('e-z', 'Záběr', String(z.zaber), { ...num, 'data-autofocus': true, 'data-select': '1' });
  const suffix = field('e-s', 'Písm.', z.suffix || '', { type: 'text', maxlength: '3', autocapitalize: 'characters', placeholder: 'A', style: 'text-transform:uppercase' });
  const time = data.settings.times ? field('e-t', 'Čas', formatTime(z.time), { ...num, placeholder: 'm:ss' }) : null;

  const close = () => { view.editZId = null; rerenderZ(z); };
  const saveEdit = () => {
    const o = parseInt(obraz.input.value), n = parseInt(zaber.input.value), s = suffix.input.value.trim().toUpperCase();
    if (isNaN(o) || isNaN(n)){ showToast('Vyplňte obraz i záběr číslem'); return; }
    const other = findZaber(nd, o, n, s);
    if (other && other !== z){ showToast(`Záběr ${zLabel({ obraz: o, zaber: n, suffix: s })} už v tomto dni je`); return; }
    if (time){
      const t = parseTime(time.input.value);
      if (t === undefined){ showToast('Čas zadejte jako minuty a sekundy, např. 130 = 1:30'); return; }
      if (t == null) delete z.time; else z.time = t;
    }
    Object.assign(z, { obraz: o, zaber: n, suffix: s });
    view.editZId = null;
    commitZ(z);
  };
  const group = el('div', { className: 'z-edit', 'data-fieldgroup': '' },
    el('div', { className: 'z-fields' }, obraz.box, zaber.box, suffix.box, time?.box),
    el('div', { className: 'z-actions' },
      el('button', { className: 'text-btn', onClick: () => deleteZaber(z) }, icon('trash'), el('span', { className: 'u' }, 'Smazat záběr')),
      el('button', { className: 'sq-btn', 'aria-label': 'Zrušit úpravu', onClick: close }, '×'),
      el('button', { className: 'sq-btn fill', 'aria-label': 'Uložit', onClick: saveEdit }, '✓')));
  group.addEventListener('fieldgroupdone', e => { e.preventDefault(); saveEdit(); });
  group.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  return group;
}

// Open or close a take's notes. The notes fold open and shut (whatever is below glides along),
// and the row you tapped stays where it was. Only when the opened notes would end up below the
// screen does the list glide up to bring the take to the top.
// A tap while one is still moving finishes that one at once, then acts: taps are never lost.
const OPEN_MS = 340, CLOSE_MS = 240;
let queue = Promise.resolve(), waiting = 0;
export function toggleTake(t, z, forceOpen = false){
  waiting++;
  document.querySelectorAll('.take-body').forEach(b => b.getAnimations().forEach(a => a.finish()));
  queue = queue.then(() => { waiting--; return runToggle(t, z, forceOpen); }).catch(() => {});
  return queue;
}
const ms = d => waiting ? 0 : d;     // another tap is already waiting: no time for animating
async function runToggle(t, z, forceOpen){
  const list = document.getElementById('list');
  const prev = view.openTakeId;
  const opening = !(prev === t.id && !forceOpen);
  // whatever is open now folds shut first
  if (prev && !(forceOpen && prev === t.id)){
    const old = document.getElementById('tb-' + prev);
    blurIfInside(old || list);
    await animateHeight(old, false, ms(CLOSE_MS));
  }
  const before = document.querySelector(`#t-${t.id} .take-row`)?.getBoundingClientRect().top;
  view.openTakeId = opening ? t.id : null;
  view.propAdd = {};
  if (prev && prev !== t.id){ const pz = zaberOfTake(view.nd, prev); if (pz && pz !== z) rerenderZ(pz); }
  rerenderZ(z);

  const row = document.querySelector(`#t-${t.id} .take-row`);
  if (before != null) list.scrollTop += row.getBoundingClientRect().top - before;
  const body = opening && document.getElementById('tb-' + t.id);
  if (!body) return;
  const overflow = body.getBoundingClientRect().bottom - list.getBoundingClientRect().bottom;
  const top = list.scrollTop + row.getBoundingClientRect().top - list.getBoundingClientRect().top - 6;
  const unfold = animateHeight(body, true, ms(OPEN_MS));
  if (overflow > 0) list.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' });
  await unfold;
}
