// A text field with a dropdown of earlier entries under it (property names and values, notes).
// Tapping a suggestion keeps the field focused, so the keyboard stays up.
import { el } from './dom.js';
import { matchSuggestions } from './util.js';

// → { wrap, input }. options: { suggestions: () => [string], onPick(value), className, ...input attributes }
export function suggestField({ suggestions, onPick, className = '', ...attrs }){
  const input = el('input', { type: 'text', className: 'field-in', autocomplete: 'off', ...attrs });
  const list = el('div', { className: 'ac-list ' + className });
  const hide = () => list.classList.remove('show');
  const update = () => {
    const hits = matchSuggestions(suggestions(), input.value);
    list.replaceChildren(...hits.map(x => {
      const b = el('button', { className: 'ac-item', 'aria-label': `Doplnit: ${x}` }, x);
      // pointer/mouse down: preventDefault so the field keeps focus and the keyboard stays up.
      // The pick happens on click, after the tap has finished, so the list closing can't let the
      // same tap land on whatever is underneath it.
      b.addEventListener('pointerdown', e => e.preventDefault());
      b.addEventListener('mousedown', e => e.preventDefault());
      b.addEventListener('click', () => { hide(); onPick(x); });
      return b;
    }));
    list.classList.toggle('show', hits.length > 0);
  };
  input.addEventListener('focus', update);
  input.addEventListener('input', update);
  input.addEventListener('blur', hide);
  return { wrap: el('div', { className: 'ac' }, input, list), input };
}
