// Small pure helpers, no DOM and no app data.

export function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

// lower case, no diacritics: "Ostrost" matches "ostrost", "zaostreni" matches "zaostření"
export function fold(x){ return String(x).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }

// Czech plural: 1 take, 2–4 taky, 5+ taků
export function plural(n, one, few, many){ return n === 1 ? one : n >= 2 && n <= 4 ? few : many; }

export function safeName(x){ return String(x).trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_') || 'x'; }

// Earlier entries that contain what you've typed (ignoring case and diacritics), most recent first.
export function matchSuggestions(list, query, max = 8){
  const q = fold(query || '');
  return list.filter(x => fold(x) !== q && (!q || fold(x).includes(q))).slice(0, max);
}
