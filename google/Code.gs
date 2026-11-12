/**
 * Klapkolist → Google Drive.
 *
 * This script lives in one Google Sheet in your Drive ("Klapkolist – nastavení"). The Klapkolist
 * app on a phone sends it each shooting day; the script writes it into a Google Sheet per project
 * (one tab per shooting day) in the folder "Klapkolist", and keeps a backup file of each phone's
 * data in "Klapkolist/Zálohy".
 *
 * Setup is in google/README.md. In short: paste this file into Extensions → Apps Script,
 * Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone), then reload the
 * sheet and use the "Klapkolist" menu.
 *
 * How the sheets look is decided by the tab "ŠABLONA" in this spreadsheet: row 1 is the header,
 * row 2 is how the rows of every odd záběr look, row 3 the rows of every even záběr. Change the
 * colours, widths and dropdowns there, never in this code.
 */

var API = 1;
var FOLDER = 'Klapkolist';
var BACKUPS = 'Zálohy';
var TEMPLATE = 'ŠABLONA';
var LOCAL_TEMPLATE = '_šablona';
var ACCESS = 'Telefony';
var HEADER = ['OB', 'ZA', 'TA', 'REŽIE', 'poznámky režie', 'KAMERA', 'poznámky kamera', 'ZVUK', 'poznámky zvuk', 'skript poznámky'];
var RATINGS = ['PP', 'P-', 'P', 'P+', 'BEREME'];
var RATING_COLS = [4, 6, 8];
var DAY_KEY = 'klapkolist_nd';
var CODE_PREFIX = 'KLAPKA1.';
var KEEP_DAILY_BACKUPS = 14;

// ===================================================================
// Menu (runs as you, inside the settings sheet)
// ===================================================================
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Klapkolist')
    .addItem('1. Nastavit adresu skriptu…', 'menuSetUrl')
    .addItem('2. Přidat telefon…', 'menuAddPhone')
    .addSeparator()
    .addItem('Vytvořit šablonu znovu', 'menuResetTemplate')
    .addToUi();
}

function menuSetUrl() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('Adresa skriptu',
    'Vložte adresu webové aplikace z Nasadit → Spravovat nasazení (končí na /exec):', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var url = res.getResponseText().trim();
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) {
    ui.alert('Tohle nevypadá jako adresa webové aplikace. Má začínat https://script.google.com/ a končit /exec.');
    return;
  }
  PropertiesService.getScriptProperties().setProperty('url', url);
  ensureSetup_();
  ui.alert('Hotovo. Teď přidejte telefon: Klapkolist → 2. Přidat telefon…');
}

function menuAddPhone() {
  var ui = SpreadsheetApp.getUi();
  var url = PropertiesService.getScriptProperties().getProperty('url');
  if (!url) { ui.alert('Nejdřív nastavte adresu skriptu (Klapkolist → 1.).'); return; }
  var res = ui.prompt('Přidat telefon', 'Čí telefon to je? (jméno se objeví v názvech souborů)', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var name = res.getResponseText().trim();
  if (!name) return;
  ensureSetup_();
  var key = Utilities.getUuid() + Utilities.getUuid();
  var code = CODE_PREFIX + Utilities.base64EncodeWebSafe(JSON.stringify({ u: url, k: key, n: name }), Utilities.Charset.UTF_8);
  accessSheet_().appendRow([name, key, new Date(), '', code]);
  // the first phone is yours: its files carry no name
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('owner')) props.setProperty('owner', key);
  var html = HtmlService.createHtmlOutput(
    '<p style="font:14px sans-serif">Tento kód pošlete na telefon (' + escape_(name) + ') a v aplikaci ho vložte v ' +
    '<b>Nastavení → Připojit Google Drive</b>. Kód je jako heslo: kdo ho má, může zapisovat do vašeho Disku.</p>' +
    '<textarea readonly style="width:100%;height:140px;font:12px monospace" onclick="this.select()">' + escape_(code) + '</textarea>' +
    '<p style="font:12px sans-serif;color:#666">Kód najdete i později v listu „' + ACCESS + '“. Smazáním řádku přístup zrušíte.</p>')
    .setWidth(460).setHeight(300);
  ui.showModalDialog(html, 'Kód pro připojení');
}

