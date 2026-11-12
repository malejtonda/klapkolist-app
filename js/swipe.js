// Swipe a row left to delete it. The row follows the finger; let go past the threshold and it goes.
const THRESHOLD = 96;

export function swipeToDelete(row, onDelete){
  let startX = 0, startY = 0, dx = 0, swiping = false, id = null;
  const end = commit => {
    if (id == null) return;
    id = null;
    row.parentElement?.classList.remove('swiping', 'will-delete');
    row.style.transform = '';
    if (!swiping) return;
    swiping = false;
    // the tap that ends a swipe must not also press the button under the finger
    row.addEventListener('click', stop, true);
    setTimeout(() => row.removeEventListener('click', stop, true), 50);
    if (commit && dx < -THRESHOLD) onDelete();
  };
  const stop = e => { e.stopPropagation(); e.preventDefault(); };
  row.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    id = e.pointerId; startX = e.clientX; startY = e.clientY; dx = 0; swiping = false;
  });
  row.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    dx = Math.min(0, e.clientX - startX);
    if (!swiping){
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(e.clientY - startY) * 1.5) return;
      swiping = true;
      row.setPointerCapture(id);
      row.parentElement.classList.add('swiping');
    }
    row.style.transform = `translateX(${dx}px)`;
    row.parentElement.classList.toggle('will-delete', dx < -THRESHOLD);
  });
  row.addEventListener('pointerup', e => { if (e.pointerId === id) end(true); });
  row.addEventListener('pointercancel', e => { if (e.pointerId === id) end(false); });
}
