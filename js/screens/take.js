// One take row (star, R/K/Z sign-off chips) and, when open, its notes and properties.
import { el, icon } from '../dom.js';
import { DEPTS, hasNote, takeHasData, isLocked, setStar, addTake, nextTakeNumber, zLabel, addToDict, dictValues, rememberNote } from '../model.js';
import { data, save, starsOn } from '../store.js';
import { confirmDelete } from '../ui.js';
import { suggestField } from '../suggest.js';
import { view, rerenderZ, commitZ, guard, toggleTake } from './day.js';

export const noteInputId = (t, d) => `n-${t.id}-${d.note}`;

export function renderTake(t, z){
  const open = view.openTakeId === t.id;
  const row = el('div', { className: 'take-row' },
    starsOn() ? el('button', {
      className: 'star' + (t.star ? ' on' : ''), 'aria-pressed': t.star ? 'true' : 'false',
      'aria-label': t.star ? `Take ${t.number}: zrušit hvězdu` : `Take ${t.number}: označit jako nejlepší`,
      onClick: guard(z, () => { setStar(z, t, !t.star); commitZ(z); })
    }, icon('star')) : null,
    el('button', {
      className: 'take-toggle', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': 'tb-' + t.id,
      onClick: () => toggleTake(t, z)   // also on a locked záběr: notes can be read, not changed
    }, el('span', { className: 'take-num tnum' }, `take ${t.number}`), icon('chev', 'chev')),
    el('div', { className: 'chips' }, DEPTS.map(d => el('button', {
      className: 'chip' + (t[d.key] ? ' on' : '') + (hasNote(t, d) ? ' note' : ''), id: `chip-${t.id}-${d.key}`, 'aria-pressed': t[d.key] ? 'true' : 'false',
      'aria-label': `Take ${t.number}, ${d.name}: ${t[d.key] ? 'schváleno' : 'neschváleno'}${hasNote(t, d) ? ', má poznámku' : ''}`,
      onClick: guard(z, () => { t[d.key] = !t[d.key]; commitZ(z); })
    }, d.letter))));
  return el('div', { className: 'take' + (open ? ' open' : ''), id: 't-' + t.id }, row,
    open ? (isLocked(z) ? renderBodyReadOnly(t) : renderBody(t, z)) : null);
}

// The next take, always waiting at the bottom of a záběr. Tapping anything on it makes it real.
export function renderGhost(z){
  const n = nextTakeNumber(z);
  const make = (patch, openIt) => {
    const t = addTake(z, patch);
    commitZ(z);
    if (openIt) toggleTake(t, z, true);
  };
  const row = el('div', { className: 'take-row' },
    starsOn() ? el('button', { className: 'star', 'aria-label': `Přidat take ${n} jako nejlepší`, onClick: () => make({ star: true }) }, icon('star')) : null,
    el('button', { className: 'take-toggle', 'aria-label': `Přidat take ${n} a otevřít poznámky`, onClick: () => make({}, true) },
      el('span', { className: 'take-num tnum' }, `take ${n}`)),
    el('div', { className: 'chips' }, DEPTS.map(d =>
      el('button', { className: 'chip', 'aria-label': `Přidat take ${n} se schválením ${d.name}`, onClick: () => make({ [d.key]: true }) }, d.letter))));
  return el('div', { className: 'take ghost' }, row);
}

const deptLabel = d => `${d.letter} · ${d.name}`;

function renderBodyReadOnly(t){
  return el('div', { className: 'take-body ro', id: 'tb-' + t.id },
    DEPTS.map(d => el('div', { className: 'field' },
      el('span', { className: 'label' }, deptLabel(d)),
      el('p', { className: 'ro-text' + (t[d.note] ? '' : ' none') }, t[d.note] || '—'))),
    t.properties.length ? el('div', { className: 'props' }, el('div', { className: 'label' }, 'Vlastnosti'),
      el('div', { className: 'pills' }, t.properties.map(p => el('span', { className: 'pill ro' }, el('span', { className: 'pill-k' }, p.key), el('b', null, p.value))))) : null);
}