function menuResetTemplate() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('Šablona', 'Nahradit list „' + TEMPLATE + '“ výchozí šablonou?', ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  var ss = SpreadsheetApp.getActive();
  var old = ss.getSheetByName(TEMPLATE);
  if (old) old.setName(TEMPLATE + ' (stará ' + Date.now() + ')');
  buildTemplate_(ss);
}

function escape_(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// ===================================================================
// Settings sheet: the list of phones and the template
// ===================================================================
function ensureSetup_() {
  var ss = SpreadsheetApp.getActive();
  PropertiesService.getScriptProperties().setProperty('home', ss.getId());
  if (!ss.getSheetByName(ACCESS)) {
    var s = ss.insertSheet(ACCESS);
    s.getRange(1, 1, 1, 5).setValues([['Jméno', 'Klíč', 'Přidáno', 'Naposledy odesláno', 'Kód pro připojení']]).setFontWeight('bold');
    s.setFrozenRows(1);
    s.hideColumns(2);
  }
  if (!ss.getSheetByName(TEMPLATE)) buildTemplate_(ss);
}
// The settings spreadsheet. Its id is remembered at setup, because a web app call has no "active" one.
function home_() {
  var id = PropertiesService.getScriptProperties().getProperty('home');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
}
function accessSheet_() { return home_().getSheetByName(ACCESS); }

// The default look. Afterwards the tab is yours to restyle.
function buildTemplate_(ss) {
  var s = ss.insertSheet(TEMPLATE);
  var n = HEADER.length;
  s.getRange(1, 1, 1, n).setValues([HEADER])
    .setBackground('#000000').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
  var body = s.getRange(2, 1, 2, n);
  body.setNumberFormat('@').setVerticalAlignment('middle').setWrap(true).setFontColor('#000000');
  s.getRange(2, 1, 1, n).setBackground('#ffffff');
  s.getRange(3, 1, 1, n).setBackground('#d9d9d9');
  s.getRange(2, 1, 2, 3).setHorizontalAlignment('center').setFontWeight('bold');
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(RATINGS, true).setAllowInvalid(true).build();
  var colours = { 'PP': ['#b10202', '#ffffff'], 'P-': ['#ffc8aa', '#753800'], 'P': ['#ffe5a0', '#473821'], 'P+': ['#d4edbc', '#11734b'], 'BEREME': ['#11734b', '#ffffff'] };
  var rules = [];
  RATING_COLS.forEach(function (c) {
    var r = s.getRange(2, c, 2, 1);
    r.setDataValidation(rule).setHorizontalAlignment('center');
    RATINGS.forEach(function (code) {
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(code)
        .setBackground(colours[code][0]).setFontColor(colours[code][1]).setRanges([r]).build());
    });
  });
  s.setConditionalFormatRules(rules);
  [28, 32, 28, 80, 200, 80, 200, 80, 200, 240].forEach(function (w, i) { s.setColumnWidth(i + 1, w); });
  s.setFrozenRows(1);
  s.setFrozenColumns(3);
  if (s.getMaxRows() > 3) s.deleteRows(4, s.getMaxRows() - 3);
  if (s.getMaxColumns() > n) s.deleteColumns(n + 1, s.getMaxColumns() - n);
  return s;
}

// ===================================================================
// Web app (runs as you, called by the phones)
// ===================================================================
function doGet() {
  return ContentService.createTextOutput('Klapkolist skript běží. Připojte telefon kódem z menu Klapkolist v tabulce.');
}

function doPost(e) {
  var out;
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(60000);
    var body = JSON.parse(e.postData.contents);
    var who = authorise_(body.key);
    if (!who) out = { ok: false, error: 'Kód už neplatí — připojte telefon znovu' };
    else out = handle_(who, body);
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// → { name, key, row, owner } for a known key
function authorise_(key) {
  var s = accessSheet_();
  if (!s || !key || s.getLastRow() < 2) return null;
  var rows = s.getRange(2, 1, s.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][1] === key) return { name: String(rows[i][0]), key: key, row: i + 2, owner: key === PropertiesService.getScriptProperties().getProperty('owner') };
  }
  return null;
}

function handle_(who, body) {
  if (body.action === 'hello') return { ok: true, api: API, name: who.name };
  if (body.action === 'day') {
    var url = writeDay_(who, body);
    accessSheet_().getRange(who.row, 4).setValue(new Date());
    return { ok: true, url: url };
  }
  if (body.action === 'backup') { saveBackup_(who, body); return { ok: true }; }
  if (body.action === 'backups') return { ok: true, files: listBackups_(who) };
  if (body.action === 'restore') return { ok: true, json: readBackup_(who, body.id) };
  return { ok: false, error: 'Neznámý požadavek — aktualizujte skript' };
}

