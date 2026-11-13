// One take row (its number and the R/K/Z rating chips) and, when open, its notes and properties.
import { el, icon, undoToast } from '../dom.js';
import { DEPTS, NOTES, RATINGS, ratingOf, hasNote, takeLabel, addTake, addNoteRow, removeTake, nextTakeNumber,
  addToDict, dictValues, rememberNote, noteSuggestions } from '../model.js';
import { matchSuggestions } from '../util.js';
import { data, save } from '../store.js';
import { suggestField } from '../keyboard.js';
import { swipeToDelete } from '../swipe.js';
import { view, rerenderZ, commitZ, guard, locked, toggleTake } from './day.js';

const SKRIPT = NOTES[NOTES.length - 1];
const noteLabel = n => `${n.letter} · ${n.name}`;
const rated = (t, d) => ratingOf(t[d.key]);

function chip(t, d, attrs){
  const r = t && rated(t, d);
  return el('button', {
    className: 'chip' + (r ? ` r-${RATINGS.indexOf(r)}` : '') + (t && hasNote(t, d) ? ' note' : ''),
    ...attrs
  }, r ? r.short : d.letter);
}

export function renderTake(t, z){
  const open = view.openTakeId === t.id;
  const picking = view.rating?.takeId === t.id ? view.rating.dept : null;
  const name = t.number == null ? 'Poznámka' : `Take ${t.number}`;
  const row = el('div', { className: 'take-row' },
    el('button', {
      className: 'take-toggle', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': 'tb-' + t.id,
      onClick: () => toggleTake(t, z)   // also on a locked záběr: notes can be read, not changed
    },
      el('span', { className: 'take-num tnum' + (t.number == null ? ' loose' : '') }, takeLabel(t)),
      hasNote(t, SKRIPT) ? el('span', { className: 'take-s', title: 'Má poznámku skriptu' }, 'S') : null,
      icon('chev', 'chev')),
    el('div', { className: 'chips' }, DEPTS.map(d => chip(t, d, {
      id: `chip-${t.id}-${d.key}`, 'aria-expanded': picking === d.key ? 'true' : 'false',
      'aria-label': `${name}, ${d.name}: ${rated(t, d)?.name || 'nehodnoceno'}${hasNote(t, d) ? ', má poznámku' : ''}`,
      onClick: guard(z, () => { view.rating = picking === d.key ? null : { takeId: t.id, dept: d.key }; rerenderZ(z); })
    }))));
  if (!locked(z)) swipeToDelete(row, () => deleteTake(t, z));
  return el('div', { className: 'take' + (open ? ' open' : '') + (picking ? ' picking' : ''), id: 't-' + t.id, 'data-del': 'Smazat' },
    row,
    picking ? renderPicker(t, z, DEPTS.find(d => d.key === picking)) : null,
    open ? (locked(z) ? renderBodyReadOnly(t) : renderBody(t, z)) : null);
}

// Five big buttons under the take. Picking moves on to the next department that has no rating yet.
function renderPicker(t, z, d){
  const pick = code => {
    t[d.key] = t[d.key] === code ? '' : code;
    const next = t[d.key] && DEPTS.slice(DEPTS.indexOf(d) + 1).find(x => !t[x.key]);
    view.rating = next ? { takeId: t.id, dept: next.key } : null;
    commitZ(z);
  };
  return el('div', { className: 'picker', role: 'group', 'aria-label': `${d.name}: hodnocení` },
    el('span', { className: 'picker-who' }, d.letter),
    RATINGS.map((r, i) => el('button', {
      className: `pick r-${i}` + (t[d.key] === r.code ? ' on' : ''), 'aria-pressed': t[d.key] === r.code ? 'true' : 'false',
      'aria-label': `${d.name}: ${r.code}, ${r.name}`, onClick: () => pick(r.code)
    }, r.short)));
}

function deleteTake(t, z){
  const undo = removeTake(z, t);
  if (view.openTakeId === t.id) view.openTakeId = null;
  commitZ(z);
  undoToast(`${t.number == null ? 'Poznámka' : 'Take ' + t.number} smazán${t.number == null ? 'a' : ''}`, () => { undo(); commitZ(z); });
}

