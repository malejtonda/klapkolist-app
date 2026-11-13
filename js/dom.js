// Building blocks for the page: element builder, icons, toast, focus helpers.

// el('button', { className, onClick, 'aria-label': … }, ...children). Text children are safe (never parsed as HTML).
export function el(tag, attrs, ...children){
  const e = document.createElement(tag);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => {
    if (v == null || v === false) return;
    if (k === 'className') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') e.value = v;
    else e.setAttribute(k, v === true ? '' : v);
  });
  children.flat().forEach(c => {
    if (c == null || c === false) return;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return e;
}

const ICONS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  settings: '<path d="M4 7h9M18 7h2M4 17h3M12 17h8"/><rect x="13" y="5" width="5" height="4"/><rect x="7" y="15" width="5" height="4"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  tick: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  cross: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  dots: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  grip: '<path d="M5 8h14M5 12h14M5 16h14"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"/>',
  cloudOk: '<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"/><path d="M9 13l2.2 2.2L15 11.5"/>',
  cloudUp: '<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"/><path d="M12 16v-5M9.8 13l2.2-2.2 2.2 2.2"/>',
  cloudOff: '<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"/><path d="M4 4l16 17"/>',
};
export function icon(name, cls = ''){
  const s = el('span', { className: 'ico ' + cls, 'aria-hidden': 'true' });
  s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="square" stroke-linejoin="miter">${ICONS[name]}</svg>`;
  return s;
}
export function iconBtn(name, label, onClick){ return el('button', { className: 'icon-btn', 'aria-label': label, title: label, onClick }, icon(name)); }

// A short message at the top. With an action (e.g. undo) it stays longer and can be tapped.
export function showToast(msg, { ms = 2200, action = null } = {}){
  const t = document.getElementById('toast');
  t.replaceChildren(el('span', null, msg));
  if (action) t.appendChild(el('button', { className: 'toast-act', onClick: () => { t.classList.remove('show', 'has-act'); action.run(); } }, action.label));
  t.classList.add('show');
  t.classList.toggle('has-act', !!action);
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show', 'has-act'), action ? Math.max(ms, 6000) : ms);
}
// "Deleted — Vrátit": the way back after a destructive tap, instead of asking beforehand.
export function undoToast(msg, undo){ showToast(msg, { action: { label: 'Vrátit', run: undo } }); }

export function reducedMotion(){ return matchMedia('(prefers-reduced-motion: reduce)').matches; }

// Before a node is removed from the page, move focus out of it, so the keyboard closes cleanly.
export function blurIfInside(node){ const a = document.activeElement; if (a && a !== document.body && node.contains(a)) a.blur(); }

// Elements rendered with data-autofocus get focus right after they are in the page.
// It has to happen inside the tap itself, or iOS won't open the keyboard.
export function focusPending(){
  const f = document.querySelector('[data-autofocus]');
  if (!f) return;
  f.removeAttribute('data-autofocus');
  f.focus({ preventScroll: true });
  if (f.dataset.select) f.select();
}
