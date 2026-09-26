import { iconBtn } from '../dom.js';
import { uid } from '../util.js';
import { data, save } from '../store.js';
import { navigate, refresh } from '../nav.js';
import { renderApp, header, scrollArea, sectionLabel, dock, primaryButton, itemRow, promptDialog, confirmDelete } from '../ui.js';
import { screenDays } from './days.js';
import { screenSettings } from './settings.js';

export function screenProjects(){
  const content = scrollArea(data.projects, 'Žádný projekt', 'Založte projekt a v něm první natáčecí den.');
  if (data.projects.length){
    content.appendChild(sectionLabel('Projekty'));
    [...data.projects].reverse().forEach(p => content.appendChild(itemRow({   // newest first
      name: p.name,
      side: `${p.nds.length} ND`,
      onOpen: () => navigate(screenDays, p.id),
      onRename: () => promptDialog('Přejmenovat projekt', 'Nový název', name => { if (!name) return; p.name = name; save(); refresh(); }, p.name),
      onDelete: () => confirmDelete('Smazat projekt?', `„${p.name}“ se smaže se všemi natáčecími dny a taky. Vrátit to nejde.`,
        () => { data.projects = data.projects.filter(x => x !== p); save(); refresh(); })
    })));
  }
  const add = primaryButton('+ Nový projekt', () => promptDialog('Nový projekt', 'Název projektu', name => {
    if (!name) return;
    const p = { id: uid(), name, nds: [] };
    data.projects.push(p);
    save();
    navigate(screenDays, p.id);   // straight into the new project
  }));
  renderApp(header('Klapkolist', { actions: [iconBtn('settings', 'Nastavení', () => navigate(screenSettings))] }), content, dock(add));
}
