# Klapkolist

Klapkolist for shooting days: záběry, takes and notes from režie, kamera and zvuk.
A small web app that installs on the iPhone home screen and works without a signal.

## Put it on the iPhone

1. **Host it over HTTPS.** The easiest way is GitHub Pages: in this repository go to
   *Settings → Pages*, choose *Deploy from a branch*, branch `main`, folder `/ (root)`, and save.
   After a minute the app is at `https://<your-user>.github.io/klapkolist-app/`.
   (Pages on a private repository needs a paid GitHub plan; otherwise make the repository public.
   There are no secrets in it, and your data never leaves the phone.)
2. **Open that link in Safari** on the iPhone, tap *Share → Add to Home Screen*.
3. **Open it once from the home screen while online.** It then saves itself on the phone and
   opens and works with no signal from then on.

**Your data lives only on the phone**, inside the app. The home-screen app and a Safari tab do
not share data. If you already used Klapkolist in Safari, save a backup there first
(the ⤓ button on a shooting day) and restore it in the home-screen app (*Nastavení → Obnovit*).
Save a backup now and then anyway: deleting the app from the home screen deletes its data.

**Updates:** upload the changed files. The next time the app is opened with a signal it downloads
the new version in the background (all files, or nothing if the download fails), and the launch
after that runs it.

## How the code is organised

Plain HTML, CSS and JavaScript modules. No build step: the files in the repository are the app.

| File | What it holds |
| --- | --- |
| `index.html` | the page shell |
| `styles/` | `app.css` (the look), `fonts.css` (the self-hosted fonts in `fonts/`) |
| `sw.js` | the service worker that keeps the app on the phone; **lists every file** |
| `js/main.js` | start-up |
| `js/model.js` | the data (project → shooting days → záběry → takes) and every change to it |
| `js/sheet.js` | the table to and from Google Sheets (export and import) |
| `js/store.js` | loading and saving on the phone (`localStorage`, key `klapkolist_data`) |
| `js/dom.js`, `js/ui.js` | building the page: elements, icons, header, dialogs, menus |
| `js/nav.js` | screens and the back button |
| `js/keyboard.js` | keeping fields above the iPhone keyboard, the bar with Další / Skrýt |
| `js/suggest.js` | text fields with suggestions (notes, properties) |
| `js/screens/` | one file per screen; `day.js` + `take.js` are the shooting day |

When you add a file, add it to `FILES` in `sw.js` too (the tests check this).

## Tests

With Node.js 20 or newer: `npm test` (no install needed). To try the app on a computer:
`npm run serve` and open the address it prints.
