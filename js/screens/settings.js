import { el, icon, showToast } from '../dom.js';
import { plural } from '../util.js';
import { NOTES } from '../model.js';
import { data, save, replaceData, backupJSON } from '../store.js';
import { navigate, navReset, refresh } from '../nav.js';
import { renderApp, header, scrollArea, sectionLabel, showDialog, promptDialog } from '../ui.js';
import { saveFile } from '../files.js';
import { syncStatus, syncNow, connect, disconnect, listDriveBackups, fetchDriveBackup } from '../sync.js';
import { screenProjects } from './projects.js';
import { screenDictionary } from './dictionary.js';
import { screenHistory, when } from './history.js';

const rowText = (name, meta) => el('div', { className: 'row-main' }, el('div', { className: 'row-name' }, name), el('div', { className: 'row-meta' }, meta));
const row = (name, meta, onClick, side) => el('button', { className: 'row-link', onClick }, rowText(name, meta), side);
const arrow = () => icon('arrow', 'row-arrow');

export function screenSettings(){
  const content = scrollArea(null);
  const times = data.settings.times;
  content.append(
    sectionLabel('Zobrazení'),
    el('button', { className: 'row-link', role: 'switch', 'aria-checked': times ? 'true' : 'false', onClick: () => { data.settings.times = !times; save(); refresh(); } },
      rowText('Čas záběrů', times ? 'Zapnuto — u záběru jde zadat čas, den ukazuje součet' : 'Vypnuto — časy jsou skryté, uložené zůstávají'),
      el('span', { className: 'switch' + (times ? ' on' : ''), 'aria-hidden': 'true' }, el('span'))),
    sectionLabel('Google Drive'),
    ...driveRows(),
    sectionLabel('Data v telefonu'),
    row('Starší verze', 'Vrátit data, jak byla dřív — telefon si je sám průběžně ukládá', () => navigate(screenHistory), arrow()),
    row('Uložit zálohu do souboru', 'Všechna data jako soubor .json', () =>
      saveFile(`klapkolist_${new Date().toISOString().slice(0, 10)}.json`, backupJSON(), 'application/json')),
    restoreFromFileRow(),
    row('Slovník', `${Object.keys(data.dictionary).length} vlastností · ${NOTES.reduce((a, n) => a + data.noteHistory[n.key].length, 0)} poznámek — upravit, co se nabízí při psaní`, () => navigate(screenDictionary), arrow()));
  renderApp(header('Nastavení', { back: true }), content);
}

function driveRows(){
  const st = syncStatus();
  if (st.state === 'off') return [
    row('Připojit Google Drive', 'Vložte kód z tabulky „Klapkolist – nastavení“. Dny se pak samy posílají do Google Sheets a data se zálohují.',
      () => promptDialog('Připojit Google Drive', 'Kód pro připojení (KLAPKA1…)', async code => {
        if (!code) return;
        showToast('Připojuji…');
        try{ const c = await connect(code); showToast(`Připojeno · ${c.name}`); }
        catch(e){ showToast(e.message || 'Připojení se nepovedlo', { ms: 5000 }); }
        refresh();
      }))
  ];
  const state = { ok: 'Vše odesláno', pending: 'Čeká na odeslání', offline: 'Bez signálu — odešle se později', error: `Nepovedlo se: ${st.error}` }[st.state];
  return [
    row(`Připojeno · ${st.name}`, `${state}${st.lastOk ? ' · naposledy ' + when(st.lastOk) : ''}`, () => { syncNow(); showToast('Odesílám…'); }),
    row('Obnovit ze zálohy na Drive', 'Vybrat zálohu uloženou tímto kódem', restoreFromDrive),
    row('Odpojit', 'Přestane odesílat. Soubory na Drive zůstanou.', () => showDialog('Odpojit Google Drive?', 'Telefon přestane odesílat tabulky a zálohy. Co už na Drive je, tam zůstane.', [
      { label: 'Zrušit' }, { label: 'Odpojit', cls: 'btn-primary', action: () => { disconnect(); refresh(); } }]))
  ];
}

// Everything on the phone is replaced; the previous state stays under "Starší verze".
function confirmRestore(parsed, from){
  const n = parsed.projects.length;
  showDialog('Přepsat data?', `${from} (${n} ${plural(n, 'projekt', 'projekty', 'projektů')}) nahradí všechno, co je teď v telefonu. Současný stav najdete ve Starších verzích.`, [
    { label: 'Zrušit' },
    { label: 'Obnovit', cls: 'btn-primary', action: () => { replaceData(parsed).then(() => { navReset(screenProjects); showToast('Data obnovena'); }); } }
  ]);
}
function restoreFromFileRow(){
  const fileIn = el('input', { type: 'file', accept: '.json,application/json,text/plain', hidden: true });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files?.[0];
    fileIn.value = '';
    if (!f) return;
    try{
      const parsed = JSON.parse(await f.text());
      if (!Array.isArray(parsed.projects)) throw 0;
      confirmRestore(parsed, 'Záloha');
    }catch{ showToast('Tohle není záloha Klapkolistu'); }
  });
  return el('div', null, fileIn, row('Obnovit ze souboru', 'Vybrat uloženou zálohu .json', () => fileIn.click()));
}
async function restoreFromDrive(){
  showToast('Hledám zálohy…');
  try{
    const files = await listDriveBackups();
    if (!files.length){ showToast('Na Drive zatím žádná záloha není'); return; }
    showDialog('Zálohy na Drive', el('div', { className: 'pick-list' }, files.map(f =>
      el('button', { className: 'row-link', onClick: async () => {
        showToast('Stahuji zálohu…');
        try{ confirmRestore(await fetchDriveBackup(f.id), f.name); }
        catch(e){ showToast(e.message || 'Zálohu se nepodařilo stáhnout', { ms: 5000 }); }
      } }, rowText(f.name, when(f.when))))), [{ label: 'Zavřít' }]);
  }catch(e){ showToast(e.message || 'Zálohy se nepodařilo načíst', { ms: 5000 }); }
}