// The next take, always waiting at the bottom of a záběr. Tapping anything on it makes it real.
export function renderGhost(z){
  const n = nextTakeNumber(z);
  const make = (then) => { const t = addTake(z); then(t); };
  return el('div', { className: 'take ghost' }, el('div', { className: 'take-row' },
    el('button', { className: 'take-toggle', 'aria-label': `Přidat take ${n} a otevřít poznámky`, onClick: () => make(t => { commitZ(z); toggleTake(t, z, true); }) },
      el('span', { className: 'take-num tnum' }, `take ${n}`)),
    el('button', { className: 'ghost-note', 'aria-label': 'Přidat řádek bez čísla taku (wild, prázdné jetí, poznámka)',
      onClick: () => { const t = addNoteRow(z); commitZ(z); toggleTake(t, z, true); } }, '+ pozn.'),
    el('div', { className: 'chips' }, DEPTS.map(d => chip(null, d, {
      'aria-label': `Přidat take ${n} a ohodnotit: ${d.name}`,
      onClick: () => make(t => { view.rating = { takeId: t.id, dept: d.key }; commitZ(z); })
    })))));
}

function renderBodyReadOnly(t){
  return el('div', { className: 'take-body ro', id: 'tb-' + t.id },
    NOTES.map(n => el('div', { className: 'field' },
      el('span', { className: 'label' }, noteLabel(n)),
      el('p', { className: 'ro-text' + (t[n.note] ? '' : ' none') }, t[n.note] || '—'))),
    t.properties.length ? el('div', { className: 'props' }, el('div', { className: 'label' }, 'Vlastnosti'),
      el('div', { className: 'pills' }, t.properties.map(p => el('span', { className: 'pill ro' }, el('span', { className: 'pill-k' }, p.key), el('b', null, p.value))))) : null);
}

function renderBody(t, z){
  return el('div', { className: 'take-body', id: 'tb-' + t.id, 'data-fieldgroup': '' },
    NOTES.map((n, i) => noteField(t, n, i === NOTES.length - 1)),
    el('div', { className: 'props' },
      el('div', { className: 'label' }, 'Vlastnosti'),
      t.properties.length ? el('div', { className: 'pills' }, t.properties.map((p, i) => el('span', { className: 'pill' },
        el('span', { className: 'pill-k' }, p.key), el('b', null, p.value),
        el('button', { className: 'pill-x', 'aria-label': `Odebrat ${p.key}`, onClick: () => { t.properties.splice(i, 1); commitZ(z); } }, '×')))) : null,
      propertyAdder(t, z)),
    el('button', { className: 'text-btn', onClick: () => deleteTake(t, z) }, icon('trash'), el('span', { className: 'u' }, t.number == null ? 'Smazat řádek' : 'Smazat take')));
}

// One author's note. Saved on every keystroke; their most used notes are offered on the keyboard bar.
function noteField(t, n, last){
  const input = el('input', {
    id: `n-${t.id}-${n.key}`, type: 'text', className: 'field-in', placeholder: 'Poznámka', value: t[n.note],
    autocomplete: 'off', autocorrect: 'off', enterkeyhint: last ? 'done' : 'next', 'data-seq': '1'
  });
  const setNote = () => {
    t[n.note] = input.value; save();
    document.getElementById(`chip-${t.id}-${n.key}`)?.classList.toggle('note', hasNote(t, n));
  };
  const remember = v => { if (rememberNote(data.noteHistory, n.key, v)) save(); };
  input.addEventListener('input', setNote);
  input.addEventListener('change', () => remember(input.value));
  suggestField(input, {
    items: q => noteSuggestions(data.noteHistory, n.key, q),
    onPick: x => { input.value = x; setNote(); remember(x); }
  });
  return el('div', { className: 'field' }, el('label', { className: 'label', for: input.id }, noteLabel(n)), input);
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
  const input = el('input', { type: 'text', className: 'field-in', placeholder, 'aria-label': placeholder, autocomplete: 'off', enterkeyhint: 'done', 'data-autofocus': true });
  suggestField(input, {
    items: q => matchSuggestions(naming ? Object.keys(data.dictionary) : dictValues(data.dictionary, ps.key), q),
    onPick: confirm
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter'){ e.preventDefault(); confirm(input.value); }
    if (e.key === 'Escape') cancel();
  });
  return el('div', { className: 'prop-add' }, el('div', { className: 'ac' }, input),
    el('button', { className: 'sq-btn fill', 'aria-label': 'Potvrdit', onClick: () => confirm(input.value) }, '✓'),
    el('button', { className: 'sq-btn', 'aria-label': 'Zrušit', onClick: cancel }, '×'));
}
