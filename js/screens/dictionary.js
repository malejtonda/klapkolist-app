import { el, iconBtn, undoToast } from '../dom.js';
import { NOTES, addToDict, renameNote, forgetNote, addNote, sortedNotes } from '../model.js';
import { data, save } from '../store.js';
import { refresh } from '../nav.js';
import { renderApp, header, scrollArea, dock, primaryButton, promptDialog, confirmDelete } from '../ui.js';

// Everything the app offers again while you type: property names and values, and each
// department's notes. One tab per kind, so the lists stay short.
const TABS = [{ key: 'props', name: 'Vlastnosti' }, ...NOTES.map(n => ({ key: n.key, name: n.name }))];
let tab = 'props';

export function screenDictionary(){
  const counts = { props: Object.keys(data.dictionary).length };
  NOTES.forEach(n => { counts[n.key] = data.noteHistory[n.key].length; });
  const tabs = el('div', { className: 'tabs', role: 'tablist' }, TABS.map(t => el('button', {
    className: 'tab' + (t.key === tab ? ' on' : ''), role: 'tab', 'aria-selected': t.key === tab ? 'true' : 'false',
    onClick: () => { tab = t.key; refresh(); }
  }, t.name, el('span', { className: 'tab-n tnum' }, String(counts[t.key])))));

  const isProps = tab === 'props';
  const content = isProps ? propertiesList() : notesList(NOTES.find(n => n.key === tab));
  content.prepend(tabs);
  const add = isProps
    ? primaryButton('+ Vlastnost', () => promptDialog('Nová vlastnost', 'Název, např. objektiv', name => {
        if (!name) return;
        addToDict(data.dictionary, name, '');
        save(); refresh();
      }))
    : primaryButton('+ Poznámka', () => promptDialog(`Nová poznámka · ${NOTES.find(n => n.key === tab).name}`, 'Text poznámky', text => {
        if (addNote(data.noteHistory, tab, text)){ save(); refresh(); }
      }));
  renderApp(header('Slovník', { back: true }), content, dock(add));
}

function propertiesList(){
  const keys = Object.keys(data.dictionary).sort((a, b) => a.localeCompare(b, 'cs'));
  const content = scrollArea(keys, 'Žádné vlastnosti', 'Vlastnosti a jejich hodnoty se sem ukládají samy, když je přidáváte k takům.');
  keys.forEach(key => {
    const vals = data.dictionary[key];
    content.appendChild(el('div', { className: 'dict-entry' },
      el('div', { className: 'dict-name' },
        el('span', { className: 'row-name' }, key),
        iconBtn('trash', `Smazat ${key}`, () => confirmDelete(`Smazat „${key}“?`, 'Zmizí z nabídky. U taků, kde už je vyplněná, zůstane.',
          () => { delete data.dictionary[key]; save(); refresh(); }))),
      vals.length
        ? el('div', { className: 'pills' }, vals.map((v, i) => el('span', { className: 'pill' }, el('b', null, v),
            el('button', { className: 'pill-x', 'aria-label': `Odebrat ${v}`, onClick: () => { vals.splice(i, 1); save(); refresh(); } }, '×'))))
        : el('div', { className: 'row-meta' }, 'zatím bez hodnot')));
  });
  return content;
}

// One department's remembered notes, A to Z. Tap to fix the wording, × to drop it.
function notesList(n){
  const notes = sortedNotes(data.noteHistory, n.key);
  const content = scrollArea(notes, 'Zatím nic', `Poznámky, které napíšete do ${n.letter} · ${n.name}, se sem ukládají samy a nabízejí se při psaní.`);
  if (notes.length) content.appendChild(el('p', { className: 'hint dict-hint' },
    'Nabízejí se při psaní, nejpoužívanější první. Úprava tady nemění poznámky, které už u taků jsou.'));
  content.append(...notes.map(x => el('div', { className: 'note-row' },
    el('button', { className: 'note-text', 'aria-label': `Upravit: ${x.text}`, onClick: () => promptDialog('Upravit poznámku', 'Text poznámky', text => {
      if (renameNote(data.noteHistory, n.key, x.text, text)){ save(); refresh(); }
    }, x.text) },
      el('span', null, x.text),
      x.count ? el('span', { className: 'note-count tnum' }, `${x.count}×`) : null),
    el('button', { className: 'pill-x note-x', 'aria-label': `Odebrat ${x.text}`, onClick: () => {
      const undo = forgetNote(data.noteHistory, n.key, x.text);
      save(); refresh();
      undoToast('Poznámka odebrána', () => { undo(); save(); refresh(); });
    } }, '×'))));
  return content;
}
