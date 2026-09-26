// The shooting day: the shot map on top, then every záběr with its takes.
// Changes re-render only the záběr they touch (so the list doesn't jump and the keyboard stays up),
// plus the map and the done count in the header.
import { el, icon, iconBtn, showToast, reducedMotion, blurIfInside, focusPending } from '../dom.js';
import { safeName, plural } from '../util.js';
import { DEPTS, STATUS_LABEL, zState, isLocked, cycleStatus, ndStats, zLabel, findZaber, zaberOfTake, addZaberAfterLast } from '../model.js';
import { data, findDay, save, starsOn } from '../store.js';
import { navigate, goBack, refresh } from '../nav.js';
import { renderApp, header, confirmDelete } from '../ui.js';
import { syncKbBar } from '../keyboard.js';
import { saveFile } from '../files.js';
import { screenImport } from './import.js';
import { screenExport } from './export.js';
import { renderTake, renderGhost, noteInputId } from './take.js';

// What is open on the day screen. Kept across re-renders, reset when another day is opened.
export const view = {
  nd: null,
  openTakeId: null,
  editZId: null,     // záběr whose number is being edited
  propAdd: {}        // takeId -> { step: 'key' } | { step: 'value', key }: a property being added
};
const listScroll = {};  // ndId -> scrollTop, so coming back lands where you left

export function screenDay(projectId, ndId){
  const found = findDay(projectId, ndId);
  if (!found){ goBack(); return; }
  const { proj, nd } = found;
  if (view.nd !== nd) Object.assign(view, { nd, openTakeId: null, editZId: null, propAdd: {} });
  const { total, done } = ndStats(nd);

  const head = header(nd.name, { back: true, count: `${done}/${total}`, actions: [
    iconBtn('share', 'Export', () => navigate(screenExport, projectId, ndId))
  ]});
  const list = el('main', { className: 'scroll' + (nd.zabery.length ? '' : ' grain'), id: 'list' });
  if (nd.zabery.length){
    list.append(el('section', { className: 'map', id: 'map', 'aria-label': 'Přehled záběrů' }, renderMap(nd)),
      ...nd.zabery.map(renderZBlock));
  } else {
    list.appendChild(el('div', { className: 'empty' },
      el('div', { className: 'display' }, 'Žádný záběr'),
      el('p', null, 'Vložte klapkolist ze Sheets, nebo přidejte první záběr tlačítkem dole.')));
  }

  const backup = () => {
    const d = new Date().toISOString().slice(0, 10);
    saveFile(`klapkolist_${safeName(proj.name)}_${safeName(nd.name)}_${d}.json`, JSON.stringify(data, null, 2), 'application/json');
  };
  const dock = el('div', { className: 'dock' + (nd.zabery.length ? '' : ' dock-wrap') },
    nd.zabery.length ? null : el('button', { className: 'btn btn-line btn-wide', onClick: () => navigate(screenImport, projectId, ndId) }, 'Import ze Sheets'),
    el('button', { className: 'btn btn-line btn-sq', 'aria-label': 'Uložit zálohu (JSON)', title: 'Uložit zálohu (JSON)', onClick: backup }, icon('import')),
    el('button', { className: 'btn btn-primary btn-grow', onClick: addZaber }, '+ Záběr'));

  renderApp(head, list, dock);
  list.scrollTop = listScroll[ndId] || 0;
  list.addEventListener('scroll', () => { listScroll[ndId] = list.scrollTop; }, { passive: true });
}

