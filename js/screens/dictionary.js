import { el, iconBtn } from '../dom.js';
import { addToDict } from '../model.js';
import { data, save } from '../store.js';
import { refresh } from '../nav.js';
import { renderApp, header, scrollArea, sectionLabel, dock, primaryButton, promptDialog, confirmDelete } from '../ui.js';

// Property names and values offered when adding a vlastnost to a take.
export function screenDictionary(){
  const keys = Object.keys(data.dictionary).sort();
  const content = scrollArea(keys, 'Prázdný slovník', 'Vlastnosti a jejich hodnoty se sem ukládají samy, když je přidáváte k takům.');
  if (keys.length) content.appendChild(sectionLabel('Vlastnosti'));
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
  const add = primaryButton('+ Vlastnost', () => promptDialog('Nová vlastnost', 'Název, např. objektiv', name => {
    if (!name) return;
    addToDict(data.dictionary, name, '');
    save(); refresh();
  }));
  renderApp(header('Slovník', { back: true }), content, dock(add));
}
