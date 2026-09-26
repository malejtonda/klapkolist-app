// Getting a file off the phone: the share sheet (Save to Files, AirDrop, mail…) where there is one,
// a download elsewhere, and the clipboard as the last resort.
import { el, showToast } from './dom.js';

export async function saveFile(filename, text, mime){
  try{
    const file = new File([text], filename, { type: mime });
    if (navigator.canShare?.({ files: [file] })){ await navigator.share({ files: [file] }); return; }
  }catch(e){ if (e?.name === 'AbortError') return; }
  try{
    const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: mime })), download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    showToast('Soubor stažen');
    return;
  }catch{}
  try{ await navigator.clipboard.writeText(text); showToast('Uložení nešlo — obsah je ve schránce'); }
  catch{ showToast('Soubor se nepodařilo uložit'); }
}
