import { el, icon } from '../dom.js';
import { zLabel, zState, STATUS_LABEL, moveZaber } from '../model.js';
import { plural } from '../util.js';
import { findDay, save } from '../store.js';
import { goBack } from '../nav.js';
import { renderApp, header, scrollArea, dock, primaryButton } from '../ui.js';

// The day's záběry as short rows to drag into the order they were shot (which is the order in the sheet).
export function screenReorder(projectId, ndId){
  const found = findDay(projectId, ndId);
  if (!found){ goBack(); return; }
  const { nd } = found;
  const content = scrollArea(null);
  content.appendChild(el('p', { className: 'hint' }, 'Podržte ☰ a přetáhněte záběr jinam. V tomhle pořadí budou i v tabulce.'));
  const list = el('div', { className: 'sort-list' }, nd.zabery.map(z => {
    const n = z.takes.length, st = zState(z);
    const handle = el('span', { className: 'sort-grip', 'aria-hidden': 'true' }, icon('grip'));
    const row = el('div', { className: 'sort-row' + (st === 'open' ? '' : ' ' + st) }, handle,
      el('span', { className: 'sort-num display tnum' }, zLabel(z)),
      el('span', { className: 'row-meta' }, `${n} ${plural(n, 'take', 'taky', 'taků')}${st === 'open' ? '' : ' · ' + STATUS_LABEL[st]}`));
    row.dataset.id = z.id;
    dragToSort(row, handle, content, () => {
      moveZaber(nd, nd.zabery.indexOf(z), [...list.children].indexOf(row));
      save();
    });
    return row;
  }));
  content.appendChild(list);
  renderApp(header('Pořadí', { back: true, count: nd.name }), content, dock(primaryButton('Hotovo', goBack)));
}

// Drag a row by its handle; the other rows make room as it passes them.
function dragToSort(row, handle, scroller, onDrop){
  let id = null, startY = 0, lastY = 0, raf = 0;
  const follow = () => {
    // near the top or bottom edge, scroll the list under the finger
    const box = scroller.getBoundingClientRect();
    const edge = lastY < box.top + 60 ? -8 : lastY > box.bottom - 60 ? 8 : 0;
    if (edge){ const before = scroller.scrollTop; scroller.scrollTop += edge; startY -= scroller.scrollTop - before; }
    const prev = row.previousElementSibling, next = row.nextElementSibling;
    const mid = r => { const b = r.getBoundingClientRect(); return b.top + b.height / 2; };
    if (prev && lastY < mid(prev)){ startY -= prev.offsetHeight + 8; prev.before(row); }
    else if (next && lastY > mid(next)){ startY += next.offsetHeight + 8; next.after(row); }
    row.style.transform = `translateY(${lastY - startY}px)`;
    raf = requestAnimationFrame(follow);
  };
  handle.addEventListener('pointerdown', e => {
    id = e.pointerId; startY = lastY = e.clientY;
    handle.setPointerCapture(id);
    row.classList.add('dragging');
    raf = requestAnimationFrame(follow);
    e.preventDefault();
  });
  handle.addEventListener('pointermove', e => { if (e.pointerId === id) lastY = e.clientY; });
  const end = e => {
    if (e.pointerId !== id) return;
    id = null;
    cancelAnimationFrame(raf);
    row.classList.remove('dragging');
    row.style.transform = '';
    onDrop();
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}
