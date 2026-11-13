import { el, showToast } from '../dom.js';
import { plural } from '../util.js';
import { listSnapshots, restoreSnapshot } from '../store.js';
import { navReset } from '../nav.js';
import { renderApp, header, scrollArea, sectionLabel, showDialog } from '../ui.js';
import { screenProjects } from './projects.js';

// "dnes 14:20", "včera 9:05", "3. 11. 18:40"
export function when(ts){
  const d = new Date(ts), now = new Date();
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${days === 0 ? 'dnes' : days === 1 ? 'včera' : `${d.getDate()}. ${d.getMonth() + 1}.`} ${time}`;
}

// Earlier states of the data, kept by the phone on its own (see store.js).
export async function screenHistory(){
  const snaps = await listSnapshots();
  const content = scrollArea(snaps, 'Zatím nic', 'Telefon si při práci sám ukládá starší verze dat. Objeví se tady.');
  if (snaps.length) content.append(
    el('p', { className: 'hint' }, 'Telefon si při práci každých pár minut uloží stav dat. Když se něco pokazí, vraťte se k dřívějšímu.'),
    sectionLabel('Uložené verze'),
    ...snaps.map(s => el('button', { className: 'row-link', onClick: () => showDialog('Vrátit tuto verzi?',
      `Data z ${when(s.ts)} nahradí všechno, co je teď v telefonu. Současný stav se uloží jako další verze.`, [
        { label: 'Zrušit' },
        { label: 'Vrátit', cls: 'btn-primary', action: () => { restoreSnapshot(s.ts).then(() => { navReset(screenProjects); showToast('Verze obnovena'); }); } }
      ]) },
      el('div', { className: 'row-main' },
        el('div', { className: 'row-name' }, when(s.ts)),
        el('div', { className: 'row-meta' }, `${s.projects} ${plural(s.projects, 'projekt', 'projekty', 'projektů')} · ${s.zabery} záběrů · ${s.takes} ${plural(s.takes, 'take', 'taky', 'taků')}`)))));
  renderApp(header('Starší verze', { back: true }), content);
}
