import { showToast } from './dom.js';
import { load, requestPersistence, setSaveErrorHandler } from './store.js';
import { navigate } from './nav.js';
import { initKeyboard } from './keyboard.js';
import { screenProjects } from './screens/projects.js';

setSaveErrorHandler(() => showToast('Uložení selhalo — zkontrolujte místo v telefonu'));
load();
requestPersistence();
initKeyboard();
navigate(screenProjects);

// Keeps the app on the phone, so it opens with no signal (see sw.js).
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