// ----- Drive folders -----
function folder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('folder');
  if (id) { try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (x) {} }
  var made = DriveApp.createFolder(FOLDER);
  props.setProperty('folder', made.getId());
  return made;
}
function backupFolder_() {
  var it = folder_().getFoldersByName(BACKUPS);
  return it.hasNext() ? it.next() : folder_().createFolder(BACKUPS);
}

// ----- one project = one spreadsheet, one shooting day = one tab -----
function projectSpreadsheet_(who, project) {
  var props = PropertiesService.getScriptProperties();
  var prop = 'ss_' + who.key.slice(0, 8) + '_' + project.id;
  var name = who.owner ? project.name : project.name + ' – ' + who.name;
  var id = props.getProperty(prop);
  var ss = null;
  if (id) { try { if (!DriveApp.getFileById(id).isTrashed()) ss = SpreadsheetApp.openById(id); } catch (x) {} }
  if (!ss) {
    ss = SpreadsheetApp.create(name);
    DriveApp.getFileById(ss.getId()).moveTo(folder_());
    props.setProperty(prop, ss.getId());
  }
  if (ss.getName() !== name) ss.rename(name);
  return ss;
}

// A hidden copy of ŠABLONA inside the project's spreadsheet (formats can only be copied within one file).
function localTemplate_(ss, refresh) {
  var t = ss.getSheetByName(LOCAL_TEMPLATE);
  if (t && !refresh) return t;
  var source = home_().getSheetByName(TEMPLATE) || buildTemplate_(home_());
  if (t) ss.deleteSheet(t);
  t = source.copyTo(ss).setName(LOCAL_TEMPLATE);
  t.hideSheet();
  return t;
}

function findDaySheet_(ss, dayId) {
  var found = ss.createDeveloperMetadataFinder().withKey(DAY_KEY).withValue(dayId).find();
  for (var i = 0; i < found.length; i++) {
    var sheet = found[i].getLocation().getSheet();
    if (sheet) return sheet;
  }
  return null;
}

function uniqueName_(ss, wanted, self) {
  var name = wanted || 'ND', n = 2;
  while (true) {
    var other = ss.getSheetByName(name);
    if (!other || (self && other.getSheetId() === self.getSheetId())) return name;
    name = wanted + ' (' + (n++) + ')';
  }
}

