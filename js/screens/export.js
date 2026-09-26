import { el, showToast } from '../dom.js';
import { plural, safeName } from '../util.js';
import { toTSV } from '../sheet.js';
import { findDay } from '../store.js';
import { goBack } from '../nav.js';
import { renderApp, header, scrollArea } from '../ui.js';
import { saveFile } from '../files.js';

// The day as a table to paste into Google Sheets (and to import back).
export function screenExport(projectId, ndId){
  const found = findDay(projectId, ndId);
  if (!found){ goBack(); return; }
  const { proj, nd } = found;
  const tsv = toTSV(nd);
  const takes = nd.zabery.reduce((a, z) => a + z.takes.length, 0);

  const ta = el('textarea', { className: 'mono', id: 'export-ta', readonly: true, 'aria-label': 'Export ve formátu TSV' });
  ta.value = tsv;
  const copy = async () => {
    try{ await navigator.clipboard.writeText(tsv); showToast('Zkopírováno do schránky'); }
    catch{ ta.focus(); ta.select(); showToast('Text je označený — zkopírujte ho ručně'); }
  };
  const content = scrollArea(null);
  content.append(
    el('p', { className: 'hint' }, `${nd.zabery.length} záběrů, ${takes} ${plural(takes, 'take', 'taky', 'taků')}. Zkopírujte a vložte do Sheets.`),
    ta,
    el('div', { className: 'stack' },
      el('button', { className: 'btn btn-primary btn-full', onClick: copy }, 'Kopírovat'),
      el('button', { className: 'btn btn-line btn-full', onClick: () => saveFile(`${safeName(proj.name)}_${safeName(nd.name)}.tsv`, tsv, 'text/tab-separated-values') }, 'Uložit .tsv')));
  renderApp(header('Export', { back: true, count: nd.name }), content);
}
