// The on-screen keyboard: keep the field you tap in the upper part of the screen, so the keyboard
// never has to push the page, and offer earlier entries as one-tap chips right under the field.
// (The iPhone's own bar above the keyboard has the previous / next / done buttons.)
//
// Fields that belong together (a take's notes, a záběr's numbers) sit in one [data-fieldgroup];
// the ones Enter walks through carry data-seq. Enter on the last one fires 'fieldgroupdone' on
// the group: a group that handles it (e.g. saves) calls preventDefault, otherwise the keyboard
// just closes.
import { el } from './dom.js';

const isField = n => n && (n.matches('textarea') || (n.matches('input') && !['button', 'checkbox', 'radio', 'file'].includes(n.type)));

// Earlier entries offered under a field while it has focus.
// suggestField(input, { items: query => [text], onPick: text => … })
const suggesters = new WeakMap();
export function suggestField(input, suggester){ suggesters.set(input, suggester); }
function showSuggestions(inp){
  const s = suggesters.get(inp);
  if (!s) return;
  let row = inp.parentElement.querySelector(':scope > .sug-row');
  const chips = s.items(inp.value).map(x => {
    const b = el('button', { className: 'sug-chip', 'aria-label': `Doplnit: ${x}` }, x);
    // pointerdown + preventDefault: the field keeps focus, so the keyboard stays up
    b.addEventListener('pointerdown', e => e.preventDefault());
    b.addEventListener('mousedown', e => e.preventDefault());
    b.addEventListener('click', () => { s.onPick(x); if (document.contains(inp)) showSuggestions(inp); });
    return b;
  });
  if (!chips.length){ row?.remove(); return; }
  if (!row){ row = el('div', { className: 'sug-row' }); inp.after(row); }
  row.replaceChildren(...chips);
  row.scrollLeft = 0;
}
function hideSuggestions(inp){ inp.parentElement?.querySelector(':scope > .sug-row')?.remove(); }

// Where the keyboard's top edge will be. Once it is open, visualViewport says exactly;
// before it opens, assume an iPhone keyboard with its bar (about 45 % of the screen).
function keyboardTop(){
  const vv = window.visualViewport, H = window.innerHeight;
  if (vv && vv.height < H - 120) return vv.offsetTop + vv.height;
  return H * 0.55;
}
function keepFieldVisible(inp){
  const sc = inp.closest('.scroll');
  if (!sc) return;
  const label = inp.closest('.field')?.querySelector('label');
  const top = (label || inp).getBoundingClientRect().top;
  const sug = inp.parentElement.querySelector(':scope > .sug-row');   // leave room for the chips too
  const bottom = (sug || inp).getBoundingClientRect().bottom;
  const scTop = sc.getBoundingClientRect().top + 6;
  const limit = keyboardTop() - 10;
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

// body.kb-open while a text field has focus: the dock hides, so it never rides up on the keyboard.
function markOpen(on){ document.body.classList.toggle('kb-open', on); }
// Called after every render: a field that was removed can't hold the keyboard any more.
export function syncKbBar(){ if (!isField(document.activeElement)) markOpen(false); }

export function initKeyboard(){
  document.addEventListener('keydown', e => {
    const t = e.target;
    if (e.key !== 'Enter' || !t.dataset?.seq || !isField(t) || t.matches('textarea')) return;
    e.preventDefault();
    goNext(t);
  });
  document.addEventListener('input', e => { if (isField(e.target)) showSuggestions(e.target); });
  let hideTimer = 0;
  document.addEventListener('focusin', e => {
    if (!isField(e.target)) return;
    clearTimeout(hideTimer);
    showSuggestions(e.target);
    keepFieldVisible(e.target);
    markOpen(true);
  });
  document.addEventListener('focusout', e => {
    if (isField(e.target)) hideSuggestions(e.target);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(syncKbBar, 80);   // unless focus moved straight to another field
  });
}
