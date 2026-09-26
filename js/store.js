// The app's data and where it is kept: localStorage on the phone, under the same key and in the
// same shape as every earlier version, so existing data carries over.
import { normalize } from './model.js';

const STORAGE_KEY = 'klapkolist_data';

export let data = normalize(null);

// Called when saving fails (e.g. the phone is out of space), so the UI can tell the user.
let onSaveError = () => {};
export function setSaveErrorHandler(fn){ onSaveError = fn; }

export function load(){
  try{ data = normalize(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
  catch(e){ console.error('Load failed', e); data = normalize(null); }
}
export function save(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  catch(e){ console.error('Save failed', e); onSaveError(e); }
}
// Restore from a backup: everything on the phone is replaced.
export function replaceData(raw){ data = normalize(raw); save(); }

// Ask the browser not to clear our data when the phone runs low on space.
export function requestPersistence(){ navigator.storage?.persist?.().catch(() => {}); }

export function findProject(id){ return data.projects.find(p => p.id === id); }
// A shooting day and its project, or null when either is gone.
export function findDay(projectId, ndId){
  const proj = findProject(projectId);
  const nd = proj?.nds.find(n => n.id === ndId);
  return nd ? { proj, nd } : null;
}
export function starsOn(){ return data.settings.stars !== false; }
