// Screen furniture shared by every screen: the page frame, header bar, dialogs, ⋯ menu, list rows.
import { el, icon, iconBtn, blurIfInside } from './dom.js';
import { syncKbBar } from './keyboard.js';
import { goBack } from './nav.js';

export function renderApp(...nodes){
  const app = document.getElementById('app');
  blurIfInside(app);
  app.replaceChildren(...nodes.filter(Boolean));
  syncKbBar();
}

// opts: { back: bool, count: text next to the title, actions: [buttons] }
export function header(title, opts = {}){
  const row = el('div', { className: 'bar-row' + (opts.back ? '' : ' no-back') },
    opts.back ? iconBtn('back', 'Zpět', goBack) : null,
    el('h1', { className: 'bar-title display' }, title),
    opts.count != null ? el('span', { className: 'bar-count tnum', id: 'bar-count' }, opts.count) : null,
    el('span', { className: 'bar-spacer' }),
    ...(opts.actions || []));
  return el('header', { className: 'bar' }, row);
}

// The scrolling middle of a screen. With no items it shows the empty message on the grain background.
export function scrollArea(items, emptyTitle, emptyText){
  const main = el('main', { className: 'scroll' + (items && !items.length ? ' grain' : '') });
  if (items && !items.length) main.appendChild(el('div', { className: 'empty' },
    el('div', { className: 'display' }, emptyTitle),
    el('p', null, emptyText)));
  return main;
}
export function sectionLabel(text){ return el('div', { className: 'label section-label' }, text); }
export function dock(...buttons){ return el('div', { className: 'dock' }, ...buttons); }
export function primaryButton(label, onClick){ return el('button', { className: 'btn btn-primary btn-grow', onClick }, label); }

// A project or shooting day: the name opens it, ⋯ offers rename and delete.
export function itemRow({ name, side, onOpen, onRename, onDelete }){
  return el('div', { className: 'row-box' },
    el('button', { className: 'row-open', onClick: onOpen },
      el('span', { className: 'row-name' }, name),
      el('span', { className: 'row-side tnum' }, side)),
    el('button', { className: 'row-edit', 'aria-label': `Možnosti: ${name}`, 'aria-haspopup': 'menu', onClick: e => openMenu(e.currentTarget, [
      { label: 'Přejmenovat', action: onRename },
      { label: 'Smazat', action: onDelete }
    ]) }, icon('dots')));
}

// ===== ⋯ menu =====
function openMenu(anchor, items){
  document.querySelector('.menu-overlay')?.remove();
  const overlay = el('div', { className: 'menu-overlay' });
  const menu = el('div', { className: 'menu', role: 'menu' },
    items.map(it => el('button', { className: 'menu-item', role: 'menuitem', onClick: () => { overlay.remove(); it.action(); } }, it.label)));
  overlay.appendChild(menu);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  const r = anchor.getBoundingClientRect();
  menu.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
  const h = menu.offsetHeight;
  menu.style.top = (r.bottom + 4 + h > window.innerHeight - 8 ? r.top - h - 4 : r.bottom + 4) + 'px';
  menu.querySelector('button')?.focus({ preventScroll: true });
}

// ===== dialogs =====
function removeOverlay(o){ if (!o) return; blurIfInside(o); o.remove(); syncKbBar(); }
function closeDialog(){ removeOverlay(document.querySelector('.dialog-overlay')); }
// actions: [{ label, cls?, action?() }]; an action returning false keeps the dialog open.
export function showDialog(title, content, actions){
  closeDialog();
  const overlay = el('div', { className: 'dialog-overlay' });
  const dialog = el('div', { className: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    el('h3', null, title),
    typeof content === 'string' ? el('p', null, content) : content,
    el('div', { className: 'dialog-actions' }, actions.map(a => el('button', {
      className: `btn ${a.cls || 'btn-line'}`,
      onClick: () => { if (a.action && a.action() === false) return; removeOverlay(overlay); }
    }, a.label))));
  overlay.appendChild(dialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) removeOverlay(overlay); });
  document.body.appendChild(overlay);
  const inp = dialog.querySelector('input');
  if (inp){ inp.focus({ preventScroll: true }); if (inp.value) inp.select(); }
}
export function confirmDelete(title, text, onDelete){
  showDialog(title, text, [{ label: 'Zrušit' }, { label: 'Smazat', cls: 'btn-primary', action: onDelete }]);
}
// Asks for one line of text; callback gets it trimmed (possibly empty).
export function promptDialog(title, placeholder, callback, defaultVal = ''){
  const inp = el('input', { type: 'text', className: 'field-in', placeholder, 'aria-label': placeholder, value: defaultVal, autocomplete: 'off' });
  showDialog(title, inp, [
    { label: 'Zrušit' },
    { label: 'OK', cls: 'btn-primary', action: () => callback(inp.value.trim()) }
  ]);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); closeDialog(); callback(inp.value.trim()); } });
}
