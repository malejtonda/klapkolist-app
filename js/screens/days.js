import { uid } from '../util.js';
import { ndStats } from '../model.js';
import { findProject, save } from '../store.js';
import { navigate, navReset, refresh } from '../nav.js';
import { renderApp, header, scrollArea, sectionLabel, dock, primaryButton, itemRow, promptDialog, confirmDelete } from '../ui.js';
import { screenProjects } from './projects.js';
import { screenDay } from './day.js';
import { screenImport } from './import.js';

// The shooting days (ND) of one project.
export function screenDays(projectId){
  const proj = findProject(projectId);
  if (!proj){ navReset(screenProjects); return; }
  const content = scrollArea(proj.nds, 'Žádný natáčecí den', 'Přidejte první den. Klapkolist můžete vložit ze Sheets, nebo záběry zadat ručně.');
  if (proj.nds.length){
    content.appendChild(sectionLabel('Natáčecí dny'));
    proj.nds.forEach(nd => {
      const { total, done } = ndStats(nd);
      content.appendChild(itemRow({
        name: nd.name,
        side: `${done}/${total}`,
        onOpen: () => navigate(screenDay, projectId, nd.id),
        onRename: () => promptDialog('Přejmenovat den', 'Nový název', name => { if (!name) return; nd.name = name; save(); refresh(); }, nd.name),
        onDelete: () => confirmDelete('Smazat natáčecí den?', `„${nd.name}“ se smaže se všemi záběry a taky. Vrátit to nejde.`,
          () => { proj.nds = proj.nds.filter(x => x !== nd); save(); refresh(); })
      }));
    });
  }
  const add = primaryButton('+ Natáčecí den', () => {
    const nd = { id: uid(), name: 'ND' + (proj.nds.length + 1), zabery: [] };
    proj.nds.push(nd); save();
    // open the new day with the import on top: done or skipped, the import goes back to the day
    navigate(screenDay, projectId, nd.id);
    navigate(screenImport, projectId, nd.id);
  });
  renderApp(header(proj.name, { back: true }), content, dock(add));
}
