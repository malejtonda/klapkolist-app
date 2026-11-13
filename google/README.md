# Sending Klapkolist to Google Drive

Once this is set up, the app sends every shooting day to Google Sheets by itself (one Google Sheet
per project, one tab per day, already formatted) and keeps a backup of all its data in your Drive.
It takes about ten minutes, once. Your friend needs none of it: you just send them a code.

Do this on a computer, signed in to the Google account whose Drive should hold the files.

## 1. Make the settings sheet

1. Create a new Google Sheet and name it **Klapkolist – nastavení**.
2. In its menu choose **Extensions → Apps Script**.
3. Delete what is in the editor, paste the whole of [`Code.gs`](Code.gs), and save (the disk icon).
4. Click the gear (**Project Settings**) on the left and tick
   **Show "appsscript.json" manifest file in editor**.
5. Back in the editor (the `< >` icon), open **appsscript.json**, replace everything in it with
   [`appsscript.json`](appsscript.json), and save. This file tells Google exactly what the script
   may touch: your spreadsheets and the files the script creates itself, nothing else in your Drive.

## 2. Deploy the script

1. In the script editor: **Deploy → New deployment**.
2. Click the gear next to "Select type" and choose **Web app**.
3. Set **Execute as: Me** and **Who has access: Anyone**, then **Deploy**.
4. Google asks you to authorise the script. Because you wrote it yourself (well, pasted it), Google
   shows "Google hasn't verified this app": click **Advanced → Go to … (unsafe)** and **Allow**.
   If instead you get **"This app is blocked"** with no Advanced link, the script is still asking
   for your whole Drive: check step 5 of part 1 (the appsscript.json must be the one from here),
   then deploy again.
5. Copy the **Web app URL** (it ends in `/exec`).

"Anyone" does not mean anyone can use it: every request must carry one of the codes you hand out.

## 3. Connect your phone

1. Go back to the settings sheet and reload the page. A **Klapkolist** menu appears.
2. **Klapkolist → 1. Nastavit adresu skriptu…** and paste the Web app URL.
3. **Klapkolist → 2. Přidat telefon…**, type your name. A code starting with `KLAPKA1.` appears.
4. Get the code to your phone (mail it to yourself, Notes, AirDrop), copy it, and in the app open
   **Nastavení → Připojit Google Drive** and paste it.

The cloud in the app's header shows where your data is: ticked = everything is in Drive, arrow =
waiting to be sent (no signal, or just changed). Your files appear in the Drive folder **Klapkolist**.

## Adding a friend

**Klapkolist → 2. Přidat telefon…** again, with their name, and send them the code. Their projects
land in the same folder with their name added to the file name. The first phone you add is yours;
its files carry no name.

To take access away, delete that person's row in the tab **Telefony**.

## Making the sheets look the way you want

The look of every tab comes from the tab **ŠABLONA** in the settings sheet:

- row 1 is the header,
- row 2 is how the rows of every odd záběr look, row 3 the rows of every even záběr,
- column widths, frozen rows and columns are taken as they are.

Change colours, fonts, widths and the dropdowns there; new shooting-day tabs pick it up. To get the
coloured dropdown "chips" from your own sheet, copy one white and one grey row from it into rows 2
and 3 of ŠABLONA and clear their text. The dropdown values must be exactly
`PP`, `P-`, `P`, `P+`, `BEREME`. If you use chips, remove the conditional formatting that the
default template uses for colours (Format → Conditional formatting).

Keep the ten columns in their order. Property columns (objektiv…) are added after them and look like
the last column.

## Good to know

- While a shooting day is in progress, the phone rewrites its tab on every change; edits made in
  Google Sheets are overwritten. Mark the day **Dokončit den** in the app and the tab is sent one
  last time and then left alone, so you can edit it in Sheets.
- Deleting a day or project in the app does not delete anything in Drive.
- Backups are in the spreadsheet **Klapkolist – zálohy** in the Klapkolist folder: one row per phone
  per day for the last two weeks (the data is long, so it is split over many columns). Restore one in the app under **Nastavení → Obnovit ze zálohy na Drive**.
- After changing `Code.gs` later: **Deploy → Manage deployments → edit (pencil) → Version: New
  version → Deploy**. The URL and the codes stay the same.