function writeDay_(who, body) {
  var ss = projectSpreadsheet_(who, body.project);
  var table = body.table;
  var sheet = findDaySheet_(ss, body.day.id);
  var tpl = localTemplate_(ss, !sheet);          // a new tab picks up the current ŠABLONA
  if (!sheet) {
    sheet = tpl.copyTo(ss);
    sheet.showSheet();
    sheet.addDeveloperMetadata(DAY_KEY, body.day.id);
    // the empty sheet a new spreadsheet starts with
    ss.getSheets().forEach(function (s) {
      if (s.getDeveloperMetadata().length === 0 && s.getName() !== LOCAL_TEMPLATE && s.getLastRow() === 0 && ss.getSheets().length > 2) ss.deleteSheet(s);
    });
  }
  var name = uniqueName_(ss, body.day.name, sheet);
  if (sheet.getName() !== name) sheet.setName(name);

  var cols = table.header.length, rows = Math.max(table.rows.length, 1);
  var tplCols = tpl.getMaxColumns();
  // property columns beyond the template look like its last column
  if (cols > tplCols) {
    tpl.insertColumnsAfter(tplCols, cols - tplCols);
    tpl.getRange(1, tplCols, 3, 1).copyTo(tpl.getRange(1, tplCols + 1, 3, cols - tplCols), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    for (var c = tplCols + 1; c <= cols; c++) tpl.setColumnWidth(c, 120);
  }
  if (sheet.getMaxColumns() < cols) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), cols - sheet.getMaxColumns());
    for (var k = tplCols + 1; k <= cols; k++) sheet.setColumnWidth(k, tpl.getColumnWidth(k));
  }
  if (sheet.getMaxColumns() > cols) sheet.deleteColumns(cols + 1, sheet.getMaxColumns() - cols);
  if (sheet.getMaxRows() < rows + 1) sheet.insertRowsAfter(sheet.getMaxRows(), rows + 1 - sheet.getMaxRows());
  if (sheet.getMaxRows() > rows + 1) sheet.deleteRows(rows + 2, sheet.getMaxRows() - rows - 1);

  // look: header from template row 1, every row from template row 2 (with its dropdowns)
  var P = SpreadsheetApp.CopyPasteType;
  tpl.getRange(1, 1, 1, cols).copyTo(sheet.getRange(1, 1, 1, cols), P.PASTE_FORMAT, false);
  var bodyRange = sheet.getRange(2, 1, rows, cols);
  bodyRange.clearContent();
  sheet.clearConditionalFormatRules();           // they come back with the formats below
  tpl.getRange(2, 1, 1, cols).copyTo(bodyRange, P.PASTE_FORMAT, false);
  tpl.getRange(2, 1, 1, cols).copyTo(bodyRange, P.PASTE_DATA_VALIDATION, false);
  sheet.getRange(1, 1, 1, cols).setValues([table.header]);

  if (table.rows.length) {
    // bands per záběr (template rows 2 and 3), cancelled záběry grey and struck through
    var bg = [tpl.getRange(2, 1, 1, cols).getBackgrounds()[0], tpl.getRange(3, 1, 1, cols).getBackgrounds()[0]];
    var ink = tpl.getRange(2, 1, 1, cols).getFontColors()[0];
    var grey = ink.map(function () { return '#999999'; });
    var backgrounds = [], colours = [], lines = [], values = [];
    table.rows.forEach(function (row, i) {
      backgrounds.push(bg[table.zaber[i] % 2]);
      colours.push(table.cancelled[i] ? grey : ink);
      lines.push(row.map(function () { return table.cancelled[i] ? 'line-through' : 'none'; }));
      values.push(row.map(function (v, c) { return (c === 0 || c === 2) && /^\d+$/.test(v) ? Number(v) : v; }));
    });
    // notes are plain text: one starting with = or + must not turn into a formula
    sheet.getRange(2, 4, rows, cols - 3).setNumberFormat('@');
    sheet.getRange(2, 2, rows, 1).setNumberFormat('@');
    bodyRange.setBackgrounds(backgrounds).setFontColors(colours).setFontLines(lines).setValues(values);
  }

  try { ss.setActiveSheet(sheet); ss.moveActiveSheet(Math.min(body.day.index + 1, ss.getSheets().length)); } catch (x) {}
  SpreadsheetApp.flush();
  return ss.getUrl();
}

// ----- backups: the phone's whole data as a file -----
function backupName_(who, device) { return who.name + ' – ' + String(device).slice(0, 12); }

function saveBackup_(who, body) {
  var dir = backupFolder_();
  var base = backupName_(who, body.device);
  var latest = base + '.json';
  var it = dir.getFilesByName(latest);
  if (it.hasNext()) it.next().setContent(body.json);
  else dir.createFile(latest, body.json, 'application/json');
  // one dated copy per day, the last two weeks kept
  var today = base + ' ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd') + '.json';
  var dated = dir.getFilesByName(today);
  if (dated.hasNext()) dated.next().setContent(body.json);
  else dir.createFile(today, body.json, 'application/json');
  var old = [];
  var all = dir.getFiles();
  while (all.hasNext()) {
    var f = all.next();
    if (f.getName().indexOf(base + ' ') === 0) old.push(f);
  }
  old.sort(function (a, b) { return b.getName().localeCompare(a.getName()); });
  old.slice(KEEP_DAILY_BACKUPS).forEach(function (f) { f.setTrashed(true); });
}

function listBackups_(who) {
  var out = [];
  var all = backupFolder_().getFiles();
  while (all.hasNext()) {
    var f = all.next();
    if (f.getName().indexOf(who.name + ' – ') === 0) out.push({ id: f.getId(), name: f.getName().replace(/\.json$/, ''), when: f.getLastUpdated().getTime() });
  }
  out.sort(function (a, b) { return b.when - a.when; });
  return out.slice(0, 30);
}

function readBackup_(who, id) {
  var f = DriveApp.getFileById(id);
  var inFolder = f.getParents().hasNext() && f.getParents().next().getId() === backupFolder_().getId();
  if (!inFolder || f.getName().indexOf(who.name + ' – ') !== 0) throw new Error('Záloha nenalezena');
  return f.getBlob().getDataAsString('UTF-8');
}
