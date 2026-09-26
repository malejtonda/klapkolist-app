import { el, showToast } from '../dom.js';
import { importRows } from '../model.js';
import { parseImport } from '../sheet.js';
import { data, findDay, save } from '../store.js';
import { goBack } from '../nav.js';
import { renderApp, header, scrollArea } from '../ui.js';

// Paste the day's table from Google Sheets. Always opened on top of the day it fills, so both
// "Přeskočit" and "Pokračovat" simply go back to it.
export function screenImport(projectId, ndId){
  const found = findDay(projectId, ndId);
  if (!found){ goBack(); return; }
  const { nd } = found;

  const content = scrollArea(null);
  content.appendChild(el('p', { className: 'hint' }, 'Zkopíruj a vlož Google Sheets tabulku s denními dispozicemi.'));
  const ta = el('textarea', { className: 'mono', id: 'import-ta', 'aria-label': 'Tabulka k importu', placeholder: 'OBRAZ\tZÁBĚR\n2\t2\n2\t3\n5\t8\n5\t9\n3\t4' });
  const preview = el('div');
  const updatePreview = () => preview.replaceChildren(...(ta.value.trim() ? importPreview(parseImport(ta.value)) : []));
  let timer = 0;
  ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(updatePreview, 250); });

  const pasteBtn = el('button', { className: 'btn btn-primary paste-btn', onClick: async () => {
    try{
      const txt = await navigator.clipboard.readText();
      if (!txt?.trim()){ showToast('Schránka je prázdná'); return; }
      ta.value = txt; updatePreview();
      const n = parseImport(txt).length;
      showToast(n ? `Vloženo · ${n} řádků` : 'Vloženo, ale bez řádků s čísly obrazu a záběru');
    }catch{
      ta.focus();
      showToast('Telefon nedovolil vložit přímo — podržte prst v poli a zvolte Vložit', 4000);
    }
  }}, 'Vložit');
  content.append(el('div', { className: 'paste-wrap' }, ta, pasteBtn), preview);

  content.appendChild(el('div', { className: 'btn-row' },
    el('button', { className: 'btn btn-line', onClick: goBack }, 'Přeskočit'),
    el('button', { className: 'btn btn-primary', onClick: () => {
      const rows = parseImport(ta.value);
      if (!rows.length){ showToast('Nenašel jsem žádné řádky s čísly obrazu a záběru'); return; }
      importRows(nd, rows, data.dictionary);
      save(); showToast(`Načteno ${rows.length} řádků`);
      goBack();
    }}, 'Pokračovat')));

  renderApp(header('Import', { back: true, count: nd.name }), content);
}

function importPreview(rows){
  if (!rows.length) return [el('p', { className: 'hint' }, 'Žádné rozpoznané řádky. První dva sloupce musí být čísla obrazu a záběru.')];
  const table = el('table', { className: 'preview-table tnum' },
    el('tr', null, ['OBRAZ', 'ZÁBĚR', 'TAKE'].map(h => el('th', null, h))),
    rows.slice(0, 12).map(r => el('tr', null, el('td', null, '' + r.obraz), el('td', null, '' + r.zaber), el('td', null, '' + (r.take || '–')))));
  return [el('div', { className: 'table-wrap' },
    el('div', { className: 'label', style: 'margin-bottom:6px' }, `${rows.length} řádků${rows.length > 12 ? ' · zobrazeno 12' : ''}`),
    table)];
}