// ----- shot map: one row per obraz, sorted by number, so a skipped obraz or záběr shows as a gap -----
function renderMap(nd){
  const obs = [...new Set(nd.zabery.map(z => z.obraz))].sort((a, b) => a - b);
  return el('div', { className: 'map-rows' }, obs.map(ob => el('div', { className: 'map-row' },
    el('span', { className: 'map-ob tnum' }, '' + ob),
    el('div', { className: 'map-cells' }, nd.zabery.filter(z => z.obraz === ob).sort((a, b) => a.zaber - b.zaber).map(mapCell)))));
}
function mapCell(z){
  const st = zState(z), star = st !== 'cancelled' && starsOn() && z.takes.some(t => t.star);
  return el('button', {
    className: 'cell tnum' + (st === 'cancelled' ? ' cancel' : st === 'done' ? ' done' : '') + (star ? ' has-star' : ''),
    'aria-label': `Záběr ${zLabel(z)}${st === 'open' ? '' : ', ' + STATUS_LABEL[st]}${star ? ', má hvězdu' : ''}`,
    onClick: () => jumpTo(z)
  }, '' + z.zaber);
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

// A done záběr is locked: taps that would change it only explain how to unlock it.
export function guard(z, fn){
  return (...a) => isLocked(z) ? showToast('Záběr je hotový — pro úpravy ho odemkněte klepnutím na ✓', 2600) : fn(...a);
}

function renderZBlock(z){
  const st = zState(z);
  const block = el('section', { className: 'zblock' + (st === 'cancelled' ? ' cancelled' : '') + (isLocked(z) ? ' locked' : ''), id: 'z-' + z.id, 'aria-label': `Záběr ${zLabel(z)}` });
  if (view.editZId === z.id){
    block.appendChild(renderZEdit(z));
  } else {
    block.appendChild(el('div', { className: 'z-head' },
      el('button', { className: 'z-num display tnum', 'aria-label': `Záběr ${zLabel(z)}, upravit číslo`, onClick: guard(z, () => { view.editZId = z.id; rerenderZ(z); }) },
        el('span', null, '' + z.obraz), el('span', { className: 'z-sep', 'aria-hidden': 'true' }, '|'), el('span', null, '' + z.zaber)),
      el('button', { className: 'z-stat ' + st, 'aria-label': `Záběr ${zLabel(z)}: ${STATUS_LABEL[st]}. Klepnutím změníte stav.`, title: STATUS_LABEL[st], onClick: () => cycleZaber(z) },
        st === 'done' ? icon('tick') : st === 'cancelled' ? icon('cross') : null)));
  }
  if (st === 'cancelled') return block;   // a cancelled záběr shows only its struck-through number
  z.takes.forEach(t => block.appendChild(renderTake(t, z)));
  if (!isLocked(z)) block.appendChild(renderGhost(z));   // done: no new takes
  return block;
}

function cycleZaber(z){
  if (cycleStatus(z) !== 'open'){
    // done or cancelled: nothing stays open for editing
    if (z.takes.some(t => t.id === view.openTakeId)) view.openTakeId = null;
    if (view.editZId === z.id) view.editZId = null;
  }
  commitZ(z);
}

// Changing the numbers, inline. Enter walks obraz → záběr → save.
function renderZEdit(z){
  const nd = view.nd;
  const num = (id, value) => el('input', { type: 'number', inputmode: 'numeric', className: 'field-in tnum', id, value: String(value), 'data-seq': '1' });
  const i1 = num('e-ob-' + z.id, z.obraz), i2 = num('e-z-' + z.id, z.zaber);
  i2.setAttribute('data-autofocus', ''); i2.dataset.select = '1';
  const close = () => { view.editZId = null; rerenderZ(z); };
  const saveNumber = () => {
    const obraz = parseInt(i1.value), zaber = parseInt(i2.value);
    if (isNaN(obraz) || isNaN(zaber)){ showToast('Vyplňte obraz i záběr číslem'); return; }
    const other = findZaber(nd, obraz, zaber);
    if (other && other !== z){ showToast(`Záběr ${obraz} | ${zaber} už v tomto dni je`); return; }
    z.obraz = obraz; z.zaber = zaber; view.editZId = null;
    commitZ(z);
  };
  const remove = () => {
    const doDelete = () => {
      nd.zabery = nd.zabery.filter(x => x !== z);
      view.editZId = null; save(); refresh(); showToast(`Záběr ${zLabel(z)} smazán`);
    };
    const n = z.takes.length;
    if (n) confirmDelete('Smazat záběr?', `Záběr ${zLabel(z)} má ${n} ${plural(n, 'take', 'taky', 'taků')}. Smažou se i s poznámkami.`, doDelete);
    else doDelete();
  };
  const group = el('div', { className: 'z-edit', 'data-fieldgroup': '' },
    el('div', { className: 'field' }, el('label', { className: 'label', for: i1.id }, 'Obraz'), i1),
    el('div', { className: 'field' }, el('label', { className: 'label', for: i2.id }, 'Záběr'), i2),
    el('div', { className: 'actions' },
      el('button', { className: 'sq-btn fill', 'aria-label': 'Uložit číslo', onClick: saveNumber }, '✓'),
      el('button', { className: 'sq-btn', 'aria-label': 'Zrušit úpravu', onClick: close }, '×')),
    el('button', { className: 'text-btn', onClick: remove }, icon('trash'), el('span', { className: 'u' }, 'Smazat záběr')));
  group.addEventListener('fieldgroupdone', e => { e.preventDefault(); saveNumber(); });
  group.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  return group;
}

// Open or close a take's notes. Opening brings the take to the top of the list, so its fields are
// ready above the keyboard; closing keeps the row exactly where it was.
export function toggleTake(t, z, forceOpen = false){
  const list = document.getElementById('list');
  const before = document.querySelector(`#t-${t.id} .take-row`)?.getBoundingClientRect().top;
  const prev = view.openTakeId;
  view.openTakeId = prev === t.id && !forceOpen ? null : t.id;
  view.propAdd = {};
  const opening = view.openTakeId === t.id && !isLocked(z);

  if (prev && prev !== t.id){ const pz = zaberOfTake(view.nd, prev); if (pz && pz !== z) rerenderZ(pz); }   // close the previous take
  const old = document.getElementById('z-' + z.id);
  blurIfInside(old);
  old.replaceWith(renderZBlock(z));

  const rowAfter = document.querySelector(`#t-${t.id} .take-row`);
  if (opening){
    // instant, before the focus below, so the keyboard doesn't have to push the page
    list.scrollTop += rowAfter.getBoundingClientRect().top - list.getBoundingClientRect().top - 6;
    document.getElementById(noteInputId(t, DEPTS[0]))?.focus({ preventScroll: true });
  } else if (before != null){
    list.scrollTop += rowAfter.getBoundingClientRect().top - before;
  }
  syncKbBar();
}