function renderBody(t, z){
  const remove = () => {
    const doDelete = () => { z.takes = z.takes.filter(x => x !== t); view.openTakeId = null; commitZ(z); };
    if (takeHasData(t)) confirmDelete('Smazat take?', `Take ${t.number} v záběru ${zLabel(z)} má vyplněné údaje.`, doDelete);
    else doDelete();
  };
  return el('div', { className: 'take-body', id: 'tb-' + t.id, 'data-fieldgroup': '' },
    DEPTS.map((d, i) => noteField(t, d, i === DEPTS.length - 1)),
    el('div', { className: 'props' },
      el('div', { className: 'label' }, 'Vlastnosti'),
      t.properties.length ? el('div', { className: 'pills' }, t.properties.map((p, i) => el('span', { className: 'pill' },
        el('span', { className: 'pill-k' }, p.key), el('b', null, p.value),
        el('button', { className: 'pill-x', 'aria-label': `Odebrat ${p.key}`, onClick: () => { t.properties.splice(i, 1); commitZ(z); } }, '×')))) : null,
      propertyAdder(t, z)),
    el('button', { className: 'text-btn', onClick: remove }, icon('trash'), el('span', { className: 'u' }, 'Smazat take')));
}

// A department's note. Saved on every keystroke; earlier notes of the same department are offered under it.
function noteField(t, d, last){
  const remember = v => { if (rememberNote(data.noteHistory, d.key, v)) save(); };
  const setNote = () => {
    t[d.note] = input.value; save();
    document.getElementById(`chip-${t.id}-${d.key}`)?.classList.toggle('note', hasNote(t, d));
  };
  const { wrap, input } = suggestField({
    id: noteInputId(t, d), className: 'note-sug', placeholder: 'Poznámka', value: t[d.note] || '',
    autocorrect: 'off', enterkeyhint: last ? 'done' : 'next', 'data-seq': '1',
    suggestions: () => data.noteHistory[d.key],
    onPick: x => {
      input.value = x; setNote(); remember(x);
      if (document.activeElement !== input) input.focus({ preventScroll: true });
    }
  });
  input.addEventListener('input', setNote);
  input.addEventListener('change', () => remember(input.value));
  return el('div', { className: 'field' }, el('label', { className: 'label', for: input.id }, deptLabel(d)), wrap);
}

// "+ Vlastnost", then the name, then its value; both offer what was used before.
function propertyAdder(t, z){
  const ps = view.propAdd[t.id];
  if (!ps) return el('button', { className: 'text-btn', onClick: () => { view.propAdd[t.id] = { step: 'key' }; rerenderZ(z); } }, el('span', { className: 'u' }, '+ Vlastnost'));
  const naming = ps.step === 'key';
  const placeholder = naming ? 'Název, např. objektiv' : `${ps.key}: hodnota`;
  const cancel = () => { delete view.propAdd[t.id]; rerenderZ(z); };
  const confirm = value => {
    const v = value.trim();
    if (!v) return;
    if (naming){ view.propAdd[t.id] = { step: 'value', key: v }; rerenderZ(z); return; }
    t.properties.push({ key: ps.key, value: v });
    addToDict(data.dictionary, ps.key, v);
    delete view.propAdd[t.id];
    commitZ(z);
  };
  const { wrap, input } = suggestField({
    placeholder, 'aria-label': placeholder, enterkeyhint: 'done', 'data-autofocus': true,
    suggestions: () => naming ? Object.keys(data.dictionary) : dictValues(data.dictionary, ps.key),
    onPick: confirm
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter'){ e.preventDefault(); confirm(input.value); }
    if (e.key === 'Escape') cancel();
  });
  return el('div', { className: 'prop-add' }, wrap,
    el('button', { className: 'sq-btn fill', 'aria-label': 'Potvrdit', onClick: () => confirm(input.value) }, '✓'),
    el('button', { className: 'sq-btn', 'aria-label': 'Zrušit', onClick: cancel }, '×'));
}
