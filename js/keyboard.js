// The on-screen keyboard: keep the field you tap in the upper part of the screen, so the keyboard
// never has to push the page, and give the keyboard a bar with "next" and "hide" buttons.
//
// Fields that belong together (a take's notes, a záběr's numbers) sit in one [data-fieldgroup];
// the ones Enter / "Další" walks through carry data-seq. Enter on the last one fires
// 'fieldgroupdone' on the group: a group that handles it (e.g. saves) calls preventDefault,
// otherwise the keyboard just closes.
import { el, icon } from './dom.js';

const BAR_H = 44;
const isField = n => n && (n.matches('textarea') || (n.matches('input') && !['button', 'checkbox', 'radio', 'file'].includes(n.type)));
const bar = () => document.getElementById('kbbar');

// Where the keyboard's top edge will be. Once it is open, visualViewport says exactly;
// before it opens, assume an iPhone keyboard with the suggestion row (about 42 % of the screen).
function keyboardTop(){
  const vv = window.visualViewport, H = window.innerHeight;
  if (vv && vv.height < H - 120) return vv.offsetTop + vv.height;
  return H * 0.58;
}
function keepFieldVisible(inp){
  const sc = inp.closest('.scroll');
  if (!sc) return;
  const label = inp.closest('.field')?.querySelector('label');
  const top = (label || inp).getBoundingClientRect().top;
  const sug = inp.parentElement.querySelector('.ac-list.show');   // leave room for its suggestions too
  const bottom = (sug || inp).getBoundingClientRect().bottom;
  const scTop = sc.getBoundingClientRect().top + 6;
  const limit = keyboardTop() - BAR_H - 10;       // keyboard bar + a little air
  if (top >= scTop && bottom <= limit) return;     // already visible above the keyboard: don't move
  // otherwise move as little as possible: just enough to clear the keyboard, never above the top
  sc.scrollTop += top < scTop ? top - scTop : Math.min(bottom - limit, top - scTop);
}

function nextField(inp){
  const grp = inp.closest('[data-fieldgroup]');
  if (!grp || !inp.dataset.seq) return null;
  const all = [...grp.querySelectorAll('input[data-seq]')];
  return all[all.indexOf(inp) + 1] || null;
}
function goNext(inp){
  const n = nextField(inp);
  if (n){ n.focus({ preventScroll: true }); if (n.type === 'number') n.select(); return; }
  const grp = inp.closest('[data-fieldgroup]');
  if (!grp || grp.dispatchEvent(new Event('fieldgroupdone', { cancelable: true }))) inp.blur();
}

// Keep the bar right on top of the keyboard.
function placeKbBar(){
  const b = bar(), vv = window.visualViewport;
  if (b.hidden) return;
  const shift = vv ? (vv.offsetTop + vv.height - window.innerHeight) : 0;
  b.style.transform = `translateY(${Math.min(0, shift)}px)`;
}
// e.g. "4 | 18 · take 2 · Z · Zvuk", so you still know where you are once the row has scrolled away
function fieldLabel(inp){
  const own = inp.closest('.field')?.querySelector('label')?.textContent || inp.getAttribute('aria-label') || '';
  const z = inp.closest('.zblock')?.getAttribute('aria-label')?.replace('Záběr ', '');
  const t = inp.closest('.take')?.querySelector('.take-num')?.textContent;
  return [z, t, own].filter(Boolean).join(' · ');
}
function showBar(on){
  bar().hidden = !on;
  document.body.classList.toggle('kb-open', on);
}
// Hide the keyboard bar whenever no text field has focus (also called after every render).
export function syncKbBar(){ if (!isField(document.activeElement)) showBar(false); }

export function initKeyboard(){
  const next = el('button', { className: 'kb-hide', id: 'kb-next', 'aria-label': 'Další pole' }, 'Další', icon('chev'));
  const hide = el('button', { className: 'kb-hide', 'aria-label': 'Skrýt klávesnici' }, 'Skrýt', icon('kbdown'));
  // pointerdown + preventDefault, so the tap doesn't move focus somewhere else first
  next.addEventListener('pointerdown', e => { e.preventDefault(); if (isField(document.activeElement)) goNext(document.activeElement); });
  hide.addEventListener('pointerdown', e => { e.preventDefault(); document.activeElement?.blur(); });
  hide.addEventListener('click', () => document.activeElement?.blur());
  bar().append(next, hide);

  document.addEventListener('keydown', e => {
    const t = e.target;
    if (e.key !== 'Enter' || !t.dataset?.seq || !isField(t) || t.matches('textarea')) return;
    e.preventDefault();
    goNext(t);
  });
  let hideTimer = 0;
  document.addEventListener('focusin', e => {
    if (!isField(e.target)) return;
    clearTimeout(hideTimer);
    keepFieldVisible(e.target);
    next.hidden = !nextField(e.target);
    document.getElementById('kb-lbl').textContent = fieldLabel(e.target);
    showBar(true);
    placeKbBar();
    setTimeout(placeKbBar, 350);   // after the keyboard animation
  });
  document.addEventListener('focusout', () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(syncKbBar, 80);   // unless focus moved straight to another field
  });
  window.visualViewport?.addEventListener('resize', placeKbBar);
  window.visualViewport?.addEventListener('scroll', placeKbBar);
}
