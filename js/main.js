import { showToast } from './dom.js';
import { load, onSaveError, onExternalChange } from './store.js';
import { navigate, refresh } from './nav.js';
import { initKeyboard } from './keyboard.js';
import { initSync } from './sync.js';
import { screenProjects } from './screens/projects.js';

onSaveError(() => showToast('Uložení selhalo — zkontrolujte místo v telefonu', { ms: 5000 }));
// the app is open twice and the other copy saved: show its data rather than overwrite it later
onExternalChange(() => { if (!document.activeElement?.matches('input, textarea')) refresh(); });

await load();
await initSync();
initKeyboard();
navigate(screenProjects);

// Keeps the app on the phone, so it opens with no signal (see sw.js).
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
