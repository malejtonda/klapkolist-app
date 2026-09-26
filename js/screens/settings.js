import { el, icon, showToast } from '../dom.js';
import { plural } from '../util.js';
import { data, save, replaceData, starsOn } from '../store.js';
import { navigate, navReset, refresh } from '../nav.js';
import { renderApp, header, scrollArea, sectionLabel, showDialog, promptDialog } from '../ui.js';
import { screenProjects } from './projects.js';
import { screenDictionary } from './dictionary.js';

const rowText = (name, meta) => el('div', { className: 'row-main' }, el('div', { className: 'row-name' }, name), el('div', { className: 'row-meta' }, meta));

export function screenSettings(){
  const content = scrollArea(null);
  const on = starsOn();
  content.append(
    sectionLabel('Zobrazení'),
    el('button', { className: 'row-link', role: 'switch', 'aria-checked': on ? 'true' : 'false', onClick: () => { data.settings.stars = !on; save(); refresh(); } },
      rowText('Hvězdička u taků', on ? 'Zapnuto — označíte nejlepší take' : 'Vypnuto — hvězdičky jsou skryté, uložené zůstávají'),
      el('span', { className: 'switch' + (on ? ' on' : ''), 'aria-hidden': 'true' }, el('span'))),
    sectionLabel('Data'),
    el('button', { className: 'row-link', onClick: () => navigate(screenDictionary) },
      rowText('Slovník vlastností', `${Object.keys(data.dictionary).length} vlastností v nabídce`),
      icon('arrow', 'row-arrow')));

  // Restore: from a saved .json file (easiest on the iPhone: Files app) or from pasted text.
  const fileIn = el('input', { type: 'file', accept: '.json,application/json,text/plain', hidden: true });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files?.[0];
    fileIn.value = '';
    if (!f) return;
    try{ restoreFrom(await f.text()); }
    catch{ showToast('Soubor se nepodařilo přečíst'); }
  });
  content.append(fileIn,
    el('button', { className: 'row-link', onClick: () => fileIn.click() }, rowText('Obnovit ze souboru', 'Vybrat uloženou zálohu .json')),
    el('button', { className: 'row-link', onClick: () => promptDialog('Obnovit zálohu', 'Vložte JSON zálohu', restoreFrom) }, rowText('Obnovit z textu', 'Vložit zkopírovanou JSON zálohu')));

  renderApp(header('Nastavení', { back: true }), content);
}

function restoreFrom(text){
  if (!text) return;
  let parsed;
  try{ parsed = JSON.parse(text); if (!Array.isArray(parsed.projects)) throw 0; }
  catch{ showToast('Tohle není záloha Klapkolistu'); return; }
  const n = parsed.projects.length;
  showDialog('Přepsat data?', `Záloha (${n} ${plural(n, 'projekt', 'projekty', 'projektů')}) nahradí všechny projekty, které jsou teď v telefonu.`, [
    { label: 'Zrušit' },
    { label: 'Obnovit', cls: 'btn-primary', action: () => { replaceData(parsed); navReset(screenProjects); showToast('Data obnovena'); } }
  ]);
}
