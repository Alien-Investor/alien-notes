"use strict";
/* app.js — Alien Notes. Grundgerüst aus dem App-Design-Kit (KIT-Abschnitte unverändert), Sentinel-Region und App-Logik aus Alien Pass v1.8.
   Synchron im <head> laden (Theme-Init vor dem ersten Render). CSP: script-src 'self' 'wasm-unsafe-eval' OHNE 'unsafe-inline' →
   KEINE Inline-Handler, auch nicht in erzeugtem Markup; alles über data-action/-arg/-change/-input/-enter/-showpass + Delegation unten.
   Nutzerdaten NUR per textContent/createElement ins DOM, nie per innerHTML. */

/* ===== KIT: Theme vor dem ersten Render (Schlüssel markenweit geteilt) ===== */
(function(){ try{ if(localStorage.getItem('alien-theme')==='soft') document.documentElement.setAttribute('data-theme','soft'); }catch(_){} })();

/* ============================================================
   Alien Notes — Offline-Notizen-App. Alles client-side,
   kein Netz, kein Tracking. Schwester von Alien Pass.
   ============================================================ */
const LS_KEY = 'ai-notes-vault';
const LANG_KEY = 'ai-notes-lang';
const APP_VERSION = '0.1';   // Anzeige in den Einstellungen; muss VERSION_NAME entsprechen (build-www.sh setzt es aus VERSION, roundtrip-test.mjs prüft es)

/* ===== KIT: i18n — Deutsch ist Quelle im HTML (data-i18n / data-i18n-html / data-i18n-ph), Englisch im I18N-Dict,
   dynamische Texte per tr(key,{params}) aus T {de,en}. ===== */
const I18N = {
  "tagline":"Notes · local & encrypted · offline",
  "setup.title":"Set up notes",
  "setup.intro":"Choose a strong passphrase. It encrypts all notes right on this device (Argon2id + AES-256-GCM). <strong>There is no backdoor and no reset</strong> — forget the passphrase and the notes are gone.",
  "lbl.passphrase":"Passphrase",
  "setup.ph1":"min. 12 characters, better a word sequence",
  "setup.repeat":"Repeat passphrase",
  "setup.suggest":"Suggest passphrase (6 dice words)",
  "setup.kdf":"Key derivation (Argon2id)",
  "setup.kdfLight":"Light — 32 MiB (older devices)",
  "setup.kdfStd":"Standard — 64 MiB",
  "setup.kdfStrong":"Strong — 128 MiB",
  "setup.create":"Create notes",
  "lock.title":"Unlock notes",
  "lock.unlock":"Unlock",
  "totp.title":"Second factor","totp.intro":"Enter the current 6-digit code from your <strong>Aegis 2FA manager</strong>.","totp.confirm":"Confirm",
  "btn.cancel":"Cancel",
  "tab.list":"Notes","tab.add":"New","tab.backup":"Backup","tab.settings":"Settings",
  "list.search":"Search notes …",
  "list.newTitle":"New note",
  "trash.title":"Trash",
  "trash.intro":"Deleted notes stay here for <strong>30 days</strong> and can be brought back, at most <strong>200</strong> at a time — once the trash is full, every further deletion destroys the oldest one straight away. After that the content is erased for good on the next unlock; the deletion marker for syncing remains until a year after the deletion. <strong>While a note sits here it is also part of every backup of this device.</strong> “Delete permanently” destroys it right away. <strong>The trash is device-local:</strong> the deletion travels to your other devices when merging, the content does not — you can only restore where you deleted.",
  "trash.back":"Back to the notes",
  "trash.emptyBtn":"Empty trash",
  "type.text":"Note","type.list":"Checklist",
  "f.title":"Title","f.titlePh":"Title (empty = first line of the text)",
  "f.cat":"Category","f.catPh":"e.g. Private, Work, Ideas — empty = none",
  "md.edit":"Text","md.view":"Preview",
  "f.body":"Text","f.bodyPh":"Write here …",
  "f.items":"Entries","f.itemAdd":"+ Line","f.sortDone":"Done to the bottom","f.resetDone":"Clear ticks","f.date":"Insert date",
  "cheat.title":"Markdown cheat sheet","cheat.hint":"type this → looks like this","cheat.hSrc":"# Heading","cheat.h":"Heading",
  "cheat.bSrc":"**bold**","cheat.b":"bold","cheat.iSrc":"*italic*","cheat.i":"italic","cheat.lSrc":"- item","cheat.l":"• item",
  "cheat.nSrc":"1. first","cheat.n":"1. first","cheat.cSrc":"- [ ] open","cheat.c":"☐ open","cheat.dSrc":"- [x] done","cheat.d":"☑ done",
  "cheat.codeSrc":"`code`","cheat.code":"code","cheat.example":"Insert example",
  "f.fav":"Favourite","f.pinned":"Pin to the top","f.md":"Markdown preview",
  "ed.done":"Done","ed.copy":"Copy","ed.delete":"Delete",
  "bk.title":"Encrypted backup",
  "bk.intro":"The <code>.notes</code> file holds all notes <strong>encrypted</strong> (Argon2id + AES-256-GCM) — it only opens with the passphrase. Sync it between devices e.g. via Syncthing; nothing is ever exported in plaintext.",
  "bk.export":"Create backup (.notes)",
  "bk.importTitle":"Import backup (merge)",
  "sn.title":"Import from Standard Notes","sn.pick":"Choose backup file",
  "sn.intro":"Reads a <strong>decrypted</strong> Standard Notes backup — the downloaded ZIP directly, or the file <code>Standard Notes Backup and Import File.txt</code> from it. Plain, Markdown, code, checklist, rich-text and Super notes become notes and checklists, the first tag becomes the category, the trash stays the trash. <strong>Authenticator entries are never imported</strong> (2FA secrets belong in Aegis). A confirmation shows what arrives before anything is written. <strong>Delete the decrypted file afterwards</strong> — it is plain text.",
  "help.hSn":"Moving from Standard Notes",
  "help.pSn":"In Standard Notes open the account menu → <strong>Backups</strong> → <strong>Download decrypted backup</strong>. Under Backup → “Import from Standard Notes” pick the downloaded ZIP directly (the app reads only the file <code>Standard Notes Backup and Import File.txt</code> inside it) or that file itself. Plain, Markdown, code and rich-text notes become text notes (Markdown with the Markdown view on), Super notes are translated into the small Markdown subset (tables as text lines, images and files as placeholders), checklists become checklists. The first tag becomes the category (“Parent/Child” for nested tags), pinned stays pinned, starred becomes a favourite, the trash lands in the trash with a fresh 30-day period. <strong>Never imported:</strong> Authenticator entries (2FA secrets — move them to Aegis by hand), spreadsheets, files. A second import of the same backup does not create duplicates; the newer version of a note wins. <strong>Afterwards delete the decrypted backup and the ZIP</strong> — they contain all notes in plain text.",
  "bk.importIntro":"Merges a <code>.notes</code> file into these notes: per note the <strong>newer change</strong> wins, deletions are applied. The file may use a different passphrase — your local one stays unchanged.",
  "bk.pick":"Choose .notes file","bk.filePass":"Passphrase of the file","bk.doImport":"Merge",
  "set.secTitle":"Locking","set.autolock":"Lock after inactivity","set.off":"Off",
  "set.al1":"1 minute","set.al2":"2 minutes","set.al5":"5 minutes","set.al15":"15 minutes",
  "set.bgLock":"Lock in background after","set.bg0":"immediately","set.bg60":"1 minute","set.bg300":"5 minutes","set.bg1800":"30 minutes","set.bgNever":"never",
  "set.lockNote":"By default the app does not lock after inactivity, and in the background only after 30 minutes. The background lock applies when you return after the chosen time; until then the key stays in memory. “Never” honestly means: no lock on return either — the key stays until the system ends the process or you quit the app; the file on the device is always encrypted anyway. Changes in the editor are saved as you type, before locking.",
  "set.clip":"Clear clipboard after","set.c15":"15 seconds","set.c30":"30 seconds","set.c60":"1 minute","set.cOff":"only on lock (off)",
  "set.clipNote":"Notes are not always secret, so this can be switched off. In the Android app copied text is flagged as “sensitive” — the system preview then hides it (Android 13+). The app clears the clipboard after the chosen time — also in the background, as long as Android has not frozen the app (usually after the second app switch); at the latest when you return to the app and when it locks. From Android 13 the system additionally clears the clipboard after about an hour, older versions do not.",
  "set.lockNow":"Lock now",
  "set.totpTitle":"Aegis hurdle (TOTP on unlock)",
  "set.totpOffIntro":"Extra hurdle on unlock: after the passphrase a 6-digit code from <strong>Aegis</strong> is required. <strong>Honestly:</strong> the key lives inside the notes file itself — whoever has the file <em>and</em> the passphrase does not need the code. The hurdle helps against someone who peeked at your passphrase and holds your unlocked phone.",
  "set.totpEnable":"Enable hurdle",
  "set.totpSetup1":"Add in <strong>Aegis</strong> — without a camera: “Copy key” → in Aegis “Add entry manually” → type <em>TOTP</em> → paste. Or copy the otpauth link and import it there.",
  "set.copyKey":"Copy key","set.otpauth":"Copy otpauth link",
  "set.totpSetup3":"Aegis now shows a 6-digit code. Enter it to confirm:","set.activate":"Activate",
  "set.totpOnText":"Hurdle active. Unlocking additionally asks for an Aegis code. It applies only to this app on this device — backups do not carry it.","set.totpDisable":"Disable hurdle",
  "lock.bio":"Unlock with fingerprint",
  "lock.pinLabel":"PIN","lock.pinUnlock":"Unlock with PIN","lock.orPass":"… or unlock with the passphrase:",
  "set.pinTitle":"Quick unlock with a PIN (until you quit)",
  "set.pinOffIntro":"After a lock through inactivity or the background a PIN is enough instead of the passphrase — until the app is quit, at most 24 hours. <strong>Honestly:</strong> the PIN never protects the notes file: six digits are a tiny search space; with the file's Argon2 parameters an ordinary CPU tries them all in a few hours, a single graphics card in roughly ten minutes — never enough to protect the file, each extra digit only multiplies the effort by ten. It only protects a copy of the data key that stays in memory when locking, wrapped under the PIN; none of it is ever stored. With a PIN, “locked” therefore no longer means “key wiped from memory”: whoever can read the memory of the running program holds the wrapped key and can guess the PIN offline — the three attempts are a rule in the code, not a cryptographic limit. Three wrong attempts discard the PIN, so do a passphrase change, the end of the 24 hours and quitting the app. “Lock now” (Ctrl+L) is the bolt: the passphrase once, afterwards the PIN applies again. If you share the computer with others or have unencrypted swap, leave the PIN off.",
  "set.pinNew":"PIN (6–12 digits)","set.pinRep":"Repeat PIN","set.pinPass":"Passphrase to confirm","set.pinEnable":"Set up PIN",
  "set.pinOnText":"Active. After a lock the PIN is enough — until the app is quit, at most 24 hours. “Lock now” (Ctrl+L) asks for the passphrase once, afterwards the PIN applies again. Three wrong attempts, a passphrase change, the end of the 24 hours or quitting the app discard it. Nothing of it is stored; the notes file stays unchanged.",
  "set.pinDisable":"Discard PIN",
  "d.pick":"Select a note on the left or create a new one",
  "help.hDesk":"Desktop version (Linux)",
  "help.lDesk":"<li><strong>No network — enforced by the system:</strong> the desktop app runs as a Flatpak without network permission; inside the sandbox there is no connection to the outside. On top of that the app itself blocks every connection. Check: <code>flatpak info --show-permissions org.alieninvestor.notes</code> — there is no <code>network</code>.</li><li><strong>Notes file:</strong> <code>~/.var/app/org.alieninvestor.notes/data/alien-notes/notes.ainv</code> — encrypted, readable only by you, rewritten completely on every change (never half-written). The app sees no other files: backup and import go through the system file dialog, which only grants the chosen file.</li><li><strong>Clipboard:</strong> copied notes are marked as a password for KDE — Klipper keeps them out of its history. Other clipboard managers may ignore the mark. The app clears the clipboard after the set time, also in the background and on quit, but only if its own copy is still there. The same applies to text you select with the mouse in the app (on Linux instantly pasteable with a middle click); Ctrl+C and Ctrl+X in the app copy like the copy button.</li><li><strong>Syncing with the phone:</strong> on the phone “Create backup” into a Syncthing folder, on the desktop import it under Backup — and the other way round. See “Backup &amp; Sync”.</li><li><strong>Locking:</strong> after inactivity and when the window has been minimised or hidden for longer than the chosen time — with “immediately” right when minimising (setting “Lock in background”; “background” here means minimised or hidden; switching to another window does not count, but it clears typed passphrases and PINs). On <strong>screen lock and suspend the desktop app does not lock by itself</strong> — inside the Flatpak it is not told. So use the system lock and, if you want, a short inactivity lock; Ctrl+L locks immediately.</li><li><strong>Keyboard:</strong> Ctrl+F search, Ctrl+N new note, Ctrl+S finish the note (save and close), Ctrl+L lock, Esc closes. From about 1000 pixels window width, list and note sit side by side.</li><li><strong>Honest limits:</strong> the desktop app ships its own browser engine (Electron) — security updates for it only arrive with a new app version, not through the system. No protection against screenshots (Linux has no way to block them). Under X11 every running program can read keyboard and clipboard; Wayland separates programs better. No fingerprint.</li>",
  "help.hPin":"Quick unlock with a PIN (desktop)",
  "help.pPin":"Optionally a PIN replaces the passphrase after a lock (Settings → Quick unlock with a PIN). <strong>How it works:</strong> when you set it up, the app wraps a copy of the data key under a key derived from your PIN (Argon2id, same parameters as the notes file) and keeps that copy <em>in memory only</em>. A lock through inactivity or the background clears the session as before, but that wrapped copy stays; the PIN opens it again. Nothing of it is written to disk, the notes file stays unchanged and backups carry none of it. Quitting the app removes the copy, and after 24 hours at the latest the app discards it itself: the next start asks for the passphrase. <strong>What it costs:</strong> six digits are a tiny search space. With the file's Argon2 parameters an ordinary CPU tries them all in a few hours, a single graphics card in roughly ten minutes — never enough to protect the file, each extra digit only multiplies the effort by ten. The PIN only protects that copy in memory. With a PIN, “locked” therefore no longer means “key wiped from memory”: whoever can read the memory of the running program holds the wrapped key and can try PINs offline — the three attempts are a rule in the code, not a cryptographic limit. <strong>What discards the PIN:</strong> three wrong attempts, a passphrase change, deleting the notes, an altered or swapped notes file, the end of the 24 hours, and quitting the app. <strong>The deliberate bolt:</strong> “Lock now” (Ctrl+L) keeps the PIN but demands the passphrase once — afterwards the PIN applies again. If you share the computer with others or have unencrypted swap, leave the PIN off.",
  "set.bioTitle":"Fingerprint unlock (Android)",
  "set.bioOffIntro":"Unlocks the notes with the device fingerprint instead of the passphrase. <strong>Honestly:</strong> a fingerprint is convenient, but it can be forced — at a border, or by someone holding your hand. Android binds the key to every strong biometric of the device: where a strong face unlock is enrolled (some stock Pixels; not on GrapheneOS), that opens the notes too, after a confirmation tap. The passphrase stays the real protection: it is required after every restart of the phone (as long as the box below is unticked), after a passphrase change and as soon as a new fingerprint is enrolled in the system. Technically a random key wrapped by the Android keystore unlocks the data key; nothing of it enters backups.",
  "set.bioPass":"Passphrase to confirm",
  "set.bioEnable":"Enable fingerprint",
  "set.bioKeep":"Also unlock with the fingerprint after a restart of the phone (off by default)",
  "set.bioKeepNote":"By default the app asks for the passphrase once after every restart. That protects in exactly one case: someone knows or forces your device PIN and can force your finger — a restart then helps, because the app asks for the passphrase afterwards. GrapheneOS reboots by default once the phone stays locked for 18 hours in a row (adjustable from 10 minutes to 72 hours); whoever sets that counter short or often leaves the phone lying around types the passphrase accordingly often. With this box ticked the fingerprint keeps working across a restart. Unchanged: passphrase after a passphrase change, a warning when a new fingerprint is enrolled in the system, “Lock now” as the bolt. Changeable only by disabling and enabling again.",
  "set.bioOnText":"Active. The fingerprint is enough to unlock — until the next restart, passphrase change or new fingerprint in the system. “Lock now” is the deliberate bolt: the next start then requires the passphrase, afterwards the fingerprint works again. Applies to this device only.",
  "set.bioOnTextKeep":"Active, across a restart of the phone as well — chosen that way when enabling. The fingerprint is enough to unlock until the passphrase is changed or a new fingerprint is enrolled in the system. “Lock now” is the deliberate bolt: the next start then requires the passphrase, afterwards the fingerprint works again. Changing this is only possible by disabling and enabling again. Applies to this device only.",
  "set.bioDisable":"Disable fingerprint",
  "set.secureTitle":"Screenshots and app switcher",
  "set.secure":"Block screenshots and hide the preview in the app switcher (on by default)",
  "set.secureNote":"On: Android refuses screenshots of the app; in screen recordings and when casting it stays black, and the app switcher shows an empty card without content. Off: you can take screenshots of your notes — the preview in the app switcher then shows their content; a preview captured when leaving stays until you return to the app, even if it has locked meanwhile. Locked and during setup the protection is always on. No protection against accessibility apps, root or a camera.",
  "help.hAegis":"Aegis hurdle on unlock",
  "help.pAegis":"Optionally the app asks for an Aegis code after the passphrase (Settings → Aegis hurdle). <strong>What it does:</strong> someone who peeked at your passphrase and holds your unlocked phone cannot get in without your Aegis app. <strong>What it does not do:</strong> the TOTP key lives inside the notes file itself. Whoever owns the file <em>and</em> the passphrase decrypts it outside the app — the format is openly documented. A real second factor needs a party that enforces it. For a local file the passphrase remains the only cryptographic protection; make it long.",
  "help.hBio":"Fingerprint unlock",
  "help.pBio":"Optionally the device fingerprint unlocks the notes (Settings → Fingerprint, Android app only). <strong>How it works:</strong> the data key is additionally wrapped under a random key; the Android keystore holds that key and releases it only after a strong fingerprint, freshly each time. The notes file itself stays unchanged and backups carry none of it. <strong>What it costs:</strong> a fingerprint is not a secret. It can be forced — by someone guiding your hand, or at a border; the passphrase in your head cannot. That is why the app demands the passphrase after every restart of the phone (unless you ticked “also after a restart” when enabling), after a passphrase change and as soon as a new fingerprint is enrolled in the system. If a fingerprint was newly enrolled, the app does not set access up again by itself but shows a warning until you read it or deliberately re-enable it. The restart rule is a rule in the code, not a cryptographic guarantee. <strong>The deliberate bolt:</strong> “Lock now” in Settings means the next start requires the passphrase — no fingerprint button, no prompt; afterwards the fingerprint works again without re-enabling. Use it before a border, before handing the phone over, whenever a finger could be forced.",
  "set.cpTitle":"Change passphrase","set.cpCur":"Current passphrase","set.cpNew":"New passphrase","set.cpRepeat":"Repeat","set.cpBtn":"Change",
  "set.cpNote":"Changing the passphrase also rotates the internal data key. Backups exported earlier keep their old passphrase.",
  "set.themeTitle":"Appearance","set.themeDark":"Black (Neon)","set.themeSoft":"Soft (Navy)",
  "set.dangerTitle":"Danger zone","set.wipe":"Delete notes on this device",
  "set.wipeNote":"Removes the encrypted notes on <em>this</em> device only. Exported <code>.notes</code> files remain. No secure wiping of storage — the encryption takes care of that.",
  "foot.line1":"Alien Investor · Alien Notes · 100 % local · no cloud · no telemetry",
  "foot.line2":"Encryption: Argon2id · AES-256-GCM · WebCrypto",
  "foot.donate":"Recharge energy · Donate",
  "help.closeX":"Close ✕",
  "help.title":"Manual",
  "help.h1":"What is Alien Notes?",
  "help.p1":"A <strong>local, encrypted notes app</strong> for notes and checklists. Runs fully <strong>offline</strong> — no cloud, no server, no telemetry, no account. The Android app does not even have an internet permission. Your notes never leave the device in plaintext.",
  "help.warn":"⚠ There is no reset and no backdoor. Forget your passphrase and the notes are gone for good. Make regular backups and keep the passphrase safe.",
  "help.h2":"First steps",
  "help.l2":"<li><strong>Choose a passphrase</strong> — at least 12 characters, better six dice words (the suggest button builds them from the EFF list). Write it down and store it safely.</li><li><strong>+</strong> creates a note. The title may stay empty — the first line of the text serves as the title. There is no save button: the app saves while you type and when you leave the note.</li><li><strong>Checklists:</strong> switch a note to “Checklist” — every line becomes an entry with a box; “Done to the bottom” sorts ticked entries down. Switching back turns the entries into “- [ ] …” or “- [x] …” lines.</li><li><strong>Categories</strong> work like folders: type one freely (suggestions from existing ones). The list filters via the chips at the top; the ★ chip shows favourites only. Pinned notes always sit at the top.</li><li>The search covers title, text, checklist entries and category.</li>",
  "help.h3":"Markdown preview",
  "help.p3":"Every text note (not checklists) has a “Markdown preview” switch. Editing always stays the plain text field; the preview renders a small subset: headings (<code>#</code> to <code>###</code>), <strong>bold</strong> (<code>**…**</code>), <em>italic</em> (<code>*…*</code>), lists (<code>-</code>, <code>1.</code> — numbered ones always start at 1), boxes (<code>- [ ]</code>, <code>- [x]</code>), code (<code>`…`</code>, ``` blocks or 4 spaces of indentation — so no indented sub-items), rules (<code>---</code>). Links are deliberately shown as text, never clickable — the app has no network anyway.",
  "help.h4":"Locking",
  "help.p4":"Unlike a password manager, the notes stay open by default: no lock after inactivity, and in the background only after 30 minutes. Both can be set under Settings, up to “never”. The background lock applies when you return after the chosen time; until then the key stays in memory. “Never” honestly means: no lock on return either — the key stays until the system ends the process or you quit the app. The file on the device is always encrypted, whatever you choose. “Lock now” clears the key and everything on screen immediately. The Android app forbids screenshots by default and hides the preview in the app switcher (can be switched off in Settings).",
  "help.hTrash":"Trash",
  "help.pTrash":"Deleted notes go to the trash for <strong>30 days</strong> — the icon right of the <strong>+</strong> in the search row; the number next to it says how much is in there. It shows only <strong>title, type and date of deletion</strong>. <strong>The trash holds 200 notes</strong>; once it is full the next deletion destroys the oldest one immediately and for good, and the confirmation tells you which one. <strong>Honestly:</strong> while a note sits in the trash it is also part of every backup of this device. To get rid of something right away use “Delete permanently” or “Empty trash”. <strong>The trash is device-local:</strong> a deletion travels to your other devices when merging, the <em>content</em> does not. So you can only restore on the device where you deleted.",
  "help.h7":"Backup & sync",
  "help.l7":"<li><strong>Create backup</strong> writes a <code>.notes</code> file (encrypted with your passphrase). It can safely go into Syncthing, onto a stick or into a backup.</li><li><strong>Import</strong> merges: per note the newer change wins, deletions are carried over (for one year). The file may use a different passphrase — your local one stays.</li><li>With two devices: export on both regularly and import the other's backup. Both sides end up at the same state.</li><li>Alien Pass and Alien Notes use the same file format family but separate files: a <code>.vault</code> file is refused here, a <code>.notes</code> file there — they never share keys.</li>",
  "help.h8":"Clipboard",
  "help.l8":"<li>“Copy” puts the whole note into the clipboard (title, text or checklist as “- [x] …” lines).</li><li>The app clears the clipboard after the chosen time (default 30 s) and when it locks. Notes are not always secret, so this can be switched off in Settings.</li><li>The Android app flags copied content as <strong>sensitive</strong>: the system preview shown when copying hides the content (Android 13+).</li>",
  "help.h9":"Security in detail",
  "help.l9":"<li><strong>Key derivation:</strong> Argon2id (default 64 MiB, 3 passes) from your passphrase — memory-hard, so expensive for GPU attacks on a stolen file.</li><li><strong>Encryption:</strong> AES-256-GCM (WebCrypto). A random data key encrypts the notes; the passphrase only wraps that key. The file header is authenticated too — tampering is detected.</li><li><strong>Device:</strong> the Android app requests exactly two normal permissions, both for the fingerprint sensor: USE_BIOMETRIC and USE_FINGERPRINT (the latter only up to Android 8.1, brought in by the AndroidX biometric library). No internet, no storage, no contacts. Besides these the APK only carries the AndroidX-generated signature permission DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION, which grants nothing. It forbids screenshots and app-switcher preview (FLAG_SECURE, can be switched off) and excludes itself from cloud, adb and device-to-device backups.</li><li><strong>Third-party code:</strong> only the Argon2 library hash-wasm (MIT) and the EFF word list, both bundled and hash-checked in the build. No CDN, no tracker.</li><li><strong>Limits:</strong> no images or attachments, no sharing of plaintext, no per-note passwords. A passphrase cannot be recovered.</li>"
};
const T = {
  "err.setupShort":{de:"Mindestens 12 Zeichen.",en:"At least 12 characters."},
  "err.setupMismatch":{de:"Die Passphrasen stimmen nicht überein.",en:"Passphrases do not match."},
  "err.setupFailed":{de:"Einrichten fehlgeschlagen (WebCrypto/WASM nicht verfügbar?).",en:"Setup failed (WebCrypto/WASM unavailable?)."},
  "err.wrongPass":{de:"Falsche Passphrase oder beschädigte Datei.",en:"Wrong passphrase or damaged file."},
  "err.wait":{de:"Zu viele Fehlversuche — bitte {s} s warten.",en:"Too many failed attempts — wait {s} s."},
  "err.fileFormat":{de:"Keine gültige Alien-Notes-.notes-Datei (eine .vault-Datei von Alien Pass wird hier nicht angenommen).",en:"Not a valid Alien Notes .notes file (an Alien Pass .vault file is not accepted here)."},
  "err.fileNewer":{de:"Die Datei stammt aus einer neueren App-Version. Bitte App aktualisieren.",en:"The file comes from a newer app version. Please update the app."},
  "err.fileBounds":{de:"Die Datei verlangt unzulässige Argon2-Parameter — Import abgelehnt.",en:"The file demands out-of-bounds Argon2 parameters — import refused."},
  "err.fileLarge":{de:"Datei zu groß.",en:"File too large."},
  "err.fileFull":{de:"⚠ Notizen-Datei würde über {m} MB wachsen — Änderung verworfen. Notizen kürzen oder Papierkorb leeren.",en:"⚠ Notes file would grow beyond {m} MB — change discarded. Shorten notes or empty the trash."},
  "toast.fileOver":{de:"Notizen-Datei über {m} MB: bis zum Aufräumen werden nur noch Änderungen gespeichert, die sie nicht weiter vergrößern (Löschen, Haken, kleine Korrekturen).",en:"Notes file over {m} MB: until you tidy up, only changes that do not grow it further are saved (deleting, ticks, small edits)."},
  "bk.tooBig":{de:" ⚠ Über {m} MB — lässt sich erst wieder einspielen, wenn die Notizen-Datei kleiner ist (Notizen löschen, Papierkorb leeren).",en:" ⚠ Over {m} MB — can only be imported again once the notes file is smaller (delete notes, empty the trash)."},
  "err.tooMany":{de:"Zu viele Notizen (max. 5.000).",en:"Too many notes (max. 5,000)."},
  "err.saveFailed":{de:"⚠ Speichern fehlgeschlagen — Änderung verworfen (Speicher voll?).",en:"⚠ Save failed — change discarded (storage full?)."},
  "err.storeRead":{de:"Notizen-Datei nicht lesbar — es wurde nichts überschrieben. Rechte und Datenträger prüfen, dann neu starten.",en:"Notes file not readable — nothing was overwritten. Check permissions and disk, then restart."},
  "err.cpShort":{de:"Neue Passphrase: mindestens 12 Zeichen.",en:"New passphrase: at least 12 characters."},
  "err.cpMismatch":{de:"Die neuen Passphrasen stimmen nicht überein.",en:"New passphrases do not match."},
  "err.cpWrong":{de:"Aktuelle Passphrase falsch.",en:"Current passphrase is wrong."},
  "err.totp6":{de:"Bitte den 6-stelligen Code eingeben.",en:"Please enter the 6-digit code."},
  "err.totpSetupBad":{de:"Code stimmt nicht. In Aegis prüfen.",en:"Code doesn't match. Check in Aegis."},
  "err.itemsMax":{de:"Höchstens {n} Einträge je Checkliste.",en:"At most {n} entries per checklist."},
  "busy.checking":{de:"Prüfe…",en:"Checking…"},
  "what.secret":{de:"Schlüssel",en:"Key"},"what.otpauth":{de:"otpauth-Link",en:"otpauth link"},
  "confirm.totpDisable":{de:"Aegis-Hürde wirklich deaktivieren?",en:"Really disable the Aegis hurdle?"},
  "toast.totpOn":{de:"Aegis-Hürde aktiv",en:"Aegis hurdle active"},"toast.totpOff":{de:"Aegis-Hürde deaktiviert",en:"Aegis hurdle disabled"},
  "toast.passChangedBio":{de:"Passphrase geändert, Datenschlüssel erneuert — Fingerabdruck deaktiviert, in den Einstellungen neu aktivieren",en:"Passphrase changed, data key rotated — fingerprint disabled, re-enable it in Settings"},
  "bio.promptTitle":{de:"Alien Notes",en:"Alien Notes"},
  "bio.promptUnlock":{de:"Notizen entsperren",en:"Unlock notes"},
  "bio.promptEnroll":{de:"Fingerabdruck-Entsperren aktivieren",en:"Enable fingerprint unlock"},
  "bio.promptRearm":{de:"Nach dem Neustart: Fingerabdruck neu bestätigen",en:"After restart: confirm fingerprint again"},
  "bio.usePass":{de:"Passphrase",en:"Passphrase"},
  "bio.afterReboot":{de:"Nach dem Neustart einmal die Passphrase eingeben — danach gilt der Fingerabdruck wieder.",en:"After the restart, enter the passphrase once — the fingerprint works again afterwards."},
  "bio.reset":{de:"Fingerabdruck-Entsperren wurde zurückgesetzt (neuer Fingerabdruck im System oder Schlüssel ungültig). In den Einstellungen neu aktivieren.",en:"Fingerprint unlock was reset (new fingerprint enrolled or key invalid). Re-enable it in Settings."},
  "bio.lockout":{de:"Zu viele Fehlversuche — der Sensor ist vorübergehend gesperrt. Bitte Passphrase.",en:"Too many attempts — the sensor is temporarily locked. Use the passphrase."},
  "bio.cancelled":{de:"Fingerabdruck abgebrochen — Entsperren bleibt bei der Passphrase",en:"Fingerprint cancelled — unlocking stays with the passphrase"},
  "bio.failed":{de:"Fingerabdruck nicht eingerichtet (Fehler im Keystore)",en:"Fingerprint not set up (keystore error)"},
  "bio.rearmRefused":{de:"Fingerabdruck NICHT wieder aktiviert: Seit dem Einrichten wurde im System ein Fingerabdruck registriert. Warst du das nicht selbst, prüfe die Fingerabdrücke in den Android-Einstellungen. Neu aktivieren geht in den Einstellungen.",en:"Fingerprint NOT re-enabled: a fingerprint was enrolled in the system since setup. If that was not you, check the fingerprints in Android settings. You can re-enable it in Settings."},
  "bio.alert":{de:"⚠ Fingerabdruck-Entsperren wurde abgeschaltet: Seit dem Einrichten wurde in Android ein Fingerabdruck neu registriert. Warst du das nicht selbst, prüfe sofort die Fingerabdrücke in den Android-Einstellungen (Sicherheit) und entferne fremde. Danach kannst du den Fingerabdruck in den Einstellungen bewusst neu aktivieren.",en:"⚠ Fingerprint unlock was switched off: a fingerprint was newly enrolled in Android since setup. If that was not you, check the fingerprints in Android settings (Security) right away and remove unknown ones. Afterwards you can deliberately re-enable fingerprint unlock in Settings."},
  "bio.alertOk":{de:"Gelesen",en:"Got it"},
  "bio.rearmNeeded":{de:"Fingerabdruck bitte einmal in den Einstellungen neu aktivieren — der Slot stammt aus einer Zeit ohne Kanarien-Schlüssel.",en:"Please re-enable fingerprint unlock once in Settings — the slot predates the canary key."},
  "bio.on":{de:"Fingerabdruck-Entsperren aktiv",en:"Fingerprint unlock active"},"bio.off":{de:"Fingerabdruck-Entsperren deaktiviert",en:"Fingerprint unlock disabled"},
  "bio.rearmed":{de:"Fingerabdruck wieder aktiv",en:"Fingerprint active again"},
  "bio.naEnrolled":{de:"Im System ist kein Fingerabdruck eingerichtet (Android-Einstellungen → Sicherheit).",en:"No fingerprint enrolled in the system (Android settings → Security)."},
  "bio.naHardware":{de:"Dieses Gerät hat keinen Fingerabdrucksensor der Klasse „stark“ (Android-Einstufung).",en:"This device has no fingerprint sensor of Android's 'strong' class."},
  "bio.naNow":{de:"Fingerabdrucksensor derzeit nicht verfügbar.",en:"Fingerprint sensor currently unavailable."},
  "bio.wrapMismatch":{de:"Der Passphrase-Schlüssel der Notizen-Datei wurde verändert — Fingerabdruck verweigert. Bitte Passphrase; falls sie nicht mehr passt, das letzte Backup zurückspielen.",en:"The notes file's passphrase key was altered — fingerprint refused. Use the passphrase; if it no longer works, restore the last backup."},
  "bio.aborted":{de:"Fingerabdruck nicht aktiviert — Vorgang durch Sperre oder Passphrase-Wechsel abgebrochen",en:"Fingerprint not enabled — interrupted by lock or passphrase change"},
  "bio.busy":{de:"Bitte erst den laufenden Fingerabdruck-Vorgang abschließen.",en:"Finish the pending fingerprint step first."},
  "bio.held":{de:"Bewusst gesperrt: Diesmal ist die Passphrase nötig — danach gilt der Fingerabdruck wieder.",en:"Locked deliberately: the passphrase is required this time — the fingerprint works again afterwards."},
  "bio.tampered":{de:"Der Fingerabdruck-Slot wurde verändert — Fingerabdruck verworfen. Bitte die Passphrase eingeben und den Fingerabdruck in den Einstellungen bewusst neu aktivieren.",en:"The fingerprint slot was altered — fingerprint discarded. Enter the passphrase and deliberately re-enable the fingerprint in Settings."},
  "confirm.bioDisable":{de:"Fingerabdruck-Entsperren wirklich deaktivieren?",en:"Really disable fingerprint unlock?"},
  "pin.format":{de:"Die PIN muss aus {a} bis {b} Ziffern bestehen.",en:"The PIN must be {a} to {b} digits."},
  "pin.mismatch":{de:"Die beiden PINs stimmen nicht überein.",en:"The two PINs do not match."},
  "pin.wrong":{de:"Falsche PIN — noch {n} Versuch(e), danach ist die PIN verworfen.",en:"Wrong PIN — {n} attempt(s) left, then the PIN is discarded."},
  "pin.dropped":{de:"Drei Fehlversuche: Das Schnell-Entsperren per PIN wurde verworfen. Bitte die Passphrase eingeben; danach lässt sich in den Einstellungen eine neue PIN einrichten.",en:"Three wrong attempts: quick unlock with a PIN was discarded. Enter the passphrase; afterwards you can set up a new PIN in Settings."},
  "pin.fileChanged":{de:"Die Notizen-Datei hat sich geändert — die PIN gilt nicht mehr. Bitte die Passphrase eingeben.",en:"The notes file has changed — the PIN no longer applies. Please enter the passphrase."},
  "pin.on":{de:"Schnell-Entsperren per PIN aktiv — bis die App beendet wird, höchstens 24 Stunden",en:"Quick unlock with a PIN active — until the app is quit, at most 24 hours"},
  "pin.off":{de:"PIN verworfen — beim nächsten Entsperren gilt die Passphrase",en:"PIN discarded — the next unlock needs the passphrase"},
  "pin.busy":{de:"Bitte erst den laufenden PIN-Vorgang abschließen.",en:"Finish the pending PIN step first."},
  "pin.expired":{de:"Die PIN ist abgelaufen (24 Stunden) — bitte die Passphrase eingeben; danach lässt sich eine neue PIN einrichten.",en:"The PIN has expired (24 hours) — please enter the passphrase; afterwards you can set up a new PIN."},
  "pin.failed":{de:"PIN konnte nicht eingerichtet werden.",en:"The PIN could not be set up."},
  "pin.aborted":{de:"PIN nicht eingerichtet — Vorgang durch Sperre oder Passphrase-Wechsel abgebrochen",en:"PIN not set up — interrupted by lock or passphrase change"},
  "confirm.pinDisable":{de:"Schnell-Entsperren per PIN wirklich verwerfen? Beim nächsten Entsperren wird die Passphrase verlangt.",en:"Really discard quick unlock with a PIN? The next unlock will require the passphrase."},
  "pw.toggle":{de:"Anzeigen / verbergen",en:"Show / hide"},
  "busy.decrypting":{de:"Entschlüssele…",en:"Decrypting…"},
  "busy.creating":{de:"Erzeuge Schlüssel…",en:"Deriving key…"},
  "busy.changing":{de:"Ändere…",en:"Changing…"},
  "bench.run":{de:"Messe Argon2-Dauer auf diesem Gerät…",en:"Benchmarking Argon2 on this device…"},
  "bench.done":{de:"Standard (64 MiB) braucht hier ~{ms} ms je Entsperren.",en:"Standard (64 MiB) takes ~{ms} ms per unlock here."},
  "bench.light":{de:"Standard (64 MiB) braucht hier ~{ms} ms — „Leicht“ vorgewählt.",en:"Standard (64 MiB) takes ~{ms} ms here — “Light” preselected."},
  "bench.strong":{de:"Standard (64 MiB) braucht hier nur ~{ms} ms — „Stark“ vorgewählt.",en:"Standard (64 MiB) takes only ~{ms} ms here — “Strong” preselected."},
  "toast.vaultCreated":{de:"Notizen eingerichtet — Passphrase sicher aufbewahren!",en:"Notes set up — keep the passphrase safe!"},
  "toast.autolocked":{de:"Automatisch gesperrt",en:"Locked automatically"},
  "toast.saved":{de:"Gespeichert",en:"Saved"},
  "toast.trashed":{de:"In den Papierkorb gelegt — {d} Tage wiederherstellbar",en:"Moved to the trash — restorable for {d} days"},
  "toast.restored":{de:"Notiz wiederhergestellt",en:"Note restored"},
  "toast.purged":{de:"Notiz endgültig gelöscht",en:"Note permanently deleted"},
  "toast.trashEmptied":{de:"Papierkorb geleert",en:"Trash emptied"},
  "toast.discarded":{de:"Leere Notiz verworfen",en:"Empty note discarded"},
  "toast.exampleBusy":{de:"Das Beispiel passt nur in eine leere Notiz",en:"The example only fits into an empty note"},
  "toast.bodyFull":{de:"Die Notiz ist voll ({n} Zeichen)",en:"The note is full ({n} characters)"},
  "confirm.resetDone":{de:"Alle {n} Haken entfernen?",en:"Remove all {n} ticks?"},
  "cheat.exampleTitle":{de:"Markdown-Beispiel",en:"Markdown example"},
  "cheat.exampleText":{de:"# Markdown-Beispiel\n\nDas ist **fett**, das *kursiv* und das `Code`.\n\n## Liste\n\n- ein Punkt\n- noch ein Punkt\n\n1. erster\n2. zweiter\n\n## Kästchen\n\n- [ ] offen\n- [x] erledigt\n\n---\n\n```\nCode-Block\nzweite Zeile\n```\n\nLinks bleiben Text: https://alien-investor.org\nÜber „Text“ siehst du die Quelle dieser Notiz.",en:"# Markdown example\n\nThis is **bold**, this *italic* and this `code`.\n\n## List\n\n- one item\n- another item\n\n1. first\n2. second\n\n## Boxes\n\n- [ ] open\n- [x] done\n\n---\n\n```\ncode block\nsecond line\n```\n\nLinks stay text: https://alien-investor.org\nUse “Text” to see the source of this note."},
  "toast.suggest":{de:"Vorschlag eingetragen — jetzt aufschreiben!",en:"Suggestion filled in — write it down now!"},
  "toast.wordsMissing":{de:"Wortliste fehlt — Würfelwörter nicht verfügbar",en:"Word list missing — dice words unavailable"},
  "toast.noEntry":{de:"Keine Notiz gewählt",en:"No note selected"},
  "toast.passChanged":{de:"Passphrase geändert, Datenschlüssel erneuert",en:"Passphrase changed, data key rotated"},
  "trash.btn":{de:"Papierkorb",en:"Trash"},
  "trash.count":{de:"{n} im Papierkorb — jeweils {d} Tage ab dem Löschen wiederherstellbar (höchstens {m}).",en:"{n} in the trash — each restorable for {d} days after deletion (at most {m})."},
  "trash.countFull":{de:"{n} im Papierkorb — das ist die Höchstzahl. Jede weitere Löschung vernichtet die älteste sofort und endgültig.",en:"{n} in the trash — that is the maximum. Every further deletion destroys the oldest one immediately and for good."},
  "trash.empty":{de:"Der Papierkorb ist leer.",en:"The trash is empty."},
  "trash.untitled":{de:"(ohne Titel)",en:"(untitled)"},
  "trash.deletedOn":{de:"gelöscht am {d}",en:"deleted on {d}"},
  "trash.restore":{de:"Wiederherstellen",en:"Restore"},
  "trash.purge":{de:"Endgültig löschen",en:"Delete permanently"},
  "copy.done":{de:"{what} kopiert · wird in {s} s geleert",en:"{what} copied · cleared in {s} s"},
  "copy.doneNoClear":{de:"{what} kopiert",en:"{what} copied"},
  "copy.manual":{de:"Kopieren nicht möglich — bitte manuell markieren",en:"Copy not possible — please select manually"},
  "copy.empty":{de:"Nichts zu kopieren",en:"Nothing to copy"},
  "what.note":{de:"Notiz",en:"Note"},"what.sel":{de:"Markierung",en:"Selection"},
  "chip.all":{de:"Alle",en:"All"},"chip.none":{de:"Ohne Kategorie",en:"No category"},"chip.fav":{de:"★ Favoriten",en:"★ Favourites"},
  "pill.list":{de:"Liste",en:"List"},"pill.pin":{de:"Oben",en:"Pinned"},
  "list.empty":{de:"Noch keine Notizen.\nTippe auf + für die erste Notiz.",en:"No notes yet.\nTap + for the first note."},
  "list.noMatch":{de:"Keine Treffer.",en:"No matches."},
  "list.count1":{de:"1 Notiz",en:"1 note"},
  "list.count":{de:"{n} Notizen",en:"{n} notes"},
  "list.countOf":{de:"{n} von {t} Notizen",en:"{n} of {t} notes"},
  "list.progress":{de:"{d} von {n} erledigt",en:"{d} of {n} done"},
  "list.itemsEmpty":{de:"Leere Checkliste",en:"Empty checklist"},
  "add.titleNew":{de:"Neue Notiz",en:"New note"},
  "add.titleEdit":{de:"Notiz bearbeiten",en:"Edit note"},
  "add.titleNewList":{de:"Neue Checkliste",en:"New checklist"},
  "add.titleEditList":{de:"Checkliste bearbeiten",en:"Edit checklist"},
  "ed.count":{de:"{c} Zeichen · {w} Wörter",en:"{c} characters · {w} words"},
  "ed.items":{de:"{d} von {n} erledigt",en:"{d} of {n} done"},
  "ed.meta":{de:"Angelegt {c} · Geändert {u}",en:"Created {c} · Updated {u}"},
  "ed.itemPh":{de:"Eintrag",en:"Entry"},"ed.itemDel":{de:"Eintrag entfernen",en:"Remove entry"},
  "confirm.toList":{de:"In eine Checkliste umwandeln? Jede Zeile des Textes wird ein Eintrag (leere Zeilen fallen weg, Zeilen über {c} Zeichen werden gekürzt, mehr als {n} Zeilen werden abgeschnitten). Einrückung und mehrfache Leerzeichen fallen weg; Überschriften, Fett und andere Auszeichnung bleiben nur als Zeichen stehen.",en:"Convert to a checklist? Every line of the text becomes an entry (empty lines are dropped, lines over {c} characters are shortened, more than {n} lines are cut). Indentation and repeated spaces are lost; headings, bold and other markup remain only as plain characters."},
  "confirm.toText":{de:"In eine Textnotiz umwandeln? Die Einträge werden Zeilen mit „- [ ]“- bzw. „- [x]“-Kästchen; erledigte Haken bleiben nur als Text.",en:"Convert to a text note? The entries become lines with “- [x]” boxes; ticks survive only as text."},
  "confirm.delete":{de:"„{t}“ in den Papierkorb legen? {d} Tage wiederherstellbar, danach endgültig. (Wird beim Sync auf andere Geräte übernommen.)",en:"Move “{t}” to the trash? Restorable for {d} days, then gone for good. (Deletion syncs to other devices.)"},
  "confirm.deleteFull":{de:"„{t}“ in den Papierkorb legen? Der Papierkorb ist voll ({m}) — dabei wird „{o}“ (gelöscht am {od}) sofort und endgültig vernichtet. (Die Löschung wird beim Sync übernommen, der Papierkorb-Inhalt bleibt auf diesem Gerät.)",en:"Move “{t}” to the trash? The trash is full ({m}) — doing so destroys “{o}” (deleted on {od}) immediately and for good. (The deletion syncs to other devices, the trash content stays on this one.)"},
  "confirm.purge":{de:"„{t}“ endgültig löschen? Das lässt sich nicht rückgängig machen.",en:"Delete “{t}” permanently? This cannot be undone."},
  "confirm.emptyTrash":{de:"Alle {n} Notizen im Papierkorb endgültig löschen? Das lässt sich nicht rückgängig machen.",en:"Permanently delete all {n} notes in the trash? This cannot be undone."},
  "confirm.wipe":{de:"Die Notizen auf diesem Gerät wirklich löschen? Ohne Backup ist alles weg.",en:"Really delete the notes on this device? Without a backup everything is gone."},
  "dlg.import":{de:"Übernehmen",en:"Import"},
  "sn.errJson":{de:"Das ist keine lesbare Backup-Datei (kein JSON).",en:"This is not a readable backup file (not JSON)."},
  "sn.errFormat":{de:"Das ist kein Standard-Notes-Backup (keine Liste „items“).",en:"This is not a Standard Notes backup (no “items” list)."},
  "sn.errZipNoSn":{de:"Im ZIP fehlt die Datei „Standard Notes Backup and Import File.txt“ — ist das ein entschlüsseltes Standard-Notes-Backup?",en:"The ZIP does not contain “Standard Notes Backup and Import File.txt” — is this a decrypted Standard Notes backup?"},
  "sn.errZipUnsupported":{de:"Dieses System kann das ZIP nicht entpacken. Bitte entpacken und die Datei „Standard Notes Backup and Import File.txt“ wählen.",en:"This system cannot unpack the ZIP. Please unpack it and choose “Standard Notes Backup and Import File.txt”."},
  "sn.errZipBad":{de:"Das ZIP lässt sich nicht lesen (beschädigt, verschlüsselt, mehrteilig oder ZIP64).",en:"The ZIP cannot be read (damaged, encrypted, multi-part or ZIP64)."},
  "sn.errEncrypted":{de:"Das Backup ist verschlüsselt. In Standard Notes ein entschlüsseltes Backup herunterladen (Kontomenü → Backups → „Download decrypted backup“).",en:"This backup is encrypted. Download a decrypted backup in Standard Notes (account menu → Backups → “Download decrypted backup”)."},
  "sn.take":{de:"{n} Notizen werden übernommen, {t} davon in den Papierkorb.",en:"{n} notes will be imported, {t} of them into the trash."},
  "sn.known":{de:"{n} bereits importierte werden abgeglichen (die neuere Fassung gewinnt).",en:"{n} previously imported ones will be reconciled (the newer version wins)."},
  "sn.nothing":{de:"Nichts zu übernehmen.",en:"Nothing to import."},
  "sn.skipped":{de:"Übersprungen:",en:"Skipped:"},
  "sn.skipAuth":{de:"{n} Authenticator-Einträge (2FA-Geheimnisse werden nie übernommen)",en:"{n} Authenticator entries (2FA secrets are never imported)"},
  "sn.skipSheet":{de:"{n} Tabellen (Spreadsheet)",en:"{n} spreadsheets"},
  "sn.skipDupes":{de:"{n} Dubletten (Inhalt schon vorhanden)",en:"{n} duplicates (content already present)"},
  "sn.trashOver":{de:"{n} Papierkorb-Notizen (der Papierkorb fasst {m})",en:"{n} trashed notes (the trash holds {m})"},
  "sn.skipOther":{de:"{n} sonstige Elemente (Dateien, Erweiterungen, Leeres)",en:"{n} other items (files, extensions, empty ones)"},
  "sn.changed":{de:"Vereinfacht:",en:"Simplified:"},
  "sn.capBody":{de:"{n} Notizen auf {k}.000 Zeichen gekürzt",en:"{n} notes cut to {k},000 characters"},
  "sn.capItems":{de:"{n} Checklisten gekürzt (höchstens {m} Zeilen à {c} Zeichen)",en:"{n} checklists cut (at most {m} lines of {c} characters)"},
  "sn.lostTables":{de:"{n} Tabellen als Textzeilen",en:"{n} tables as text lines"},
  "sn.lostImages":{de:"{n} Bilder, Dateien oder Einbettungen nur als Platzhalter",en:"{n} images, files or embeds as placeholders only"},
  "sn.archived":{de:"{n} archivierte Notizen als normale Notizen",en:"{n} archived notes as ordinary notes"},
  "sn.hint":{de:"Danach die entschlüsselte Backup-Datei löschen — sie ist Klartext.",en:"Afterwards delete the decrypted backup file — it is plain text."},
  "sn.done":{de:"Übernommen: {a} neu, {u} aktualisiert, {t} in den Papierkorb. Jetzt die Backup-Datei löschen.",en:"Imported: {a} new, {u} updated, {t} into the trash. Now delete the backup file."},
  "sn.doneToast":{de:"Standard-Notes-Import fertig",en:"Standard Notes import done"},
  "dlg.ok":{de:"OK",en:"OK"},
  "dlg.cancel":{de:"Abbrechen",en:"Cancel"},
  "dlg.useAnyway":{de:"Trotzdem verwenden",en:"Use anyway"},
  "dlg.tryAnyway":{de:"Trotzdem versuchen",en:"Try anyway"},
  "dlg.convert":{de:"Umwandeln",en:"Convert"},
  "dlg.remove":{de:"Entfernen",en:"Remove"},
  "dlg.toTrash":{de:"In den Papierkorb",en:"Move to trash"},
  "dlg.deleteForever":{de:"Endgültig löschen",en:"Delete permanently"},
  "dlg.disable":{de:"Deaktivieren",en:"Disable"},
  "dlg.discard":{de:"Verwerfen",en:"Discard"},
  "confirm.bigKdf":{de:"Die Datei verlangt {m} MiB Arbeitsspeicher für Argon2 — das kann auf dem Handy abstürzen. Trotzdem versuchen?",en:"The file demands {m} MiB of memory for Argon2 — this may crash on a phone. Try anyway?"},
  "confirm.weakPass":{de:"Diese Passphrase ist vorhersagbar ({why}).\n\nSie schützt auch jedes Backup — eine gestohlene Backup-Datei lässt sich offline beliebig oft durchprobieren. Besser: der Vorschlag-Button (sechs Würfelwörter).\n\nTrotzdem verwenden?",en:"This passphrase is predictable ({why}).\n\nIt also protects every backup — a stolen backup file can be guessed offline as often as an attacker likes. Better: the suggest button (six dice words).\n\nUse it anyway?"},
  "confirm.weakPassCp":{de:"Diese Passphrase ist vorhersagbar ({why}).\n\nSie schützt auch jedes künftige Backup — eine gestohlene Backup-Datei lässt sich offline beliebig oft durchprobieren. Besser: sechs Würfelwörter wie beim Einrichten.\n\nTrotzdem verwenden?",en:"This passphrase is predictable ({why}).\n\nIt also protects every future backup — a stolen backup file can be guessed offline as often as an attacker likes. Better: six dice words as in the setup.\n\nUse it anyway?"},
  "bk.done":{de:"Backup gespeichert: {n}",en:"Backup saved: {n}"},
  "bk.doneNative":{de:"Backup geschrieben nach Dokumente: {n}",en:"Backup written to Documents: {n}"},
  "bk.doneShare":{de:"Backup über den Teilen-Dialog bereitgestellt: {n} — dort ein Ziel wählen (Dateien, Syncthing …).",en:"Backup offered via the share sheet: {n} — pick a destination there (Files, Syncthing …)."},
  "bk.failed":{de:"Backup fehlgeschlagen: {e}",en:"Backup failed: {e}"},
  "bk.none":{de:"⚠ Noch kein Backup. Sicherung → Backup erstellen.",en:"⚠ No backup yet. Backup → Create backup."},
  "bk.stale":{de:"⚠ Letztes Backup vor {d} Tagen — seitdem {n} Änderung(en).",en:"⚠ Last backup {d} days ago — {n} change(s) since."},
  "bk.last":{de:"Letztes Backup: {d}",en:"Last backup: {d}"},
  "bk.readErr":{de:"Datei konnte nicht gelesen werden.",en:"Could not read the file."},
  "bk.merged":{de:"Zusammengeführt: {a} neu, {u} aktualisiert, {d} gelöscht ({t} Löschmarken in der Datei).",en:"Merged: {a} new, {u} updated, {d} deleted ({t} deletion markers in the file)."},
  "bk.wiped":{de:"{n} eigene Papierkorb-Notizen wurden dabei geleert.",en:"{n} of your own trash notes were emptied in the process."},
  "bk.mergeFail":{de:"Falsche Passphrase oder beschädigte Datei.",en:"Wrong passphrase or damaged file."},
  "about":{de:"Alien Notes v{v} · Argon2id m={m} MiB t={t} p={p} · AES-256-GCM",en:"Alien Notes v{v} · Argon2id m={m} MiB t={t} p={p} · AES-256-GCM"},
  "pass.s0":{de:"zu kurz (mind. 12 Zeichen)",en:"too short (min. 12 characters)"},
  "pass.s1":{de:"okay — länger ist besser",en:"okay — longer is better"},
  "pass.s2":{de:"stark",en:"strong"},
  "pass.s3":{de:"sehr stark",en:"very strong"},
  "pass.est":{de:"Schätzung: {s}",en:"estimate: {s}"},"pass.has":{de:"enthält {why}",en:"contains {why}"},
  "pass.weak":{de:"vorhersagbar: {why}",en:"predictable: {why}"},
  "why.repeat":{de:"Wiederholung",en:"repetition"},"why.seq":{de:"Zeichenfolge",en:"sequence"},"why.keyboard":{de:"Tastaturfolge",en:"keyboard pattern"},
  "why.year":{de:"Jahreszahl",en:"year"},"why.common":{de:"häufiges Wort",en:"common word"},"why.digits":{de:"nur Ziffern",en:"digits only"},
  "why.variety":{de:"wenige verschiedene Zeichen",en:"few distinct characters"},
  "nocrypto":{de:"Dieser Browser unterstützt kein WebCrypto/WebAssembly oder läuft nicht im sicheren Kontext. Bitte die App verwenden oder die Seite über https:// bzw. localhost öffnen.",en:"This browser lacks WebCrypto/WebAssembly or is not a secure context. Please use the app or open the page via https:// or localhost."}
};
const _qsLang = new URLSearchParams(window.location.search).get('lang');
let LANG = (_qsLang==='de'||_qsLang==='en') ? _qsLang
  : (function(){ try{ const l=localStorage.getItem(LANG_KEY); return ['de','en'].includes(l)?l:((navigator.language||'de').toLowerCase().indexOf('de')===0?'de':'en'); }catch(_){ return 'de'; } })();
const _i18nCache = new WeakMap();
function tr(key, params){ const e=T[key]; const s=e?(e[LANG]!==undefined?e[LANG]:e.de):key;
  return params?s.replace(/\{(\w+)\}/g,(m,k)=>Object.prototype.hasOwnProperty.call(params,k)?String(params[k]):m):s; }   // EIN Durchlauf, kein Ketten-Ersetzen
function applyI18n(){
  document.querySelectorAll('[data-i18n],[data-i18n-html],[data-i18n-ph]').forEach(el=>{
    let c=_i18nCache.get(el); if(!c){ c={}; _i18nCache.set(el,c); }
    [['data-i18n','textContent'],['data-i18n-html','innerHTML'],['data-i18n-ph','placeholder']].forEach(([attr,prop])=>{
      const key=el.getAttribute(attr); if(!key) return;
      if(c[prop]===undefined) c[prop]=el[prop];   // Original (DE) merken
      const en=I18N[key]; el[prop]=(LANG==='en'&&en!==undefined)?en:c[prop];
    });
  });
  document.documentElement.setAttribute('lang',LANG);
  const lb=document.getElementById('lang-btn'); if(lb) lb.textContent=(LANG==='de'?'DE':'EN');
  document.querySelectorAll('.pw-eye').forEach(b=>{ b.title=tr('pw.toggle'); });
  if(typeof App!=='undefined'&&App.syncCombos) App.syncCombos();   // Optionen tragen data-i18n → Knopfbeschriftung nachziehen
}
function setLang(l){ LANG=l; try{ localStorage.setItem(LANG_KEY,l); }catch(_){ } applyI18n(); if(typeof App!=='undefined'&&App.relabel) App.relabel(); }

/* === VAULT-FORMAT BEGIN ===
   Reine Funktionen ohne DOM: Bytes/Base64/Base32, Zufall, Argon2id-Schlüsselhierarchie,
   Dateiformat AINV1, Sanitizer (Notizen + Checklisten), Merge, Papierkorb, TOTP (Aegis-Hürde), Passphrase-Prüfung.
   roundtrip-test.mjs evaluiert GENAU diesen Textabschnitt in Node (keine Nachbildung).
   Wortgleich aus Alien Pass v1.8 übernommen — geändert sind nur Magic, Feldliste/Caps des Eintrags, Sperr-Defaults;
   weggefallen sind Generator (Zeichen-Modus), CSV-/Proton-/ZIP-/PGP-Import. */
const enc = new TextEncoder(), dec = new TextDecoder();
function bufToB64(buf){let b='';const u=new Uint8Array(buf);for(let i=0;i<u.length;i++)b+=String.fromCharCode(u[i]);return btoa(b);}
function b64ToBuf(b64){const s=atob(b64);const u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u.buffer;}
function b64Bytes(s){ if(typeof s!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return null; try{ return new Uint8Array(b64ToBuf(s)); }catch(_){ return null; } }
const B32A='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(bytes){let bits=0,val=0,out='';for(const b of bytes){val=(val<<8)|b;bits+=8;while(bits>=5){out+=B32A[(val>>>(bits-5))&31];bits-=5;}}if(bits>0)out+=B32A[(val<<(5-bits))&31];return out;}
function base32Decode(str){str=str.toUpperCase().replace(/=+$/,'').replace(/\s/g,'');let bits=0,val=0;const out=[];for(const c of str){const idx=B32A.indexOf(c);if(idx<0)continue;val=(val<<5)|idx;bits+=5;if(bits>=8){out.push((val>>>(bits-8))&0xff);bits-=8;}}return new Uint8Array(out);}
function rand(n){ return crypto.getRandomValues(new Uint8Array(n)); }
// Gleichverteilt in [0,n) ohne Modulo-Bias (Rejection-Sampling über 32-Bit-Werte)
function randInt(n){ if(!Number.isInteger(n)||n<=0||n>0x100000000) throw new Error('range'); const limit=Math.floor(0x100000000/n)*n; const buf=new Uint32Array(1); for(;;){ crypto.getRandomValues(buf); if(buf[0]<limit) return buf[0]%n; } }
function cryptoId(){ return Array.from(rand(8),b=>b.toString(16).padStart(2,'0')).join(''); }
function passBytes(p){ return enc.encode(String(p).normalize('NFKC')); }

/* ---------- Dateiformat AINV1 + Schlüsselhierarchie ----------
   KEK = Argon2id(Passphrase) verpackt den zufälligen DEK (AES-KW-frei: AES-GCM wrapKey mit AAD).
   AAD bindet magic/ver/KDF-Parameter/Salt + Rolle (wrap|body) — aus DEKODIERTEN Werten kanonisch
   erzeugt, auf Lese- UND Schreibpfad identisch.
   Eigenes Magic gegenüber Alien Pass (AIPV1): Alien Pass weist eine Notizen-Datei ab und umgekehrt — die Apps teilen
   nie Schlüssel oder Slots, auch wenn der Nutzer dieselbe Passphrase wählt. */
const MAGIC='AINV1', FILE_VER=1;
const KDF_DEFAULT={m:65536,t:3,p:1};
const KDF_BOUNDS={mMin:8192,mMax:262144,tMin:1,tMax:16,pMin:1,pMax:4,budget:786432};
const KDF_CONFIRM_M=131072;
// MAX_ENTRIES 5.000 statt 10.000 (Alien Pass): ein Eintrag darf bis zu 100 KB Text tragen; die tragende Grenze ist die
// Dateigröße (MAX_FILE_BYTES) und die localStorage-Quota des Geräts — persist() muss das Schreiben nachprüfen.
const MAX_FILE_BYTES=20*1024*1024, MAX_ENTRIES=5000;
// Lesegrenze doppelt so hoch wie die Schreibgrenze: eine Datei, die über 20 MB geraten ist, lässt sich noch öffnen und durch Löschen schrumpfen
// (Gerätetest 24.09.2026: 200 × 100 KB wurden geschrieben, dann „Datei zu groß“ beim Entsperren). Wachstum über MAX_FILE_BYTES lehnt persist() ab.
const MAX_READ_BYTES=2*MAX_FILE_BYTES;
function kdfOk(k){ const B=KDF_BOUNDS; return !!k && Number.isInteger(k.m)&&Number.isInteger(k.t)&&Number.isInteger(k.p)
  && k.m>=B.mMin&&k.m<=B.mMax && k.t>=B.tMin&&k.t<=B.tMax && k.p>=B.pMin&&k.p<=B.pMax && k.m*k.t<=B.budget; }
function aad(kdf, role){ return enc.encode(`${MAGIC}|${FILE_VER}|argon2id|${kdf.m}|${kdf.t}|${kdf.p}|${bufToB64(kdf.salt)}|${role}`); }
async function argon2Raw(pass, kdf){
  if(!kdfOk(kdf)) throw new Error('kdfbounds');
  const raw=await globalThis.hashwasm.argon2id({password:pass, salt:kdf.salt, parallelism:kdf.p, iterations:kdf.t, memorySize:kdf.m, hashLength:32, outputType:'binary'});
  if(pass instanceof Uint8Array) pass.fill(0);
  return raw;
}
async function deriveKek(pass, kdf){
  const raw=await argon2Raw(pass, kdf);
  const key=await crypto.subtle.importKey('raw', raw, {name:'AES-GCM'}, false, ['wrapKey','unwrapKey']);
  raw.fill(0); return key;
}
function newDek(){ return crypto.subtle.generateKey({name:'AES-GCM',length:256}, true, ['encrypt','decrypt']); }
// Rolle 'wrap' = Passphrase-Slot in der Datei; 'bio' = Fingerabdruck-Slot (außerhalb der Datei, an denselben Header gebunden)
async function wrapDek(dek, kek, kdf, role){ const iv=rand(12); const ct=new Uint8Array(await crypto.subtle.wrapKey('raw', dek, kek, {name:'AES-GCM', iv, additionalData:aad(kdf,role||'wrap')})); return {iv, ct}; }
function unwrapDek(wrap, kek, kdf, extractable, role){ return crypto.subtle.unwrapKey('raw', wrap.ct, kek, {name:'AES-GCM', iv:wrap.iv, additionalData:aad(kdf,role||'wrap')}, {name:'AES-GCM',length:256}, !!extractable, ['encrypt','decrypt']); }
/* Fingerabdruck-Slot: 32 Byte Zufall (nur der Android-Keystore gibt sie nach Fingerabdruck heraus) werden als nicht
   extrahierbarer Wrap-Schlüssel importiert; der Blob {iv,ct} liegt unter 'ai-notes-bio' und wird NIE exportiert. */
function bioKey(raw){ if(!(raw instanceof Uint8Array)||raw.length!==32) throw new Error('biokey'); return crypto.subtle.importKey('raw', raw, {name:'AES-GCM'}, false, ['wrapKey','unwrapKey']); }
// `w` = b64 des Passphrase-Wrap-Ciphertexts, für den der Slot erzeugt wurde: doBio übernimmt f.wrap nur, wenn es dazu passt —
// sonst könnte ein manipulierter wrap in der Datei per Fingerabdruck-Sitzung stillschweigend weitergeschrieben und in jedes Backup kopiert werden (Audit run-3 #3)
// `wi` (v1.8, Audit run-8 #1) = b64 der Wrap-IV, OPTIONAL: Slots von ≤ v1.7 tragen nur `w` und laufen unverändert weiter; neue Slots binden
// IV + Ciphertext, damit eine gekippte IV nicht ungeprüft in die Sitzung und mit dem nächsten persist() in Datei und Backups wandert.
function parseBioBlob(raw){ if(typeof raw!=='string'||raw.length>512) return null; let o; try{ o=JSON.parse(raw); }catch(_){ return null; } if(!o||typeof o!=='object') return null; const iv=b64Bytes(o.iv), ct=b64Bytes(o.ct), w=b64Bytes(o.w); if(!(iv&&iv.length===12&&ct&&ct.length===48&&w&&w.length===48)) return null;
  if(o.wi===undefined||o.wi===null) return {iv,ct,w:o.w,wi:null}; const wi=b64Bytes(o.wi); return (wi&&wi.length===12)?{iv,ct,w:o.w,wi:o.wi}:null; }
function serializeBioBlob(blob, wrapCt, wrapIv){ if(!(wrapCt instanceof Uint8Array)||wrapCt.length!==48) throw new Error('bioblob'); if(wrapIv!==undefined&&!(wrapIv instanceof Uint8Array&&wrapIv.length===12)) throw new Error('bioblob');
  const o={iv:bufToB64(blob.iv), ct:bufToB64(blob.ct), w:bufToB64(wrapCt)}; if(wrapIv) o.wi=bufToB64(wrapIv); return JSON.stringify(o); }
// Passt der Passphrase-Slot der Datei zum Fingerabdruck-Blob? Ciphertext immer, IV nur wenn der Blob sie kennt (Übergang ≤ v1.7)
function bioWrapOk(blob, wrap){ return !!blob&&!!wrap&&blob.w===bufToB64(wrap.ct)&&(!blob.wi||blob.wi===bufToB64(wrap.iv)); }
// Bindung des PIN-Slots (nur RAM) an die Datei: KDF-Header (m/t/p/Salz über die AAD-Zeichenkette) + Wrap-IV + Wrap-Ciphertext — jede Abweichung
// heißt „Datei geändert“, nie „falsche PIN“ (Audit run-8 #1/#10)
function wrapTag(kdf, wrap){ return dec.decode(aad(kdf,'wrap'))+'|'+bufToB64(wrap.iv)+'|'+bufToB64(wrap.ct); }
async function encryptBody(obj, dek, kdf){ const iv=rand(12); const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(kdf,'body')}, dek, enc.encode(JSON.stringify(obj)))); return {iv,ct}; }
async function decryptBody(body, dek, kdf){ const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:body.iv,additionalData:aad(kdf,'body')}, dek, body.ct); return JSON.parse(dec.decode(pt)); }
function serializeFile(kdf, wrap, body){
  return JSON.stringify({magic:MAGIC, ver:FILE_VER,
    kdf:{name:'argon2id', m:kdf.m, t:kdf.t, p:kdf.p, salt:bufToB64(kdf.salt)},
    wrap:{iv:bufToB64(wrap.iv), ct:bufToB64(wrap.ct)},
    body:{iv:bufToB64(body.iv), ct:bufToB64(body.ct)}});
}
// Prüft Struktur + Grenzen VOR jeder KDF-Arbeit. Wirft Error('format'|'newer'|'kdfbounds'|'toolarge').
function parseFile(raw){
  if(typeof raw!=='string') throw new Error('format');
  if(raw.length>MAX_READ_BYTES) throw new Error('toolarge');
  let f; try{ f=JSON.parse(raw); }catch(_){ throw new Error('format'); }
  if(!f||typeof f!=='object'||f.magic!==MAGIC) throw new Error('format');
  if(f.ver!==FILE_VER) throw new Error((Number.isInteger(f.ver)&&f.ver>FILE_VER)?'newer':'format');
  const k=f.kdf; if(!k||typeof k!=='object'||k.name!=='argon2id') throw new Error('format');
  const kdf={m:k.m, t:k.t, p:k.p, salt:b64Bytes(k.salt)};
  if(!kdf.salt||kdf.salt.length!==16) throw new Error('format');
  if(!kdfOk(kdf)) throw new Error('kdfbounds');
  const wrap={iv:b64Bytes(f.wrap&&f.wrap.iv), ct:b64Bytes(f.wrap&&f.wrap.ct)};
  const body={iv:b64Bytes(f.body&&f.body.iv), ct:b64Bytes(f.body&&f.body.ct)};
  if(!wrap.iv||wrap.iv.length!==12||!wrap.ct||wrap.ct.length!==48) throw new Error('format');
  if(!body.iv||body.iv.length!==12||!body.ct||body.ct.length<16) throw new Error('format');
  return {kdf, wrap, body};
}

/* ---------- Vault-Objekt, Sanitizer, Merge ---------- */
const VAULT_VERSION=1;
// Sperre lockerer als Alien Pass (Konzept Abschnitt 4), dieselbe Mechanik: Idle-Timer (Minuten, 0 = aus) ab Werk AUS,
// Hintergrund-Sperre (Sekunden, 0 = sofort) ab Werk 30 min, zusätzlich Stufe BG_NEVER („nie“: DEK bleibt im RAM, bis das System
// den Prozess beendet — die Datei bleibt trotzdem immer verschlüsselt). clipClear 0 = nur beim Sperren (Auto-Löschen aus).
// secure = FLAG_SECURE (kein Screenshot, schwarze Vorschau im App-Umschalter), ab Werk an, abschaltbar (Entscheidung 24.09.2026).
const BG_NEVER=-1;
const SETTINGS_ALLOWED={autolock:[0,1,2,5,15], bgLock:[0,60,300,1800,BG_NEVER], clipClear:[0,15,30,60], secure:[0,1]};
const SETTINGS_DEFAULT={autolock:0, bgLock:1800, clipClear:30, secure:1};
const TOMBSTONE_DAYS=365, MAX_TOMBSTONES=2000;   // Löschmarken zählen NICHT zum Eintrags-Cap, sind aber separat begrenzt
// Papierkorb (aus Alien Pass v1.5): Inhalt gelöschter Einträge bleibt TRASH_DAYS erhalten, höchstens MAX_TRASH Stück.
// TRASH_DAYS MUSS < TOMBSTONE_DAYS sein — sonst könnte der ALTERS-Zweig von purgeTombstones einen
// Papierkorb-Eintrag MIT Inhalt droppen, statt ihn vorher auf die Löschmarke zurückzuschneiden.
// Der ANZAHL-Zweig ist damit NICHT abgedeckt; er zählt seit Audit run-5 nur noch gewipte Marken.
// MAX_TRASH ist die tragende Grenze, nicht Kosmetik: eine Notiz kann bis zu 100 KB tragen — der Papierkorb kann damit
// mehr wiegen als alle lebenden Einträge; die localStorage-Quota des Geräts ist die eigentliche Schranke (persist() prüft nach).
const TRASH_DAYS=30, MAX_TRASH=200;
function emptyVault(){ return {version:VAULT_VERSION, entries:[], settings:Object.assign({},SETTINGS_DEFAULT), totp:null, meta:{lastBackup:null, lastBackupCount:0}}; }
const ID_RE=/^[0-9a-f]{16}$/;
// Eintrag = Notiz ('text': body mit Zeilenumbrüchen) oder Checkliste ('list': items). issuer/label gehören zur Aegis-Hürde (TOTP).
const CAPS={title:200,body:100000,item:500,cat:40,issuer:100,label:200};
const ITEMS_MAX=200;   // Checklisten-Zeilen je Eintrag
const ENTRY_TYPES=['text','list'];
function str(v,cap){ return typeof v==='string' ? v.slice(0,cap) : ''; }
// Einzeilige Anzeigetexte (Titel, Kategorie, Checklisten-Zeile): Steuer-, Nullbreiten- und Bidi-Zeichen raus, Whitespace auf ein Leerzeichen, getrimmt
const CTRL_RE=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g;   // Tab/LF/CR bleiben für den Whitespace-Kollaps
function line(v,cap){ return str(v,cap).replace(CTRL_RE,'').replace(/\s+/g,' ').trim(); }
function entryType(t){ return ENTRY_TYPES.includes(t)?t:'text'; }
// Checklisten-Zeilen: frisches Array aus {text,done}; text über line() (einzeilig), leere Zeilen fallen weg, done nur echtes true,
// höchstens ITEMS_MAX, Reihenfolge bleibt; kaputt → [] (nie null — Tombstone/Whitelist stabil).
function sanitizeItems(list){ if(!Array.isArray(list)) return []; const out=[];
  for(const x of list){ if(!x||typeof x!=='object'||Array.isArray(x)) continue; const text=line(x.text,CAPS.item); if(!text) continue; out.push({text, done:x.done===true}); if(out.length>=ITEMS_MAX) break; }
  return out; }
// Dubletten-Schlüssel für Importe (Typ + identischer Inhalt der tragenden Felder inkl. Kategorie)
// Kanonisch, bewusst OHNE id/Zeitstempel/fav/pinned/md — sonst verdoppelte ein Re-Import jeden Eintrag, an dem nur der Pin oder die
// Markdown-Ansicht geändert wurde. Zwei Checklisten, die sich nur im Haken unterscheiden, sind KEINE Dubletten (items zählen ganz).
function dupKey(e){ return canon({type:e.type, title:e.title, body:e.body, items:e.items||[], cat:e.cat}); }
function isoOrNull(v){ if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(v)) return null; const t=Date.parse(v); return Number.isFinite(t)?new Date(t).toISOString():null; }
function parseOtpauth(uri){
  let u; try{ u=new URL(uri); }catch(_){ return null; }
  if(u.protocol!=='otpauth:'||u.host.toLowerCase()!=='totp') return null;
  let label=''; try{ label=decodeURIComponent(u.pathname.replace(/^\/+/,'')); }catch(_){ label=u.pathname.replace(/^\/+/,''); }
  const q=u.searchParams; let issuer=q.get('issuer')||''; if(!issuer&&label.includes(':')) issuer=label.split(':')[0];
  return {secret:q.get('secret')||'', algorithm:q.get('algorithm')||'SHA1', digits:q.get('digits')||6, period:q.get('period')||30, issuer, label};
}
// Normalisiert String (Base32 oder otpauth://) oder Objekt → {secret,algorithm,digits,period,issuer,label} | null
function normalizeTotp(v){
  let o=null;
  if(typeof v==='string'){ const s=v.trim(); if(!s) return null; o=/^otpauth:\/\//i.test(s)?parseOtpauth(s):{secret:s}; }
  else if(v&&typeof v==='object'&&!Array.isArray(v)) o={secret:v.secret, algorithm:v.algorithm, digits:v.digits, period:v.period, issuer:v.issuer, label:v.label};
  if(!o||typeof o.secret!=='string') return null;
  const secret=o.secret.toUpperCase().replace(/[\s=-]/g,'');
  if(!/^[A-Z2-7]{8,256}$/.test(secret)) return null;
  const alg=String(o.algorithm==null?'SHA1':o.algorithm).toUpperCase().replace('-','');
  if(!['SHA1','SHA256','SHA512'].includes(alg)) return null;
  const digits=o.digits==null||o.digits===''?6:Number(o.digits); if(![6,7,8].includes(digits)) return null;
  const period=o.period==null||o.period===''?30:Number(o.period); if(!Number.isInteger(period)||period<15||period>300) return null;
  return {secret, algorithm:alg, digits, period, issuer:str(o.issuer,CAPS.issuer), label:str(o.label,CAPS.label)};
}
function otpauthUri(t){ const lbl=encodeURIComponent(t.label||t.issuer||'Alien Notes'); let s=`otpauth://totp/${lbl}?secret=${t.secret}`; if(t.issuer) s+=`&issuer=${encodeURIComponent(t.issuer)}`; if(t.algorithm!=='SHA1') s+=`&algorithm=${t.algorithm}`; if(t.digits!==6) s+=`&digits=${t.digits}`; if(t.period!==30) s+=`&period=${t.period}`; return s; }
// Whitelist (12 Felder): baut ein frisches Objekt; ungültige ID → null (Aufrufer verwirft).
// GELÖSCHTE Einträge laufen durch dieselbe Whitelist wie lebende (Papierkorb) — sie behalten ihren Inhalt und
// verlieren ihn erst durch wipeTrash()/tombstone().
function sanitizeEntry(e, now){
  if(!e||typeof e!=='object'||Array.isArray(e)) return null;
  const id=typeof e.id==='string'?e.id.toLowerCase():''; if(!ID_RE.test(id)) return null;
  now=now||Date.now(); const maxT=now+120000, EPOCH='1970-01-01T00:00:00.000Z';
  let created=isoOrNull(e.created), updated=isoOrNull(e.updated), deleted=e.deleted==null||e.deleted===false?null:isoOrNull(e.deleted);
  if(!updated) updated=EPOCH;
  if(!created) created=updated;
  const tc=Math.min(Date.parse(created),maxT); let tu=Math.min(Date.parse(updated),maxT); if(tu<tc) tu=tc;
  created=new Date(tc).toISOString(); updated=new Date(tu).toISOString();
  if(e.deleted&&!deleted) deleted=updated;                       // "gelöscht" ohne brauchbares Datum → Änderungsdatum
  // Löschdatum klemmen: eine fremde Datei darf die Papierkorb-Frist nicht in die Zukunft schieben.
  if(deleted) deleted=new Date(Math.min(Date.parse(deleted),maxT)).toISOString();
  // Typ bestimmt, welche Felder tragen: text (body, Zeilenumbrüche bleiben; md = Markdown-Ansicht je Notiz), list (items)
  const type=entryType(e.type);
  const o={id, type, cat:line(e.cat,CAPS.cat), title:line(e.title,CAPS.title), body:'', items:[],
           fav:e.fav===true, pinned:e.pinned===true, md:type==='text'&&e.md===true, created, updated, deleted};
  if(type==='text') o.body=str(e.body,CAPS.body).replace(/\r\n?/g,'\n');   // Zeilenumbrüche kanonisch (Audit run-1 #8: textarea liefert nie CR)
  else o.items=sanitizeItems(e.items);
  return o;
}
// Kanonische Serialisierung ALLER Ebenen (Array-Replacer von JSON.stringify wäre nur eine Allowlist → items:[{}])
function canon(v){ if(v===undefined||v===null||typeof v!=='object') return JSON.stringify(v===undefined?null:v); if(Array.isArray(v)) return '['+v.map(canon).join(',')+']'; return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}'; }
const liveCount=list=>list.reduce((n,e)=>n+(e.deleted?0:1),0);
function ts(v){ const t=Date.parse(v); return Number.isFinite(t)?t:0; }
// Deterministischer Gewinner: neueres updated; Gleichstand → Tombstone; sonst größerer kanonischer JSON-String.
// Unter ZWEI Löschmarken gewinnt die gewipte. Nötig, weil canon() den inhaltsvollen Stand fast immer voranstellt
// ("body":"text" > "body":"", "items":[{…}] > "items":[]) — ohne die Regel machte ein Gerät, dessen Uhr abweicht, jeden
// Wipe wieder rückgängig, und der Re-Import derselben Datei wäre nicht mehr idempotent.
// NICHT über "kleinerer canon()" abkürzen: bei einer INHALTSLOSEN Checkliste ist die gewipte Gestalt die
// größere ("type":"list" < "type":"text"). Es braucht das explizite isWiped-Prädikat.
function winner(a,b){ const ta=ts(a.updated), tb=ts(b.updated); if(ta!==tb) return ta>tb?a:b;
  if(!!a.deleted!==!!b.deleted) return a.deleted?a:b;
  if(a.deleted&&b.deleted){ const wa=isWiped(a), wb=isWiped(b); if(wa!==wb) return wa?a:b; }
  return canon(a)>=canon(b)?a:b; }
function dedupeEntries(list){ const m=new Map(); for(const e of list){ const cur=m.get(e.id); m.set(e.id, cur?winner(cur,e):e); } return [...m.values()]; }
// Cap gilt nur für LIVE-Einträge; Tombstones werden gepurgt/gekappt statt gezählt (sonst könnte eine
// fremde Datei den Tresor mit unsichtbaren Löschmarken bis an den Cap füllen und der nächste eigene Eintrag brickt ihn).
function sanitizeEntries(list, now){ if(!Array.isArray(list)) return []; if(list.length>MAX_ENTRIES*4) throw new Error('toomany'); const out=[]; for(const e of list){ const s=sanitizeEntry(e,now); if(s) out.push(s); } const d=purgeTombstones(wipeTrash(dedupeEntries(out), now), now); if(liveCount(d)>MAX_ENTRIES) throw new Error('toomany'); return d; }
function sanitizeSettings(s){ const o={}; for(const k in SETTINGS_DEFAULT){ const v=s&&typeof s==='object'?Number(s[k]):NaN; o[k]=SETTINGS_ALLOWED[k].includes(v)?v:SETTINGS_DEFAULT[k]; } return o; }
function sanitizeVault(v, now){
  if(!v||typeof v!=='object') throw new Error('format');
  const meta=v.meta&&typeof v.meta==='object'?v.meta:{};
  return {version:VAULT_VERSION, entries:sanitizeEntries(v.entries, now), settings:sanitizeSettings(v.settings),
          totp:normalizeTotp(v.totp),                                   // Aegis-Hürde beim Entsperren (optional; nie aus Fremddateien übernommen)
          meta:{lastBackup:isoOrNull(meta.lastBackup), lastBackupCount:Number.isInteger(meta.lastBackupCount)?meta.lastBackupCount:0}};
}
// Merge (kommutativ, assoziativ, idempotent) — Ergebnis + Zähler. incoming ist bereits sanitisiert.
function mergeEntries(local, incoming){
  const map=new Map(); for(const e of local){ const c=map.get(e.id); map.set(e.id, c?winner(c,e):e); }   // local defensiv deduplizieren (Kommutativität)
  let added=0, updated=0, deleted=0, wiped=0;
  for(const inc of dedupeEntries(incoming)){
    const loc=map.get(inc.id);
    if(!loc){ map.set(inc.id,inc); if(!inc.deleted) added++; continue; }
    const w=winner(loc,inc); if(w===loc) continue;
    // Jede Ersetzung wird gezählt (Audit run-5 #4): gelöscht→gelöscht fiel bisher durch beide Zweige, und eine
    // Wiederauferstehung galt als „aktualisiert“, obwohl der Eintrag für den Nutzer NEU in der Liste steht.
    map.set(inc.id,inc);
    if(inc.deleted&&!loc.deleted) deleted++;
    else if(!inc.deleted) (loc.deleted?added++:updated++);
    else wiped++;
  }
  return {entries:[...map.values()], added, updated, deleted, wiped, tombstonesIn:incoming.reduce((n,e)=>n+(e.deleted?1:0),0)};
}
// Nur GEWIPTE Löschmarken zählen gegen MAX_TOMBSTONES — ein Papierkorb-Eintrag mit Inhalt wird hier nie
// entfernt (Audit run-5 #2: der Anzahl-Zweig verwarf ihn samt Inhalt, die Invariante oben deckte nur den Alters-Zweig).
// wipeTrash hat inhaltsvolle Einträge bereits auf MAX_TRASH gekappt, sie brauchen die Marken-Quote nicht.
function purgeTombstones(entries, now){ now=now||Date.now(); const kept=entries.filter(e=>!e.deleted || now-ts(e.deleted) < TOMBSTONE_DAYS*86400000);
  const tombs=kept.filter(e=>e.deleted&&isWiped(e)); if(tombs.length<=MAX_TOMBSTONES) return kept;
  tombs.sort((a,b)=>ts(b.deleted)-ts(a.deleted)); const keep=new Set(tombs.slice(0,MAX_TOMBSTONES).map(e=>e.id)); return kept.filter(e=>!e.deleted||!isWiped(e)||keep.has(e.id)); }
// Eingehende Einträge einer FREMDEN Datei zurechtschneiden, bevor sie in den Merge gehen (Audit run-5 #1/#2).
// Drei Regeln, jede gegen einen belegten Angriff:
//   1. Papierkorb-INHALT ist gerätelokal — eine Löschung reist als Marke, der Inhalt nie. Sonst belegen 200
//      fremde Einträge (deren `deleted` die Klemmung auf now+2min zu den jüngsten macht) alle MAX_TRASH-Plätze
//      und verdrängen den gesamten eigenen Papierkorb.
//   2. Eine eingehende Marke verdrängt keinen eigenen Papierkorb-Eintrag, der dieselbe Löschung mit Inhalt
//      festhält — sonst zerstörte schon der Rückweg vom eigenen Zweitgerät den eigenen Papierkorb.
//   3. Marken zu IDs, die der Tresor nie gesehen hat, füllen nur den Rest des Marken-Deckels — sonst verdrängen
//      2000 fremde Marken die eigenen, und ohne Marke holt das nächste eigene Backup Gelöschtes wieder lebend zurück.
function shapeIncoming(local, incoming){
  const mineTrash=new Map(), known=new Set(); let ownTombs=0;
  for(const e of local){ known.add(e.id); if(e.deleted){ if(isWiped(e)) ownTombs++; else mineTrash.set(e.id,e); } }
  let budget=Math.max(0, MAX_TOMBSTONES-ownTombs);
  const out=[];
  for(const e of incoming){
    if(!e.deleted){ out.push(e); continue; }                   // lebende Einträge unverändert
    const loc=mineTrash.get(e.id);
    if(loc&&ts(e.updated)<=ts(loc.updated)) continue;          // Regel 2
    if(!known.has(e.id)){ if(budget<=0) continue; budget--; }  // Regel 3
    out.push(isWiped(e)?e:tombFrom(e));                        // Regel 1
  }
  return out;
}
// Löschmarken-Gestalt zu einem Eintrag: inhaltsleer, Zeitstempel unverändert. Basis von tombstone(), isWiped() und wipeTrash().
// MUSS dieselbe Feldmenge liefern wie sanitizeEntry() (12 Felder) — Test „tombFrom() ist sanitizer-stabil“.
function tombFrom(e){ return {id:e.id, type:'text', cat:'', title:'', body:'', items:[], fav:false, pinned:false, md:false, created:e.created, updated:e.updated, deleted:e.deleted}; }
// Sofortige, endgültige Löschmarke: Inhalt weg UND updated=jetzt — schlägt damit jeden älteren Stand auf anderen Geräten.
function tombstone(e, nowIso){ return tombFrom({id:e.id, created:e.created, updated:nowIso, deleted:nowIso}); }
// Gelöscht UND inhaltsleer. Stützt sich darauf, dass tombFrom() sanitizer-stabil ist.
function isWiped(e){ return !!e.deleted && canon(e)===canon(tombFrom(e)); }
// Papierkorb räumen: abgelaufene und überzählige Einträge auf die Löschmarke zurückschneiden — OHNE updated anzuheben.
// Sonst gälte der Wipe als Änderung (gewänne überall, und renderBackupHint() mahnte ohne Nutzeraktion).
// Der Merge braucht das nicht: winner() bevorzugt bei Gleichstand ohnehin die gewipte Gestalt.
// Rein und nicht-mutierend — die Aufrufer rollen über eine flache Array-Kopie zurück.
function wipeTrash(entries, now){ now=now||Date.now();
  const trash=entries.filter(e=>e.deleted&&!isWiped(e)); if(!trash.length) return entries;
  trash.sort((a,b)=>ts(b.deleted)-ts(a.deleted));                                     // jüngste Löschung zuerst — die ältesten weichen
  const wipe=new Set(trash.filter((e,i)=>i>=MAX_TRASH||now-ts(e.deleted)>=TRASH_DAYS*86400000).map(e=>e.id));
  return wipe.size?entries.map(e=>wipe.has(e.id)?tombFrom(e):e):entries; }

/* ---------- TOTP (RFC 6238; SHA1/256/512, 6–8 Stellen, Periode) — Aegis-Hürde beim Entsperren ---------- */
async function totpCode(t, forTime){
  const counter=Math.floor((forTime==null?Date.now():forTime)/1000/t.period);
  const hash={SHA1:'SHA-1',SHA256:'SHA-256',SHA512:'SHA-512'}[t.algorithm];
  const k=await crypto.subtle.importKey('raw', base32Decode(t.secret), {name:'HMAC',hash}, false, ['sign']);
  const msg=new Uint8Array(8), dv=new DataView(msg.buffer); dv.setUint32(0,Math.floor(counter/4294967296)); dv.setUint32(4,counter>>>0);
  const sig=new Uint8Array(await crypto.subtle.sign('HMAC',k,msg));
  const off=sig[sig.length-1]&0xf;
  const bin=((sig[off]&0x7f)<<24)|(sig[off+1]<<16)|(sig[off+2]<<8)|sig[off+3];
  return String(bin%Math.pow(10,t.digits)).padStart(t.digits,'0');
}
function totpRemaining(t, forTime){ const s=Math.floor((forTime==null?Date.now():forTime)/1000); return t.period-(s%t.period); }

/* ---------- Passphrase: Würfelwörter-Vorschlag (Setup) + Stärke-Schätzung ----------
   Der Zeichen-Generator von Alien Pass entfällt (keine Passwörter als Einträge); geblieben ist, was die Tresor-Passphrase schützt. */
function genWords(n, sep, cap, num){
  const W=globalThis.EFF_WORDS; if(!Array.isArray(W)||W.length!==7776) return {pw:'', bits:0};
  n=Math.min(10,Math.max(4,n|0)); const words=[];
  for(let i=0;i<n;i++){ let w=W[randInt(7776)]; if(cap) w=w[0].toUpperCase()+w.slice(1); words.push(w); }
  let bits=n*Math.log2(7776);
  if(num){ const pos=randInt(n); words[pos]+=String(randInt(10)); bits+=Math.log2(10*n); }
  return {pw:words.join(sep==null?'-':sep), bits:Math.round(bits)};
}
/* Stärke-Schätzung (Alien Pass v1.6): Länge allein lügt — „Sommer2024Sommer“ hieß vorher „stark“. Muster werden als Spannen gefunden und auf
   wenige effektive Zeichen verbilligt (Wiederholung/Folge/Tastatur/Jahr → 1, häufiges Wort → 2), gierig nach Ersparnis, ohne Überlappung.
   Bewusst klein, ohne Wörterbuch-Bibliothek (zxcvbn ~800 KB): eine Schätzung, kein Knack-Test. weak = Muster gefunden UND effektiv < 12.
   Analysiert werden die ersten 64 Zeichen (Rest zählt voll). */
const PASS_ROWS=['1234567890','qwertzuiop','qwertyuiop','asdfghjkl','yxcvbnm','zxcvbnm'];
const PASS_COMMON=['passwort','password','kennwort','geheim','secret','hallo','hello','welcome','willkommen','login','admin','benutzer',
  'schatz','liebe','ichliebedich','iloveyou','love','baby','mausi','hasi','engel','angel','sonne','sommer','winter','herbst','fruehling','frühling',
  'summer','monkey','dragon','master','shadow','sunshine','princess','football','fussball','fußball','baseball','soccer','letmein','trustno',
  'deutschland','germany','berlin','hamburg','muenchen','münchen','bayern','schalke','borussia','bitcoin','satoshi','freiheit','freedom',
  'google','facebook','amazon','apple','samsung','computer','internet','starwars','pokemon','superman','batman','killer','hunter',
  'michael','thomas','andreas','stefan','daniel','martin','sabine','nicole','katze','hund','gott','jesus','test'];
const PASS_LEET={'0':'o','1':'i','3':'e','4':'a','5':'s','7':'t','@':'a','$':'s'};
function passCheck(p){
  p=String(p||''); const len=p.length, full=p.toLowerCase(), s=full.slice(0,64), n=s.replace(/[013457@$]/g,c=>PASS_LEET[c]), spans=[];
  const o=full.length===len?p.slice(0,64):s;   // Wiederholung/Folge mit Groß-/Kleinschreibung: „qQq“, „hGFe“ sind im Zufallspasswort kein Muster
  const add=(a,b,cost,why)=>{ if(b-a>cost) spans.push({a,b,save:b-a-cost,why}); };
  for(let i=0;i<o.length;){ let j=i+1; while(j<o.length&&o[j]===o[i]) j++; if(j-i>=3) add(i,j,1,'repeat'); i=j; }          // aaaa
  for(let L=3;L<=o.length>>1;L++) for(let i=0;i+2*L<=o.length;i++){ const b=o.substr(i,L); let k=i+L;              // SommerSommer: erste Kopie bleibt
    while(o.substr(k,L)===b) k+=L; if(k>i+L){ add(i+L,k,1,'repeat'); i=k-1; } }
  for(let i=0;i<o.length-1;){ const d=o.charCodeAt(i+1)-o.charCodeAt(i); let j=i+1;                                     // abcd, 4321
    if((d===1||d===-1)&&/[a-zA-Z0-9]/.test(o[i])){ while(j<o.length&&/[a-zA-Z0-9]/.test(o[j])&&o.charCodeAt(j)-o.charCodeAt(j-1)===d) j++; if(j-i>=4) add(i,j,1,'seq'); }
    i=Math.max(i+1,j-1); }
  for(const row of PASS_ROWS) for(const r of [row,row.split('').reverse().join('')])                                 // qwertz, lkjhgfdsa
    for(let i=0;i<s.length;){ const at=r.indexOf(s[i]); let j=i; if(at>=0) while(j<s.length&&r[at+j-i]===s[j]) j++; if(j-i>=4){ add(i,j,1,'keyboard'); i=j; } else i++; }
  for(const m of s.matchAll(/(?:19|20)\d\d/g)) add(m.index,m.index+4,1,'year');
  for(const w of PASS_COMMON) for(let i=n.indexOf(w);i>=0;i=n.indexOf(w,i+1)) add(i,i+w.length,2,'common');           // auch p4ssw0rt
  spans.sort((x,y)=>y.save-x.save); const used=new Uint8Array(s.length), why=[]; let eff=full.length;
  for(const sp of spans){ let free=true; for(let i=sp.a;i<sp.b;i++) if(used[i]){ free=false; break; } if(!free) continue;
    used.fill(1,sp.a,sp.b); eff-=sp.save; if(!why.includes(sp.why)) why.push(sp.why); }
  if(/^\d+$/.test(p)){ eff=Math.min(eff,Math.floor(len*0.56)); why.push('digits'); }                                  // log2(10)/log2(62)
  const uniq=new Set(full).size; if(len>=8&&uniq<5){ eff=Math.min(eff,uniq*2); if(!why.includes('variety')) why.push('variety'); }
  const words=p.trim().split(/[\s\-_.,;]+/).filter(w=>w.length>=3).length;
  // weak braucht echte Ersparnis (≥ 4): ein einzelnes „qqq“/„1927“/„sdfg“ in einem 12-Zeichen-Zufallspasswort ist kein Muster (Review v1.6)
  const weak=why.length>0&&eff<12&&len-eff>=4, e=weak?eff:Math.max(eff,12);
  const level=(len<12||weak)?0:(e>=24||(e>=18&&words>=4))?3:(e>=16||(words>=3&&e>=14))?2:1;   // Wörter-Bonus nur, wenn die Wörter selbst nicht billig waren
  return {level, weak, why, eff};
}
function passStrength(p){ return passCheck(p).level; }

/* ---------- Markdown-Ansicht: kleine eigene Untermenge, hier nur die ZERLEGUNG (rein) — das Rendern macht die App per createElement ----------
   Blöcke: Überschrift (# bis ###), Absatz (Zeilenumbrüche bleiben), Liste (-, *, +, 1.), Kästchen (- [ ] / - [x]), Code (``` … ``` oder
   vier Leerzeichen/Tab), Trennlinie (---, ***, ___). Inline: **fett**, *kursiv* / _kursiv_, `code`. Keine Links (URLs bleiben Text),
   kein HTML, kein Fremd-Renderer — was nicht passt, bleibt Text. Entscheidung Nutzer 24.09.2026. */
function mdInline(s){ const out=[], re=/(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)|(\b_[^_\s][^_\n]*_\b)/g; let last=0, m;
  while((m=re.exec(s))){ if(m.index>last) out.push({t:'text',s:s.slice(last,m.index)});
    if(m[1]) out.push({t:'code',s:m[1].slice(1,-1)}); else if(m[2]) out.push({t:'b',s:m[2].slice(2,-2)}); else out.push({t:'i',s:m[0].slice(1,-1)});
    last=m.index+m[0].length; }
  if(last<s.length) out.push({t:'text',s:s.slice(last)}); return out; }
function mdParse(text){
  const lines=String(text||'').replace(/\r\n?/g,'\n').split('\n'), out=[]; let i=0, para=[], list=null, m;
  const flushP=()=>{ if(para.length){ out.push({type:'p',inline:mdInline(para.join('\n'))}); para=[]; } };
  const flushL=()=>{ if(list){ out.push(list); list=null; } };
  while(i<lines.length){ const l=lines[i];
    if(/^\s{0,3}```/.test(l)){ flushP(); flushL(); const buf=[]; i++; while(i<lines.length&&!/^\s{0,3}```/.test(lines[i])) buf.push(lines[i++]); i++; out.push({type:'code',text:buf.join('\n')}); continue; }
    if(/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(l)){ flushP(); flushL(); out.push({type:'hr'}); i++; continue; }
    // Überschrift: lineare Erkennung, schließende # per Schleife — die frühere Regex mit lazy Gruppe vor zwei \s* war kubisch (Audit run-1 #5)
    if((m=/^\s{0,3}(#{1,3})[ \t]+(.*)$/.exec(l))){ let t=m[2].trimEnd(); let k=t.length; while(k>0&&t[k-1]==='#') k--; if(k<t.length&&(k===0||/\s/.test(t[k-1]))) t=t.slice(0,k).trimEnd();
      flushP(); flushL(); out.push({type:'h',level:m[1].length,inline:mdInline(t)}); i++; continue; }
    if((m=/^\s{0,3}(?:([-*+])|(\d{1,9})[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/.exec(l))){ flushP(); const ordered=!!m[2];
      if(!list||list.ordered!==ordered){ flushL(); list={type:'list',ordered,items:[]}; }
      list.items.push({inline:mdInline(m[4]), check:m[3]===undefined?null:m[3]!==' '}); i++; continue; }
    if(/^(?: {4}|\t)/.test(l)){ flushP(); flushL(); const buf=[]; while(i<lines.length&&/^(?: {4}|\t)/.test(lines[i])) buf.push(lines[i++].replace(/^(?: {4}|\t)/,'')); out.push({type:'code',text:buf.join('\n')}); continue; }
    if(!l.trim()){ flushP(); flushL(); i++; continue; }
    flushL(); para.push(l); i++; }
  flushP(); flushL(); return out;
}
// Klartext einer Notiz fürs Kopieren (SecureClip): Titel, dann Text bzw. Checkliste als „- [x] …“-Zeilen
function noteText(e){ const first=e.type==='text'?(String(e.body||'').split('\n').map(l=>line(l,CAPS.title)).find(Boolean)||''):''; const head=e.title&&e.title!==first?e.title+'\n\n':''; if(e.type==='list') return head+(e.items||[]).map(x=>'- ['+(x.done?'x':' ')+'] '+x.text).join('\n'); return head+(e.body||''); }
// Checkliste ↔ Text: Zeilen werden Einträge (Kästchen-Marker verstanden), Einträge werden „- [x] …“-Zeilen
function linesToItems(body){ return sanitizeItems(String(body||'').split(/\r?\n/).map(l=>{ const m=/^\s*(?:[-*+]\s+)?(?:\[([ xX])\]\s*)?(.*)$/.exec(l); return {text:m?m[2]:l, done:!!(m&&m[1]&&m[1]!==' ')}; })); }
function itemsToBody(items){ return (items||[]).map(x=>'- ['+(x.done?'x':' ')+'] '+x.text).join('\n'); }
/* ---------- Standard-Notes-Import (v1.1, rein): entschlüsseltes Backup {version:'004', items:[…]} → fertige Einträge + Statistik ----------
   Format belegt aus standardnotes/app (Commit 000d2d7b, 22.09.2026) und Lexical v0.49.0 — Belege und Regeln in SN-FORMAT.md.
   Nur Notizen (content_type 'Note') und Tags (Kategorie) werden gelesen. Authenticator-Notizen (2FA-Geheimnisse) und Tabellen werden
   am Typ erkannt und NIE übernommen; ihr Text landet nirgends. Alles andere (Dateien, Komponenten, Schlüssel …) wird gezählt und übersprungen.
   IDs sind deterministisch aus der UUID (snId), damit ein zweiter Import dieselben Notizen trifft und der Merge entscheidet. */
const SN_DOMAIN='org.standardnotes.sn';
const SN_TYPES=['plain-text','markdown','code','rich-text','super','task','authentication','spreadsheet'];
const SN_EDITORS={'com.standardnotes.plain-text':'plain-text','com.standardnotes.super-editor':'super','org.standardnotes.token-vault':'authentication',
  'org.standardnotes.standard-sheets':'spreadsheet','org.standardnotes.code-editor':'code','org.standardnotes.plus-editor':'rich-text','org.standardnotes.bold-editor':'rich-text',
  'org.standardnotes.advanced-markdown-editor':'markdown','org.standardnotes.simple-markdown-editor':'markdown','org.standardnotes.markdown-visual-editor':'markdown',
  'org.standardnotes.minimal-markdown-editor':'markdown','org.standardnotes.fancy-markdown-editor':'markdown','org.standardnotes.simple-task-editor':'task'};
// 16 Hex aus der UUID: hintere Hälfte (Versions-/Varianten-Nibbles liegen vorn); sonst zwei FNV-1a-Hashes des Strings
function snId(uuid){ const s=String(uuid||'').toLowerCase().replace(/-/g,''); if(/^[0-9a-f]{32}$/.test(s)) return s.slice(16);
  let h1=0x811c9dc5, h2=0x050c5d1f; for(let i=0;i<s.length;i++){ const c=s.charCodeAt(i); h1=Math.imul(h1^c,0x01000193)>>>0; h2=Math.imul(h2^c,0x01000193)>>>0; }
  return h1.toString(16).padStart(8,'0')+h2.toString(16).padStart(8,'0'); }
function snDate(v, fb){ if(typeof v!=='string'||!v) return fb; const t=Date.parse(v); return Number.isFinite(t)?new Date(t).toISOString():fb; }   // ISO oder „Thu Jan 01 2026 …“ (client_updated_at)
// HTML (Rich-Text-Editor) → Klartext ohne den HTML-Parser des Browsers (Build-Schranke gegen HTML-Senken): Blockenden werden Zeilenumbrüche, Tags fallen weg, Entities werden dekodiert. Linear.
const HTML_ENT={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
function htmlToText(html){ const s=String(html||''); let out='', i=0;
  for(;;){ const a=s.indexOf('<',i); if(a<0){ out+=s.slice(i); break; } const b=s.indexOf('>',a+1); if(b<0){ out+=s.slice(i); break; }   // jedes Zeichen höchstens zweimal angefasst
    out+=s.slice(i,a); const close=s[a+1]==='/'; const m=/^([a-z][a-z0-9]*)/i.exec(s.slice(a+(close?2:1),Math.min(b,a+16))); const n=m?m[1].toLowerCase():'';
    if(n==='br') out+='\n'; else if(close&&/^(?:p|div|h[1-6]|li|tr|blockquote|pre|section|article|header|footer|table|ul|ol)$/.test(n)) out+='\n';
    else if(!close&&n==='li') out+='- '; else if(close&&(n==='td'||n==='th')) out+=' | ';
    i=b+1; }
  out=out.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,6});/gi,(m,e)=>{ if(e[0]==='#'){ const cp=e[1]==='x'||e[1]==='X'?parseInt(e.slice(2),16):parseInt(e.slice(1),10);
    return Number.isFinite(cp)&&cp>0&&cp<0x110000&&!(cp>=0xd800&&cp<=0xdfff)?String.fromCodePoint(cp):m; } const k=e.toLowerCase(); return Object.prototype.hasOwnProperty.call(HTML_ENT,k)?HTML_ENT[k]:m; });
  return out.replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim(); }
// Lexical-EditorState (Super-Editor) → unsere Markdown-Untermenge. st zählt, was nur vereinfacht ankommt (Tabellen als „| a | b |“-Zeilen,
// Bilder/Dateien/Einbettungen als Platzhalter). Unbekannte Knoten: Kinder weiterlesen, sonst ihren Text. Liefert null, wenn text kein Lexical-JSON ist.
function lexToMd(text, st){ let d; try{ d=JSON.parse(text); }catch(_){ return null; } if(!d||typeof d!=='object'||!d.root||typeof d.root!=='object') return null;
  const kids=n=>Array.isArray(n.children)?n.children.filter(c=>c&&typeof c==='object'):[];
  let depth=0; const deep=fn=>(...a)=>{ if(depth>64){ st.lost.deep=(st.lost.deep||0)+1; return ''; } depth++; try{ return fn(...a); }finally{ depth--; } };   // Tiefenwächter (Stack)
  const inline=deep(n=>{ const t=n.type;
    if(t==='text'||t==='code-highlight'||t==='hashtag'||t==='tab'){ let s=String(n.text||''); if(t==='text'&&s.trim()){ const f=n.format|0; if(f&16) s='`'+s.replace(/`/g,'')+'`'; else if(f&1) s='**'+s+'**'; else if(f&2) s='*'+s+'*'; } return s; }
    if(t==='linebreak') return '\n';
    if(t==='link'||t==='autolink'){ const s=kids(n).map(inline).join(''), u=typeof n.url==='string'?n.url:''; return s&&u&&s!==u?s+' ('+u+')':(s||u); }
    if(t==='unencrypted-image'||t==='inline-file'){ st.lost.images++; const name=typeof n.alt==='string'&&n.alt?n.alt:(typeof n.fileName==='string'?n.fileName:''); return '['+(t==='inline-file'?'Datei':'Bild')+(name?': '+name:'')+']'; }
    if(t==='snfile'){ st.lost.files++; return '[Datei]'; }
    if(t==='snbubble'){ st.lost.embeds++; return '[Verweis]'; }
    if(t==='youtube'){ st.lost.embeds++; return '[YouTube'+(typeof n.videoID==='string'?': '+n.videoID:'')+']'; }
    if(t==='tweet'){ st.lost.embeds++; return '[Tweet'+(typeof n.id==='string'?': '+n.id:'')+']'; }
    return kids(n).map(inline).join('')||(typeof n.text==='string'?n.text:''); });
  const codeText=n=>kids(n).map(c=>c.type==='linebreak'?'\n':c.type==='tab'?'\t':(typeof c.text==='string'?c.text:kids(c).length?codeText(c):'')).join('');
  const listLines=(n, lvl, out)=>{ if(depth>64) return; depth++; try{ const ordered=n.listType==='number', check=n.listType==='check'; let k=Number.isInteger(n.start)&&n.start>0?n.start:1;
    for(const it of kids(n)){ if(it.type!=='listitem'){ continue; }
      const sub=kids(it).filter(c=>c.type==='list'), own=kids(it).filter(c=>c.type!=='list');
      if(own.length){ const mark=ordered?(k++)+'. ':'- '; const box=check?'['+(it.checked===true?'x':' ')+'] ':''; out.push('  '.repeat(Math.min(lvl,1))+mark+box+own.map(inline).join('').replace(/\n/g,' ').trim()); }
      for(const s of sub) listLines(s, lvl+1, out); } }finally{ depth--; } };
  const blocks=[];
  const block=deep(n=>{ const t=n.type;
    if(t==='root'){ kids(n).forEach(block); return; }
    if(t==='paragraph'){ const s=kids(n).map(inline).join('').trim(); if(s) blocks.push(s); return; }
    if(t==='heading'){ const lv=Math.min(3,Math.max(1,parseInt(String(n.tag||'h1').slice(1),10)||1)); blocks.push('#'.repeat(lv)+' '+kids(n).map(inline).join('').replace(/\n/g,' ').trim()); return; }
    if(t==='quote'){ blocks.push(kids(n).map(inline).join('').split('\n').map(l=>'> '+l).join('\n')); return; }
    if(t==='list'){ const out=[]; listLines(n,0,out); if(out.length) blocks.push(out.join('\n')); return; }
    if(t==='code'){ const lang=typeof n.language==='string'?n.language.replace(/[^\w+#.-]/g,''):''; blocks.push('```'+lang+'\n'+codeText(n).replace(/^(\s{0,3})```/gm,'$1` ` `')+'\n```'); return; }
    if(t==='horizontalrule'){ blocks.push('---'); return; }
    if(t==='table'){ st.lost.tables++; const rows=kids(n).filter(r=>r.type==='tablerow').map(r=>'| '+kids(r).filter(c=>c.type==='tablecell').map(c=>kids(c).map(inline).join(' ').replace(/\s+/g,' ').trim()).join(' | ')+' |'); if(rows.length) blocks.push(rows.join('\n')); return; }
    if(t==='collapsible-container'){ for(const c of kids(n)){ if(c.type==='collapsible-title'){ const s=kids(c).map(inline).join('').trim(); if(s) blocks.push('**'+s+'**'); } else if(c.type==='collapsible-content') kids(c).forEach(block); else block(c); } return; }
    if(t==='collapsible-title'||t==='collapsible-content'||t==='mark'||t==='overflow'||t==='listitem'||t==='tablerow'||t==='tablecell'){ const hasBlock=kids(n).some(c=>['paragraph','heading','list','code','quote','table'].includes(c.type)); if(hasBlock) kids(n).forEach(block); else { const s=kids(n).map(inline).join('').trim(); if(s) blocks.push(s); } return; }
    const s=inline(n).trim(); if(s) blocks.push(s); });   // Decorator auf Blockebene (Bild, Datei, Einbettung) und Unbekanntes
  block(d.root); return blocks.join('\n\n'); }
function snImport(raw, opt){ opt=opt||{}; const now=opt.now||Date.now(); const trashBudget=opt.trashBudget==null?MAX_TRASH:Math.max(0,opt.trashBudget|0);
  let d; try{ d=JSON.parse(String(raw)); }catch(_){ throw new Error('snjson'); }
  if(!d||typeof d!=='object'||Array.isArray(d)||!Array.isArray(d.items)) throw new Error('snformat');
  if(d.keyParams||d.auth_params) throw new Error('snencrypted');
  const st={notes:0,lists:0,trashed:0,trashOver:0,pinned:0,fav:0,archived:0,tags:0,skipped:{encrypted:0,auth:0,sheet:0,files:0,other:0,deleted:0,empty:0},capped:{body:0,items:0,item:0},lost:{tables:0,images:0,files:0,embeds:0}};
  const isObj=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
  // Tags: der Tag verweist auf seine Notizen ({uuid, content_type:'Note'}), der Kind-Tag auf den Eltern-Tag (reference_type 'TagToParentTag'); Altform „a.b“ im Titel
  const tags=new Map(), noteTags=new Map();
  for(const it of d.items){ if(!isObj(it)||it.content_type!=='Tag'||!isObj(it.content)||typeof it.uuid!=='string') continue; const c=it.content; let parent=null;
    for(const r of (Array.isArray(c.references)?c.references:[])){ if(!isObj(r)||typeof r.uuid!=='string') continue;
      if(r.reference_type==='TagToParentTag'){ if(!parent) parent=r.uuid; } else if(r.content_type==='Note'){ const l=noteTags.get(r.uuid)||[]; l.push(it.uuid); noteTags.set(r.uuid,l); } }
    tags.set(it.uuid,{title:typeof c.title==='string'?c.title:'',parent}); st.tags++; }
  const tagPath=u=>{ const parts=[], seen=new Set(); while(u&&tags.has(u)&&!seen.has(u)&&parts.length<16){ seen.add(u); const t=tags.get(u); parts.unshift(...t.title.split('.').map(s=>line(s,CAPS.cat)).filter(Boolean)); u=t.parent; } return parts; };
  const catFor=(uuid, refs)=>{ const l=(noteTags.get(uuid)||[]).slice(); for(const r of refs){ if(isObj(r)&&r.content_type==='Tag'&&typeof r.uuid==='string'&&tags.has(r.uuid)&&!l.includes(r.uuid)) l.push(r.uuid); }
    if(!l.length) return ''; const parts=tagPath(l[0]); if(!parts.length) return ''; const full=parts.join('/'); return full.length<=CAPS.cat?full:parts[parts.length-1]; };   // erster Tag, Pfad „Eltern/Kind“; zu lang → nur das Blatt
  const entries=[], trashed=[], nowIso=new Date(now).toISOString();
  for(const it of d.items){
    if(!isObj(it)){ st.skipped.other++; continue; }
    if(it.deleted===true||it.content==null){ st.skipped.deleted++; continue; }
    if(typeof it.content==='string'){ st.skipped.encrypted++; continue; }
    if(it.content_type==='Tag') continue;
    if(it.content_type!=='Note'||!isObj(it.content)){ if(it.content_type==='SN|File') st.skipped.files++; else st.skipped.other++; continue; }
    const c=it.content, app=isObj(c.appData)&&isObj(c.appData[SN_DOMAIN])?c.appData[SN_DOMAIN]:{};
    const kind=SN_TYPES.includes(c.noteType)?c.noteType:(Object.prototype.hasOwnProperty.call(SN_EDITORS,c.editorIdentifier)?SN_EDITORS[c.editorIdentifier]:'plain-text');
    if(kind==='authentication'){ st.skipped.auth++; continue; }   // 2FA-Geheimnisse: nie übernehmen, nie anfassen
    if(kind==='spreadsheet'){ st.skipped.sheet++; continue; }
    const text=(typeof c.text==='string'?c.text:'').replace(/\r\n?/g,'\n'); let title=line(c.title,CAPS.title);
    let type='text', body='', items=[], md=false;
    if(kind==='task'){ type='list'; const ls=text.split('\n').filter(l=>l.trim()); items=linesToItems(text); if(ls.length>ITEMS_MAX) st.capped.items++; if(ls.some(l=>l.length>CAPS.item+6)) st.capped.item++; }
    else if(kind==='rich-text') body=htmlToText(text);
    else if(kind==='super'){ const r=lexToMd(text, st); if(r===null) body=text; else { body=r; md=true; } }
    else { body=text; md=kind==='markdown'; }
    if(body.length>CAPS.body) st.capped.body++;
    if(!title&&type==='text') title=body.split('\n').map(l=>line(l,CAPS.title)).find(Boolean)||'';   // wie der Editor: erste Zeile wird Titel
    if(!title&&(type==='text'?!body.trim():!items.length)){ st.skipped.empty++; continue; }
    const updated=snDate(app.client_updated_at, snDate(it.updated_at, nowIso)), created=snDate(it.created_at, updated);
    const e=sanitizeEntry({id:snId(it.uuid), type, cat:catFor(typeof it.uuid==='string'?it.uuid:'', Array.isArray(c.references)?c.references:[]), title, body, items,
      fav:c.starred===true, pinned:app.pinned===true, md, created, updated, deleted:c.trashed===true?nowIso:null}, now);   // Papierkorb: Frist läuft ab jetzt, sonst wipeTrash sofort
    if(!e){ st.skipped.other++; continue; }
    if(e.pinned) st.pinned++; if(e.fav) st.fav++; if(app.archived===true) st.archived++;
    if(e.deleted) trashed.push(e); else { entries.push(e); if(type==='list') st.lists++; else st.notes++; }
  }
  trashed.sort((a,b)=>ts(b.updated)-ts(a.updated)); const keep=trashed.slice(0,trashBudget); st.trashed=keep.length; st.trashOver=trashed.length-keep.length;
  return {entries:entries.concat(keep), stats:st};
}
/* ---------- ZIP lesen (rein, nur Inhaltsverzeichnis + Datenlage; das Entpacken macht der Aufrufer mit DecompressionStream) ----------
   Für das Standard-Notes-Backup: die App lädt ein ZIP mit „Standard Notes Backup and Import File.txt“ plus einem Ordner Items/. Wir lesen
   genau EINEN Eintrag, deckeln seine Größe und fassen sonst nichts an. Kein ZIP64, keine Verschlüsselung, keine Mehrteiler (→ Fehlercodes). */
const ZIP_NAME_SN='Standard Notes Backup and Import File.txt', ZIP_MAX_ENTRIES=100000;
function zipEntries(u8){ if(!(u8 instanceof Uint8Array)) throw new Error('zipbad'); const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength), n=u8.byteLength;
  let eocd=-1; for(let i=n-22;i>=0&&i>=n-22-65535;i--){ if(dv.getUint32(i,true)===0x06054b50){ eocd=i; break; } } if(eocd<0) throw new Error('zipbad');
  const count=dv.getUint16(eocd+10,true), cdSize=dv.getUint32(eocd+12,true), cdOff=dv.getUint32(eocd+16,true);
  if(dv.getUint16(eocd+4,true)!==0||dv.getUint16(eocd+6,true)!==0) throw new Error('zipmulti');   // mehrteiliges Archiv
  if(count===0xFFFF||cdOff===0xFFFFFFFF||cdSize===0xFFFFFFFF) throw new Error('zip64'); if(cdOff+cdSize>n||count>ZIP_MAX_ENTRIES) throw new Error('zipbad');
  const td=new TextDecoder('utf-8'), out=[]; let p=cdOff;
  for(let k=0;k<count;k++){ if(p+46>n||dv.getUint32(p,true)!==0x02014b50) throw new Error('zipbad');
    const flags=dv.getUint16(p+8,true), method=dv.getUint16(p+10,true), csize=dv.getUint32(p+20,true), usize=dv.getUint32(p+24,true);
    const nl=dv.getUint16(p+28,true), el=dv.getUint16(p+30,true), cl=dv.getUint16(p+32,true), lho=dv.getUint32(p+42,true);
    if(p+46+nl+el+cl>n) throw new Error('zipbad');
    out.push({name:td.decode(u8.subarray(p+46,p+46+nl)), method, csize, usize, lho, encrypted:!!(flags&1), zip64:csize===0xFFFFFFFF||usize===0xFFFFFFFF||lho===0xFFFFFFFF});
    p+=46+nl+el+cl; }
  return out; }
// Datenbereich eines Eintrags (über den lokalen Kopf, dessen Namens-/Extra-Längen abweichen dürfen). max = Deckel für die entpackte Größe.
function zipSlice(u8, e, max){ if(e.encrypted) throw new Error('zipenc'); if(e.zip64) throw new Error('zip64'); if(e.method!==0&&e.method!==8) throw new Error('zipmethod');
  if(e.usize>max) throw new Error('toolarge'); const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength), n=u8.byteLength;
  if(e.lho+30>n||dv.getUint32(e.lho,true)!==0x04034b50) throw new Error('zipbad'); const off=e.lho+30+dv.getUint16(e.lho+26,true)+dv.getUint16(e.lho+28,true);
  if(off+e.csize>n) throw new Error('zipbad'); return {data:u8.subarray(off,off+e.csize), deflated:e.method===8, usize:e.usize}; }
// Der Backup-Eintrag: genau ein Treffer auf den Dateinamen (auch in einem Unterordner), sonst 'zipnosn'
function zipFindSn(u8){ const hits=zipEntries(u8).filter(e=>e.name===ZIP_NAME_SN||e.name.endsWith('/'+ZIP_NAME_SN)); if(!hits.length) throw new Error('zipnosn'); return hits[0]; }
/* === VAULT-FORMAT END === */

/* ============================================================
   App — Sperre, Persist, Liste, Editor, Checkliste, Papierkorb, Backup, Einstellungen.
   Aus Alien Pass v1.8 übernommen (boot/setup/unlock/lock, persist mit Nachprüfung, Auto-Lock, Zwischenablage,
   Papierkorb, Backup); neu sind der Editor mit Autosave, die Checkliste und die Markdown-Ansicht.
   Fingerabdruck (Schritt 4) und PIN/Desktop (Schritt 5) folgen; bioGen bleibt die Generation aller Pforten.
   ============================================================ */
const App = (function(){
  let DEK=null, KDF=null, WRAP=null, VAULT=null;      // Sitzungszustand — auf lock() alles null
  let editId=null, editing=false, formType='text', mdMode='edit', search='', catFilter=null, favFilter=false;
  let clipTimer=null, clipOwnedAt=0, failCount=0, lockedUntil=0, pendingImport=null, kdfTouched=false;
  let pendingUnlock=null, pendingSecret=null, pendingOtpauth='';   // Aegis-Hürde: Schlüssel warten auf den Code / Einrichtung läuft
  let bioGen=0;             // Generation ALLER Pforten (Alien Pass v1.8): jede Sperre erhöht sie, laufende Pforten verwerfen ihr Ergebnis
  const DESK = window.AlienDesktop || null;   // Desktop-Hülle (Schritt 5), sonst null
  // Notizen-Speicher: Desktop = eigene Datei über die Hülle (synchron, wirft bei Lesefehlern), sonst localStorage.
  // Ein Lesefehler ist NIE „keine Notizen“ — sonst böte boot() „Einrichten“ an und überschriebe die echte Datei.
  // Android: eigenes VaultStore-Plugin (patch-hardening.mjs) — Datei files/alien-notes/notes.ainv, atomar (Temp + fsync + rename), OHNE die
  // localStorage-Quota der WebView (gemessen 24.09.2026: ~5 MB gespeicherte Datei = ~3,9 MB Notiztext). Browser: localStorage (Tests).
  const _CAP0=window.Capacitor||null;
  const NSTORE=(_CAP0&&_CAP0.isNativePlatform&&_CAP0.isNativePlatform()&&_CAP0.Plugins&&_CAP0.Plugins.VaultStore)?_CAP0.Plugins.VaultStore:null;
  let storedLen=0;   // Dateigröße beim letzten LESEN (Entsperren/Pforte/Export), NICHT beim Schreiben: die 4-KB-Toleranz in persist() darf nicht mitwandern,
                     // sonst treiben kleine Autosaves die Datei Schritt für Schritt über die Lesegrenze (Audit run-1b #1). Je Sitzung höchstens +4 KB über 20 MB.
  async function vaultGet(){ let r; if(DESK) r=DESK.store.read(); else if(NSTORE){ const x=await NSTORE.read(); r=(x&&typeof x.data==='string')?x.data:null; } else r=localStorage.getItem(LS_KEY); storedLen=r?r.length:0; return r; }
  async function vaultSet(s){ if(DESK){ DESK.store.write(s); } else if(NSTORE){ const r=await NSTORE.write({data:s}); if(!r||r.ok!==true) throw new Error('store'); } else localStorage.setItem(LS_KEY, s); }
  async function vaultDel(){ if(DESK){ DESK.store.del(); } else if(NSTORE){ await NSTORE.del(); } else localStorage.removeItem(LS_KEY); storedLen=0; }
  // Ein Stand aus dem Browser-Speicher (z.B. Web-Test in der Hülle) wird einmalig in die Datei übernommen, erst nach Gegenlesen gelöscht
  async function migrateStore(){ if(!DESK&&!NSTORE) return; let ls=null; try{ ls=localStorage.getItem(LS_KEY); }catch(_){} if(!ls) return;
    const cur=await vaultGet(); if(cur===null){ await vaultSet(ls); if((await vaultGet())!==ls) throw new Error('store'); } else if(cur!==ls) return;
    localStorage.removeItem(LS_KEY); }

  /* ===== KIT: Helfer ===== */
  const $ = id => document.getElementById(id);
  const show = id => $(id).classList.remove('hidden');
  const hide = id => $(id).classList.add('hidden');
  function screen(name){ ['setup','lock','totp','app'].forEach(s=>$('screen-'+s).classList.add('hidden')); $('screen-'+name).classList.remove('hidden'); }
  function toast(msg){ const t=$('toast'); if(!t) return; t.textContent=msg; t.classList.remove('hidden'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.add('hidden'),2600); }
  /* ---------- Rückfrage als eigener DOM-Dialog (v1.1) statt confirm(): der Android-Systemdialog erbt FLAG_SECURE nicht — ein Screenshot bei
     offener Löschnachfrage zeigte den Notiztitel (Gerätetest 25.09.2026). ask(msg,{ok,danger}) liefert ein Promise<boolean>; nur ein Dialog zur
     Zeit (eine zweite Frage gilt als abgelehnt); Escape/Hintergrund = Abbrechen; clearRendered() schließt ihn beim Sperren mit false, der wartende
     Aufrufer prüft danach VAULT/editing selbst nach. Text nur per textContent. ---------- */
  let dlgResolve=null, dlgPrev=null;
  function ask(msg, opt){ opt=opt||{}; if(dlgResolve) return Promise.resolve(false);
    return new Promise(res=>{ dlgResolve=res; dlgPrev=document.activeElement; $('dlg-msg').textContent=msg;
      const b=$('dlg-ok'); b.textContent=tr(opt.ok||'dlg.ok'); b.classList.toggle('danger',!!opt.danger); show('dlg'); $('dlg-cancel').focus(); }); }
  function dialogClose(v){ const r=dlgResolve; if(!r) return; dlgResolve=null; hide('dlg'); $('dlg-msg').textContent=''; $('dlg-ok').classList.remove('danger');
    const f=dlgPrev; dlgPrev=null; if(f&&document.contains(f)&&typeof f.focus==='function'){ try{ f.focus(); }catch(_){} } r(!!v); }
  function dialogOk(){ dialogClose(true); }
  function dialogCancel(){ dialogClose(false); }
  function dialogOpen(){ return !!dlgResolve; }
  function dialogKey(ev){ if(!dlgResolve) return false;   // offener Dialog: Escape bricht ab, Tab pendelt zwischen den zwei Knöpfen, alles andere bleibt im Dialog
    if(ev.key==='Escape'){ dialogCancel(); return true; }
    if(ev.key==='Tab'){ const a=$('dlg-cancel'), b=$('dlg-ok'); (document.activeElement===a?b:a).focus(); return true; }
    return false; }
  function err(id,msg){ const e=$(id); if(!e) return; if(!msg){ e.classList.add('hidden'); e.textContent=''; return; } e.textContent=msg; e.classList.remove('hidden'); }
  function el(tag, cls, text){ const n=document.createElement(tag); if(cls) n.className=cls; if(text!=null) n.textContent=text; return n; }
  const nowIso=()=>new Date().toISOString();
  const live=()=>VAULT?VAULT.entries.filter(e=>!e.deleted):[];
  const byId=id=>VAULT?VAULT.entries.find(e=>e.id===id&&!e.deleted):null;
  // Papierkorb: gelöscht, aber noch mit Inhalt. Gewipte Löschmarken gehören NICHT dazu — dort ist nichts wiederherzustellen.
  const trash=()=>VAULT?VAULT.entries.filter(e=>e.deleted&&!isWiped(e)).sort((a,b)=>ts(b.deleted)-ts(a.deleted)):[];
  const trashById=id=>VAULT?VAULT.entries.find(e=>e.id===id&&e.deleted&&!isWiped(e)):null;
  const fmtDate=iso=>{ const t=ts(iso); return t?new Date(t).toLocaleDateString(LANG==='de'?'de-DE':'en-GB'):'—'; };
  const titleOf=e=>e.title||tr('trash.untitled');

  /* ---------- persistence (wortgleich Alien Pass v1.8) ---------- */
  // Gesperrt während des await → dieser Blob gehört zu einer toten Sitzung. Aufrufer erkennen das an .locked
  // und überspringen ihren Rollback (VAULT ist längst null, ein Rollback schriebe nur einen toten Stand zurück).
  function lockedErr(){ const e=new Error('locked'); e.locked=true; return e; }
  // Rollback-Helfer für die Aufrufer: Snapshot zurückspielen, außer die Sitzung ist zwischendurch gesperrt worden.
  const rollback=snap=>e=>{ if(e&&e.locked) return; if(VAULT) VAULT.entries=snap; };
  // Laufende Schreibvorgänge als Kette (Audit run-1 #1): lockSaving wartet darauf, bevor lock() die Sitzung für tot erklärt.
  let inflight=Promise.resolve();
  function persist(){ const run=persistOnce(); inflight=inflight.then(()=>run,()=>run).then(()=>{},()=>{}); return run; }
  async function persistOnce(){
    const dek=DEK, kdf=KDF, wrap=WRAP, vault=VAULT;          // Schlüssel-Generation pinnen (lock/changePass während des await)
    if(!dek||!vault) throw lockedErr();
    const list=vault.entries;                                  // Eintragsstand mitpinnen (Audit run-5 #6)
    const entries=purgeTombstones(wipeTrash(vault.entries));   // Wipe/Purge erst NACH erfolgreichem Schreiben committen
    const body=await encryptBody(Object.assign({},vault,{entries}), dek, kdf);
    // Nachprüfen: das Pinnen allein genügt nicht, der Stand kann während des await veraltet sein (Querfund Sachwert-Tresor v2.9.1).
    if(!DEK||VAULT!==vault) throw lockedErr();                 // zwischenzeitlich gesperrt → NICHT mehr schreiben
    if(vault.entries!==list) return persistOnce();             // Eintragsstand veraltet → neu rechnen statt den alten committen (Schreiber setzen IMMER ein neues Array, Audit run-1 #2)
    if(DEK!==dek||KDF!==kdf||WRAP!==wrap) return persistOnce();    // Passphrase gewechselt → mit dem neuen Schlüssel neu verschlüsseln,
                                                               // sonst überschriebe dieser alte Blob den frischen von changePass
    const s=serializeFile(kdf, wrap, body);
    // Wachstum über die Grenze verhindern; Schrumpfen und Kleinkram (Papierkorb-Marke, Haken) gehen immer, damit man aufräumen kann — aber gemessen an der Größe
    // beim Entsperren (storedLen), nicht am letzten Schreiben, und nie bis an die Lesegrenze heran (Audit run-1b #1: mitwandernde Toleranz = Ratsche)
    if(s.length>MAX_FILE_BYTES&&(s.length>storedLen+4096||s.length>MAX_READ_BYTES-1048576)){ const e=new Error('filefull'); e.fileFull=true; toast(tr('err.fileFull',{m:MAX_FILE_BYTES/1048576})); throw e; }
    try{ await vaultSet(s); }
    catch(e){ toast(tr('err.saveFailed')); throw e; }
    if(VAULT===vault) vault.entries=entries;
  }
  function fileErrMsg(e){ const c=e&&e.message; return tr(c==='newer'?'err.fileNewer':c==='kdfbounds'?'err.fileBounds':c==='toolarge'?'err.fileLarge':c==='toomany'?'err.tooMany':'err.fileFormat'); }

  /* ---------- boot / setup / unlock / lock ---------- */
  async function boot(){
    loadLockState(); syncCombos();
    let raw; try{ await migrateStore(); raw=await vaultGet(); }catch(_){ screen('lock'); renderPinGate(); renderBioGate(); err('lock-err',tr('err.storeRead')); return; }   // auch hier Riegel und Slots rendern (Audit run-8 #11)
    if(!raw){ screen('setup'); setTimeout(()=>$('setup-pass1').focus(),100); benchKdf(); bioDrop(true); pinDrop(); }   // ohne Datei weder Fingerabdruck-Slot noch PIN-Slot
    else { screen('lock'); renderPinGate(); setTimeout(()=>$((PIN&&!pinHold)?'lock-pin':'lock-pass').focus(),100); bioProbe(bioAuto); }   // bioAuto wird erst von afterGate() wieder gesetzt (nach „Jetzt sperren“ kein Auto-Prompt bis zur nächsten Entsperrung, Audit run-3)
    const soft=document.documentElement.getAttribute('data-theme')==='soft';
    $('th-dark').classList.toggle('on',!soft); $('th-soft').classList.toggle('on',soft);
  }
  async function benchKdf(){
    if(benchKdf._done) return; benchKdf._done=true;
    $('setup-bench').textContent=tr('bench.run');
    await new Promise(r=>setTimeout(r,250));
    try{
      const t0=performance.now();
      await argon2Raw(passBytes('alien-notes-benchmark'), {m:KDF_DEFAULT.m,t:KDF_DEFAULT.t,p:KDF_DEFAULT.p,salt:rand(16)});
      const ms=Math.round(performance.now()-t0);
      let key='bench.done';
      if(!kdfTouched){ if(ms>2500){ $('setup-kdf').value='32768'; key='bench.light'; } else if(ms<400){ $('setup-kdf').value='131072'; key='bench.strong'; } syncCombo('setup-kdf'); }
      $('setup-bench').textContent=tr(key,{ms});
    }catch(_){ $('setup-bench').textContent=''; }
  }
  async function doSetup(){
    if(doSetup._busy) return; err('setup-err');
    const p1=$('setup-pass1').value, p2=$('setup-pass2').value;
    if(p1.length<12) return err('setup-err',tr('err.setupShort'));
    if(p1!==p2) return err('setup-err',tr('err.setupMismatch'));
    { const c=passCheck(p1); if(c.weak&&!(await ask(tr('confirm.weakPass',{why:whyText(c.why)}),{ok:'dlg.useAnyway'}))) return; }   // Rückfrage, kein Verbot
    if(doSetup._busy||$('setup-pass1').value!==p1) return;      // während der Rückfrage: zweiter Aufruf oder geändertes Feld → nichts anlegen
    const btn=$('setup-btn'), orig=btn.textContent; doSetup._busy=true; btn.disabled=true; btn.textContent=tr('busy.creating');
    try{
      const m=parseInt($('setup-kdf').value,10);
      const kdf={m:[32768,65536,131072].includes(m)?m:KDF_DEFAULT.m, t:KDF_DEFAULT.t, p:KDF_DEFAULT.p, salt:rand(16)};
      const kek=await deriveKek(passBytes(p1), kdf);
      const dekX=await newDek(); const wrap=await wrapDek(dekX, kek, kdf);
      const dek=await unwrapDek(wrap, kek, kdf, false);            // Sitzungsschlüssel nicht extrahierbar
      DEK=dek; KDF=kdf; WRAP=wrap; VAULT=emptyVault();
      await persist();
    }catch(e){ DEK=KDF=WRAP=VAULT=null; return err('setup-err',tr('err.setupFailed')); }
    finally{ doSetup._busy=false; btn.disabled=false; btn.textContent=orig; }
    $('setup-pass1').value=$('setup-pass2').value=''; $('setup-meter').textContent='';
    enterApp(); toast(tr('toast.vaultCreated'));
  }
  async function doUnlock(){
    if(doUnlock._busy||doPin._busy) return; err('lock-err');                         // nicht neben einem PIN-Argon2 (Audit run-8); ein hängender Fingerabdruck-Prompt darf die Passphrase NICHT blockieren
    loadLockState();                                                                   // Stand eines anderen Tabs übernehmen
    const now=Date.now(); if(now<lockedUntil) return err('lock-err',tr('err.wait',{s:Math.ceil((lockedUntil-now)/1000)}));
    // Riegel SOFORT, vor dem ersten await (vaultGet ist seit dem Dateispeicher asynchron): sonst passierten zwei Pforten gleichzeitig die _busy-Prüfung
    const btn=$('unlock-btn'), orig=btn.textContent; doUnlock._busy=true; btn.disabled=true; btn.textContent=tr('busy.decrypting'); renderBioGate(); renderPinGate();   // Fingerabdruck- und PIN-Knopf solange aus
    const release=()=>{ doUnlock._busy=false; btn.disabled=false; btn.textContent=orig; renderBioGate(); renderPinGate(); };
    let raw; try{ raw=await vaultGet(); }catch(_){ release(); $('lock-pass').value=''; maskInputs('#screen-lock'); return err('lock-err',tr('err.storeRead')); } if(!raw){ release(); return boot(); }
    let f; try{ f=parseFile(raw); }catch(e){ release(); $('lock-pass').value=''; maskInputs('#screen-lock'); return err('lock-err',fileErrMsg(e)); }
    const gen=bioGen;                                                                  // Generation: gewinnt zwischendurch der Fingerabdruck, verfällt dieses Ergebnis (Audit run-3 #1)
    try{
      const kek=await deriveKek(passBytes($('lock-pass').value), f.kdf);
      const dek=await unwrapDek(f.wrap, kek, f.kdf, false);
      const dekX=(bioNeedsRearm&&BIO&&bioMarker())?await unwrapDek(f.wrap, kek, f.kdf, true):null;   // nur zum Neu-Bewaffnen des Fingerabdruck-Slots nach Neustart
      const obj=await decryptBody(f.body, dek, f.kdf);
      const v=sanitizeVault(obj);                                     // auch lokal: Whitelist beim Unlock
      if(gen!==bioGen||DEK||pendingUnlock){ $('lock-pass').value=''; maskInputs('#screen-lock'); return; }   // eine andere Pforte hat die Sitzung schon geöffnet: nichts überschreiben
      if(v.totp){ pendingUnlock={dek, kdf:f.kdf, wrap:f.wrap, vault:v}; }   // Aegis-Hürde: Schlüssel erst nach Code-Prüfung in die Sitzung
      else { DEK=dek; KDF=f.kdf; WRAP=f.wrap; VAULT=v; failCount=0; lockedUntil=0; saveLockState(); }
      bioRearmDek=dekX;
    }catch(e){
      if(gen!==bioGen||DEK||pendingUnlock){ $('lock-pass').value=''; maskInputs('#screen-lock'); return; }   // verspäteter Fehlversuch darf keine offene Sitzung stören
      failCount++; if(failCount>=3) lockedUntil=Date.now()+Math.min(30,(failCount-2)*2)*1000; saveLockState();
      $('lock-pass').value=''; maskInputs('#screen-lock');                    // Fehlversuch: Eingabe nie stehen lassen (Audit run-2 #1)
      return err('lock-err', e&&e.message==='toomany'?tr('err.tooMany'):tr('err.wrongPass'));
    }finally{ release(); }
    afterGate();
  }
  // Gemeinsamer Abschluss von Passphrase- und Fingerabdruck-Pfad: Eingaben leeren, Aegis-Wartestellung oder App
  function afterGate(){
    $('lock-pass').value=''; $('lock-pin').value=''; maskInputs('#screen-lock'); bioMsg(''); pinMsg(''); bioAuto=true;
    if(pendingUnlock){ if(leaveGate()) return; screen('totp'); $('totp-code').value=''; err('totp-err'); resetIdle(); setTimeout(()=>$('totp-code').focus(),100); return; }   // Idle-Sperre gilt auch in der Wartestellung
    releaseHolds(); enterApp();
  }
  // Riegel („Jetzt sperren“) erst lösen, wenn die LETZTE Pforte bestanden ist — bei gesetzter Aegis-Hürde also erst nach dem Code (Audit run-8 #12)
  function releaseHolds(){ setBioHold(false); pinHold=false; renderPinGate(); }
  async function doTotp(){
    if(doTotp._busy||!pendingUnlock) return; err('totp-err');
    loadLockState();
    const now=Date.now(); if(now<lockedUntil) return err('totp-err',tr('err.wait',{s:Math.ceil((lockedUntil-now)/1000)}));
    const code=$('totp-code').value.trim(); if(!/^\d{6,8}$/.test(code)) return err('totp-err',tr('err.totp6'));
    doTotp._busy=true;
    try{
      const p=pendingUnlock; const good=await totpValid(p.vault.totp, code);
      if(pendingUnlock!==p) return;                                   // zwischendurch gesperrt: weder zählen noch setzen
      if(!good){ failCount++; if(failCount>=3) lockedUntil=Date.now()+Math.min(30,(failCount-2)*2)*1000; saveLockState(); return err('totp-err',tr('err.totpSetupBad')); }
      DEK=p.dek; KDF=p.kdf; WRAP=p.wrap; VAULT=p.vault; pendingUnlock=null; failCount=0; lockedUntil=0; saveLockState();
    }finally{ doTotp._busy=false; $('totp-code').value=''; }
    releaseHolds(); enterApp();
  }
  function cancelTotp(){ clearIdle(); pendingUnlock=null; bioRearmDek=null; bioGen++; bioAuto=false; $('totp-code').value=''; err('totp-err'); boot(); }   // bioAuto=false: sonst Prompt-Schleife Fingerabdruck → Hürde → Abbruch → Fingerabdruck
  // Fehlversuchs-Bremse überlebt einen Neustart (außerhalb der verschlüsselten Datei, enthält nichts Geheimes)
  const LOCK_KEY='ai-notes-lock';
  // Der Zähler wird bei JEDEM Fehlversuch gespeichert und nur durch einen Erfolg gelöscht — kein Ablauf nach Zeit: am entsperrten Handy
  // kontrolliert ein Angreifer die Uhr (Querfund Sachwert-Tresor Audit run-5 #2).
  function saveLockState(){ try{ if(failCount>0) localStorage.setItem(LOCK_KEY, JSON.stringify({f:failCount,u:lockedUntil})); else localStorage.removeItem(LOCK_KEY); }catch(_){} }
  // Übernehmen: Zähler als Maximum aus RAM und Speicher, Wartezeit höchstens 30 s voraus — ein Eintrag weit in der Zukunft wird gekappt statt verworfen.
  function loadLockState(){ try{ const o=JSON.parse(localStorage.getItem(LOCK_KEY)||'null'); const n=Date.now();
    if(o&&Number.isInteger(o.f)&&o.f>0&&o.f<100000){ failCount=Math.max(failCount,o.f);
      if(Number.isFinite(o.u)&&o.u>n) lockedUntil=Math.max(lockedUntil,Math.min(o.u,n+30000)); } }catch(_){} }
  // Sperr-/Setup-/Import-Eingaben leeren und maskieren — beim Verstecken der App und nach jedem Fehlversuch (Gate-Hygiene, Audit run-2 #1)
  function clearGateInputs(){ ['lock-pass','lock-pin','setup-pass1','setup-pass2','import-pass','totp-code','bio-pass','cp-cur','cp1','cp2','pin-new','pin-rep','pin-pass'].forEach(id=>{ const n=$(id); if(n) n.value=''; }); maskInputs('#screen-lock'); maskInputs('#screen-setup'); maskInputs('#tab-settings'); maskInputs('#tab-backup'); err('lock-err'); pinMsg(''); bioMsg(''); }   // auch die Passphrase-Felder in den Einstellungen (Audit run-3); Fehlversuch-Hinweise ebenso (Audit run-8 #8)
  /* ===== KIT: Auge im Passwortfeld ===== */
  function setEye(b,on){ b.setAttribute('aria-pressed',on?'true':'false'); b.dataset.showpass.split(',').forEach(id=>{ const f=$(id); if(f) f.type=on?'text':'password'; }); }
  function togglePass(_,b){ if(b) setEye(b,b.getAttribute('aria-pressed')!=='true'); }
  function maskInputs(scope){ document.querySelectorAll((scope||'')+' [data-showpass]').forEach(b=>setEye(b,false)); }
  function eyeWrap(inp){ const w=el('div','pw-wrap'), b=el('button','pw-eye'); b.type='button'; b.dataset.showpass=inp.id; b.setAttribute('aria-pressed','false'); b.title=tr('pw.toggle');
    if(inp.parentNode) inp.parentNode.insertBefore(w,inp); w.append(inp,b); return w; }
  function enhancePassFields(){ document.querySelectorAll('input[type=password]').forEach(i=>{ if(i.id&&!i.closest('.pw-wrap')) eyeWrap(i); }); }
  // Code mit ±1 Zeitfenster prüfen (Uhrenabweichung)
  async function totpValid(t, code){ const now=Date.now(); for(const d of [-1,0,1]){ if(await totpCode(t, now+d*t.period*1000)===code) return true; } return false; }
  // Beim Verlassen eines Gate-Bildschirms: wurde das Fenster schon während Argon2 versteckt, galt onHidden noch für „gesperrt“ —
  // bei „sofort“ jetzt nachholen statt die Notizen offen zu lassen (Audit run-7, Härtung)
  function leaveGate(){ if(DESK&&clipOwnedAt) clearClip(); if(bgAway&&settings().bgLock===0){ lock(); toast(tr('toast.autolocked')); return true; } return false; }
  function enterApp(){ if(leaveGate()) return; applySecure(settings().secure!==0); screen('app'); tab('list'); renderAll(); resetIdle();
    if(storedLen>MAX_FILE_BYTES) toast(tr('toast.fileOver',{m:MAX_FILE_BYTES/1048576}));   // Datei über der Schreibgrenze (älterer Build oder fremde Datei): ehrlich sagen, was noch gespeichert wird
    if(bioRearmDek){ const d=bioRearmDek; bioRearmDek=null; bioArm(d, KDF, WRAP, true).then(ok=>{ if(ok) toast(tr('bio.rearmed')); if(VAULT) renderSettings(); }); } }   // nach Neustart: Slot mit frischem Zufall neu bewaffnen; if(VAULT): während der Neu-Einrichtung gesperrt → sonst TypeError
  function lock(){
    clearIdle(); clearClip(); clearTimeout(autosaveTimer); autosaveTimer=null; applySecure(true);
    DEK=null; KDF=null; WRAP=null; VAULT=null; editId=null; editing=false; pendingImport=null; search=''; catFilter=null; favFilter=false;
    pendingUnlock=null; pendingSecret=null; pendingOtpauth='';
    bioGen++; bioRearmDek=null; bioArmed=false; bioNeedsRearm=false;   // laufende Fingerabdruck-Vorgänge verfallen (Generation)
    clearRendered(); screen('lock'); boot();   // Sperrbildschirm sofort; boot() liest die Datei asynchron nach (Android-Plugin)
  }
  // Nach dem Sperren darf nichts Entschlüsseltes im DOM oder in Formularfeldern bleiben
  function clearRendered(){
    ['entry-list','backup-hint','cat-chips','cat-menu','trash-list','f-items','md-view','cp-meter','setup-meter','bio-alert-list','bio-alert'].forEach(id=>{ const n=$(id); if(n) n.replaceChildren(); });
    ['bk-msg','import-msg','sn-msg','about-line','trash-msg','trash-n','ed-count','ed-meta','add-title','totp-secret'].forEach(id=>{ const n=$(id); if(n) n.textContent=''; });
    ['f-title','f-cat','f-body','search','import-pass','cp-cur','cp1','cp2','lock-pass','lock-pin','pin-new','pin-rep','pin-pass','setup-pass1','setup-pass2','totp-code','totp-verify','bio-pass','vault-file','sn-file'].forEach(id=>{ const n=$(id); if(n) n.value=''; });
    ['f-fav','f-pinned','f-md','bio-keep','set-secure'].forEach(id=>{ const n=$(id); if(n) n.checked=false; });   // „auch nach Neustart“ nie stehen lassen (ab Werk aus)
    setEntryType('text'); setMdMode('edit'); err('add-err'); err('cp-err'); err('lock-err'); err('setup-err'); err('totp-err'); err('totp-setup-err'); err('bio-err'); bioMsg(''); err('pin-err'); pinMsg('');
    maskInputs(''); closeMenus(); dialogClose(false);   // offene Rückfrage verfällt, der Aufrufer sieht false
    hide('help-overlay'); hide('import-pass-box'); hide('totp-setup');
    doImportVault._busy=false; const ib=$('import-btn'); if(ib){ ib.disabled=false; }
    tab('list');   // sonst stünde nach dem Entsperren die (leere) Papierkorb-Ansicht offen
  }

  /* ---------- Auto-Lock: Idle + Hintergrund (unabhängig voneinander; Defaults lockerer als Alien Pass, BG_NEVER = nie) ---------- */
  let idleTimer=null, lastActivity=0, hiddenAt=0;
  const settings=()=>VAULT?VAULT.settings:(pendingUnlock?pendingUnlock.vault.settings:SETTINGS_DEFAULT);
  function clearIdle(){ if(idleTimer){ clearTimeout(idleTimer); idleTimer=null; } }
  function resetIdle(){ clearIdle(); if(!DEK&&!pendingUnlock) return; const mins=settings().autolock; if(!mins) return; idleTimer=setTimeout(()=>{ clearIdle(); lockSaving('toast.autolocked'); }, mins*60000); }
  // Sperren mit Editor-Sicherung: erst den Autosave-Persist zu Ende laufen lassen (AES-GCM, Millisekunden), DANN sperren — sonst
  // verwirft persist() den Stand als „tote Sitzung“ und die letzte Änderung wäre weg. Ohne offenen Editor sperrt es im nächsten Mikrotask.
  // Sperre wartet den eigenen Commit UND alle laufenden Persists ab (Kette inflight), höchstens 5 s — sonst verwarf lock() einen laufenden Autosave still (Audit run-1 #1).
  function lockSaving(toastKey){ const p=commitEditor(true); const all=Promise.all([p&&p.then?p:Promise.resolve(), inflight]).then(()=>{},()=>{});
    Promise.race([all, new Promise(r=>setTimeout(r,5000))]).then(()=>{ if(!DEK&&!pendingUnlock) return; lock(); if(toastKey) toast(tr(toastKey)); }); }
  function activity(){ if(!DEK&&!pendingUnlock) return; const n=Date.now(); if(n-lastActivity<5000) return; lastActivity=n; resetIdle(); }
  ['click','keydown','touchstart','scroll','mousemove'].forEach(ev=>document.addEventListener(ev, activity, {passive:true}));
  let bgAway=false;
  function onHidden(){
    if(bgAway) return; bgAway=true;
    hiddenAt=Date.now(); clearGateInputs(); if(DESK&&!DEK&&clipOwnedAt) clearClip();
    if((DEK||pendingUnlock)&&settings().bgLock===0){ lockSaving(); }   // „sofort“: Editor-Stand sichern, dann sperren; getippte Passphrasen nie stehen lassen
    else if(DEK&&editing) commitEditor(true);                          // sonst nur den Editor-Stand sichern, bevor Android die App einfriert
  }
  function onShown(){
    if(!bgAway) return; bgAway=false;
    const away=hiddenAt?Date.now()-hiddenAt:0; hiddenAt=0;
    if(clipOwnedAt&&(clipDue||(settings().clipClear>0&&Date.now()-clipOwnedAt>=settings().clipClear*1000))) clearClip();
    if(!DEK&&!pendingUnlock){ if(bioArmed&&bioAuto&&!$('screen-lock').classList.contains('hidden')) doBio(); return; }   // zurück auf dem Sperrbildschirm: Fingerabdruck anbieten
    const s=settings();   // BG_NEVER (-1): nie durch Hintergrund sperren — die Idle-Regel gilt trotzdem, wenn gesetzt
    if((s.bgLock>0&&away>s.bgLock*1000)||(s.autolock>0&&away>s.autolock*60000)){ lockSaving('toast.autolocked'); }
    else resetIdle();
  }
  document.addEventListener('visibilitychange',()=>{ if(document.hidden) onHidden(); else onShown(); });
  if(DESK&&typeof DESK.onBackground==='function') DESK.onBackground(h=>{ if(h==='blur') clearGateInputs(); else if(h) onHidden(); else onShown(); });
  if(DESK&&typeof DESK.onLock==='function') DESK.onLock(()=>{ if(DEK||pendingUnlock) lockSaving(); });   // Hülle meldet Ruhezustand/Bildschirmsperre — im Flatpak wirkungslos (kein logind im Käfig), Handbuch sagt es

  /* ---------- Zwischenablage (synchron im Klick-Handler aufrufen!) — wortgleich Alien Pass ---------- */
  function fallbackCopy(text){ let ta=null; try{ ta=document.createElement('textarea'); ta.value=text; ta.setAttribute('readonly',''); ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); return document.execCommand('copy'); }catch(_){ return false; } finally{ if(ta){ ta.value=''; ta.remove(); } } }
  let clipDue=false, clipTries=0;   // Löschen war fällig, konnte aber (Hintergrund/kein Fokus) noch nicht ausgeführt werden
  const CLIP_MAX_TRIES=600;          // ~10 min Wiederholung im Vordergrund, dann aufgeben (Android leert spätestens nach 1 h selbst)
  function armClip(){ if(clipTimer){ clearTimeout(clipTimer); clipTimer=null; } clipOwnedAt=Date.now(); clipDue=false; clipTries=0; const s=settings().clipClear; if(s>0) clipTimer=setTimeout(clearClip, s*1000); }
  function clearClip(){
    if(clipTimer){ clearTimeout(clipTimer); clipTimer=null; }
    if(!clipOwnedAt) return; clipDue=true;
    const bg=document.hidden||(typeof document.hasFocus==='function'&&!document.hasFocus());
    if(bg&&!SC){ clipTimer=setTimeout(clearClip,1000); return; }     // Web-API braucht Fokus → vertagen; nativ (Android) darf ohne Fokus schreiben
    if(!bg&&++clipTries>CLIP_MAX_TRIES){ clipOwnedAt=0; clipDue=false; return; }   // Versuche nur im Vordergrund zählen (Audit run-1 #2)
    const ok=()=>{ clipOwnedAt=0; clipDue=false; clipTries=0; };
    const retry=()=>{ if(!bg&&fallbackCopy(' ')) ok(); else clipTimer=setTimeout(clearClip,1000); };
    let p=null; try{ p=SC?SC.clear():(navigator.clipboard&&navigator.clipboard.writeText(' ')); }catch(_){ p=null; }
    if(p&&p.then) p.then(ok,retry); else retry();
  }
  function copyText(text, whatKey){
    if(!text) return toast(tr('copy.empty'));
    const what=tr(whatKey), s=settings().clipClear;
    const done=()=>{ if(!DEK){ clipOwnedAt=Date.now(); clearClip(); return; } armClip(); toast(s>0?tr('copy.done',{what,s}):tr('copy.doneNoClear',{what})); };
    const web=()=>{ let p=null; try{ p=navigator.clipboard&&navigator.clipboard.writeText(text); }catch(_){ p=null; }
      if(p&&p.then) p.then(done).catch(()=>{ fallbackCopy(text)?done():toast(tr('copy.manual')); });
      else fallbackCopy(text)?done():toast(tr('copy.manual')); };
    // Nativ (Android): als „sensibel“ markiert → keine System-Vorschau des Inhalts (API 33+); Fallback Web-API
    if(SC){ let p=null; try{ p=SC.write({text}); }catch(_){ p=null; } if(p&&p.then){ p.then(done).catch(DESK?()=>toast(tr('copy.manual')):web); return; } }
    if(DESK) return toast(tr('copy.manual'));
    web();
  }

  /* ---------- tabs ---------- */
  const TAB_ACTIVE={trash:'list'};   // Ansichten ohne eigenen Tab-Knopf: welcher Knopf markiert bleibt
  function tab(name){
    if(name!=='add'&&editing&&!(DESK&&name==='list')) closeEditor();   // Editor verlassen = speichern (Autosave), nie still verwerfen; am Desktop bleibt er neben der Liste offen
    const mark=TAB_ACTIVE[name]||name;
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===mark));
    const view=(DESK&&name==='add')?'list':name;   // Desktop (html.desk): der Editor steckt als rechte Spalte in der Listen-Ansicht
    document.querySelectorAll('.tabview').forEach(v=>{ if(DESK&&v.id==='tab-add') return; v.classList.toggle('hidden',v.id!=='tab-'+view); });
    renderDeskPane(); closeMenus();
    if(name==='trash') renderTrash();
    if(name==='list'||view==='list') renderList();
    if(name==='settings') renderSettings();
    if(name==='backup') renderBackupMsg();
  }

  // Desktop: rechte Spalte nur während des Bearbeitens; darunter (< 1000 px) verdeckt der Editor die Liste (Klasse .editing)
  function renderDeskPane(){ if(!DESK) return; const a=$('tab-add'), l=$('tab-list'); if(a) a.classList.toggle('hidden',!editing); if(l) l.classList.toggle('editing',editing); }
  function markSel(){ document.querySelectorAll('#entry-list .entry').forEach(r=>r.classList.toggle('sel',editing&&r.dataset.arg===editId)); }   // Desktop: bearbeitete Zeile markieren

  /* ===== KIT: Auswahlfeld (.combo) — das native <select> bleibt Wertspeicher ===== */
  function closeMenus(){ document.querySelectorAll('.combo-menu').forEach(m=>{ m.classList.add('hidden'); m.replaceChildren(); }); }
  function comboOpt(label, action, arg, on, selId){ const b=el('button','combo-opt'+(on?' on':''),label); b.type='button'; b.dataset.action=action; b.dataset.arg=arg; if(selId) b.dataset.sel=selId; return b; }
  function syncCombo(id){ const sel=$(id), lab=$('cb-'+id); if(!sel||!lab) return; const o=sel.options[sel.selectedIndex]; lab.textContent=o?o.textContent:''; }
  function syncCombos(){ document.querySelectorAll('.combo-native').forEach(sel=>syncCombo(sel.id)); }
  function toggleCombo(id){ const menu=$('cm-'+id), sel=$(id); if(!menu||!sel) return;
    const wasOpen=!menu.classList.contains('hidden'); closeMenus(); if(wasOpen) return;
    for(const o of sel.options) menu.appendChild(comboOpt(o.textContent,'chooseOpt',o.value,o.value===sel.value,id));
    menu.classList.remove('hidden'); }
  function chooseOpt(value, elx){ const sel=$(elx&&elx.dataset.sel); closeMenus();
    // Guard (Review-Fund Tresor v2.10): nur echte Optionen eines Wertspeichers; gleicher Wert → kein change
    if(!sel||!sel.classList.contains('combo-native')||!Array.from(sel.options).some(o=>o.value===value)||sel.value===value) return;
    sel.value=value; syncCombo(sel.id);
    sel.dispatchEvent(new Event('change',{bubbles:true})); }
  // --- Kategorie: freies Textfeld mit Vorschlägen (Alien Pass v1.5) ---
  const cats=()=>[...new Set(live().map(e=>e.cat).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
  function renderCatMenu(all){ const menu=$('cat-menu'), inp=$('f-cat'); if(!menu||!inp) return false;
    menu.replaceChildren(); const q=all?'':(inp.value||'').trim().toLowerCase();
    const items=cats().filter(c=>!q||c.toLowerCase().includes(q));
    if(!items.length){ menu.classList.add('hidden'); return false; }
    for(const c of items) menu.appendChild(comboOpt(c,'pickCat',c,c===inp.value.trim()));
    menu.classList.remove('hidden'); return true; }
  function openCatMenu(){ closeMenus(); renderCatMenu(); }
  function toggleCatMenu(){ const menu=$('cat-menu'); const wasOpen=menu&&!menu.classList.contains('hidden');
    closeMenus(); if(wasOpen) return;
    renderCatMenu(true); }   // der Pfeil zeigt ALLE Kategorien, ohne das Getippte zu verwerfen
  function catInput(){ if(!$('cat-menu')) return; renderCatMenu(); editorChanged(); }
  function pickCat(v){ const inp=$('f-cat'); if(inp) inp.value=v; closeMenus(); editorChanged(); }

  /* ---------- Liste ---------- */
  function renderChips(all){
    const box=$('cat-chips'); box.replaceChildren(); const cs=cats(); const hasFav=all.some(e=>e.fav);
    if(!hasFav) favFilter=false;
    if(!cs.length&&!hasFav){ catFilter=null; return; }
    const hasNone=all.some(e=>!e.cat);
    if(catFilter!==null&&(catFilter===''?!hasNone:!cs.includes(catFilter))) catFilter=null;   // Filter auf verschwundene Kategorie zurücksetzen
    const mk=(label,val,cls)=>{ const b=el('button','chip'+(cls?' '+cls:''),label); if(val===null) b.dataset.action='clearCatFilter'; else { b.dataset.action='setCatFilter'; b.dataset.arg=val; } box.appendChild(b); return b; };
    mk(tr('chip.all'),null,(catFilter===null&&!favFilter)?'on':'');
    if(hasFav){ const b=el('button','chip fav'+(favFilter?' on':''),tr('chip.fav')); b.dataset.action='toggleFavFilter'; box.appendChild(b); }
    for(const c of cs) mk(c,c,catFilter===c?'on':''); if(hasNone) mk(tr('chip.none'),'',catFilter===''?'on':'');
  }
  function setCatFilter(v){ catFilter=typeof v==='string'?v:null; renderList(); }
  function clearCatFilter(){ catFilter=null; favFilter=false; renderList(); }
  function toggleFavFilter(){ favFilter=!favFilter; renderList(); }
  // Vorschauzeile: erste Textzeile, die nicht der Titel ist (Titel kann aus der ersten Zeile stammen); Checkliste: Fortschritt + erster offener Eintrag
  function preview(e){
    if(e.type==='list'){ const n=e.items.length; if(!n) return tr('list.itemsEmpty'); const open=e.items.find(x=>!x.done); return tr('list.progress',{d:n-e.items.filter(x=>!x.done).length,n})+(open?' · '+open.text:''); }
    const lines=e.body.split('\n').map(l=>line(l,120)).filter(Boolean); if(lines.length&&lines[0]===e.title) lines.shift(); return (lines[0]||'').replace(/^#{1,3}\s+|^(?:[-*+]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s+)?/,''); }   // Markdown-Marker der Vorschau abstreifen
  function renderList(){
    if(!VAULT) return;
    search=($('search').value||'').trim().toLowerCase();
    const list=$('entry-list'); list.replaceChildren();
    const all=live().sort((a,b)=>((b.pinned?1:0)-(a.pinned?1:0))||(ts(b.updated)-ts(a.updated)));
    renderChips(all); renderTrashBtn(); renderBioAlert(); renderBackupHint();
    let items=catFilter===null?all:all.filter(e=>e.cat===catFilter); if(favFilter) items=items.filter(e=>e.fav);
    if(search) items=items.filter(e=>(e.title+'\n'+e.body+'\n'+e.items.map(x=>x.text).join('\n')+'\n'+e.cat).toLowerCase().includes(search));
    if(!items.length){ list.appendChild(el('div','empty',all.length?tr('list.noMatch'):tr('list.empty'))); return; }
    for(const e of items){
      const row=el('div',(editing&&e.id===editId)?'entry sel':'entry'); row.dataset.action='openEditor'; row.dataset.arg=e.id;
      row.appendChild(el('div','av'+(e.type==='list'?' list':''),e.type==='list'?'☑':((e.title||preview(e)).trim()[0]||'·').toUpperCase()));
      const main=el('div','main'); main.appendChild(el('div','t',titleOf(e)));
      main.appendChild(el('div','u',preview(e)));
      // Datum und Pills in EINER Zeile unter der Vorschau — rechts neben dem Titel kürzten sie ihn auf 360 px auf wenige Zeichen
      const meta=el('div','meta'); meta.appendChild(el('span','d',fmtDate(e.updated)));
      if(e.pinned) meta.appendChild(el('span','pill pin',tr('pill.pin')));
      if(e.fav) meta.appendChild(el('span','pill fav','★'));
      if(e.type==='list') meta.appendChild(el('span','pill type',tr('pill.list')));
      if(e.cat&&catFilter===null) meta.appendChild(el('span','pill cat',e.cat));
      main.appendChild(meta); row.appendChild(main); list.appendChild(row);
    }
    // Dezente Summe am Listenende: nur lebende Notizen (Papierkorb zählt nicht), bei Filter/Suche „n von t“
    list.appendChild(el('div','list-count',items.length===all.length?(all.length===1?tr('list.count1'):tr('list.count',{n:all.length})):tr('list.countOf',{n:items.length,t:all.length})));
  }
  function renderBackupHint(){
    const box=$('backup-hint'); box.replaceChildren(); if(!VAULT||!live().length) return;
    const lb=VAULT.meta.lastBackup; let msg='';
    if(!lb) msg=tr('bk.none');
    else { const days=Math.floor((Date.now()-ts(lb))/86400000); const n=VAULT.entries.filter(e=>ts(e.updated)>ts(lb)).length; if(n>0&&days>=7) msg=tr('bk.stale',{d:days,n}); }
    if(msg){ const w=el('div','warn',msg); w.style.marginBottom='12px'; box.appendChild(w); }
  }

  /* ---------- Editor: Notiz / Checkliste, Autosave (Konzept 3: kein Speichern-Knopf) ----------
     Verlassen (Fertig, Tab, Zurück, Hintergrund, Sperre) speichert; beim Tippen zusätzlich nach AUTOSAVE_MS Ruhe.
     Schreiben folgt dem Persist-Muster von Alien Pass: Snapshot, VAULT ändern, persist(), bei Fehler Rollback (nie bei .locked). */
  const AUTOSAVE_MS=1500; let autosaveTimer=null, itemSeq=0, editBase=null;   // editBase: Signatur des Formularstands direkt nach dem Öffnen (Audit run-1 #3/#8)
  function setEntryType(t){ formType=entryType(t); closeMenus(); ENTRY_TYPES.forEach(x=>$('ft-'+x).classList.toggle('on',x===formType)); $('grp-text').classList.toggle('hidden',formType!=='text'); $('grp-list').classList.toggle('hidden',formType!=='list'); $('f-md-wrap').classList.toggle('hidden',formType!=='text'); hide('md-cheat'); renderAddTitle(); }
  function renderAddTitle(){ $('add-title').textContent=tr(editId?(formType==='list'?'add.titleEditList':'add.titleEdit'):(formType==='list'?'add.titleNewList':'add.titleNew')); }
  // Typwechsel per Segment: Inhalt wird umgewandelt (Zeilen ↔ Einträge), nach Rückfrage — nichts geht still verloren
  async function changeEntryType(t){ t=entryType(t); if(t===formType||!editing) return;
    if(t==='list'){ const body=$('f-body').value; if(body.trim()&&!(await ask(tr('confirm.toList',{n:ITEMS_MAX,c:CAPS.item}),{ok:'dlg.convert'}))) return;
      if(!editing||formType!=='text') return;                    // während der Rückfrage gesperrt oder verlassen
      setItemRows(linesToItems($('f-body').value)); if(!itemRows().length) pushItemRow('',false); $('f-body').value=''; $('f-md').checked=false; $('md-seg').classList.add('hidden'); setMdMode('edit'); }
    else { const items=readItemRows(); const body=itemsToBody(items); if(body.length>CAPS.body) return toast(tr('toast.bodyFull',{n:CAPS.body}));   // sonst kappte sanitizeEntry still (Audit run-1 #6)
      if(items.length&&!(await ask(tr('confirm.toText'),{ok:'dlg.convert'}))) return;
      if(!editing||formType!=='list') return;
      $('f-body').value=itemsToBody(readItemRows()); clearItemRows(); }
    setEntryType(t); editorChanged(); renderCounter(); }
  function setMdMode(m){ mdMode=m==='view'?'view':'edit'; const on=mdMode==='view'; $('mm-edit').classList.toggle('on',!on); $('mm-view').classList.toggle('on',on);
    $('f-body').classList.toggle('hidden',on); $('md-view').classList.toggle('hidden',!on); if(on) renderMd($('f-body').value); else $('md-view').replaceChildren(); }
  function mdModeEdit(){ setMdMode('edit'); setTimeout(()=>$('f-body').focus(),50); }
  function mdModeView(){ commitEditor(true); setMdMode('view'); }
  function mdToggle(){ const on=$('f-md').checked; $('md-seg').classList.toggle('hidden',!on); setMdMode(on?'view':'edit'); editorChanged(); }
  // Spickzettel: Kärtchen ein-/ausblenden (statischer Text im HTML); „Beispiel einfügen“ nur in eine LEERE Notiz, öffnet dann die Ansicht
  function mdCheat(){ $('md-cheat').classList.toggle('hidden'); }
  function mdExample(){ if(!editing||formType!=='text') return; if($('f-body').value.trim()) return toast(tr('toast.exampleBusy'));
    if(!$('f-title').value.trim()) $('f-title').value=tr('cheat.exampleTitle'); $('f-body').value=tr('cheat.exampleText'); $('f-md').checked=true; $('md-seg').classList.remove('hidden'); setMdMode('view'); hide('md-cheat'); editorChanged(); renderCounter(); }
  // Datum + Uhrzeit (lokal) an den Cursor; in der Ansicht erst zurück ins Textfeld. input-Ereignis → Delegation → editorChanged (Autosave)
  function insertDate(){ if(!editing||formType!=='text') return; if(mdMode==='view') setMdMode('edit'); const ta=$('f-body');
    const s=new Date().toLocaleString(LANG==='de'?'de-DE':'en-GB',{dateStyle:'medium',timeStyle:'short'});
    if(ta.value.length+s.length>CAPS.body) return toast(tr('toast.bodyFull',{n:CAPS.body}));
    ta.setRangeText(s,ta.selectionStart,ta.selectionEnd,'end'); ta.focus(); ta.dispatchEvent(new Event('input',{bubbles:true})); }
  // Markdown-Ansicht: reine Zerlegung (mdParse, Sentinel) → DOM ausschließlich per createElement/textContent; URLs bleiben Text
  function renderMd(text){ const box=$('md-view'); box.replaceChildren();
    const inl=(parent,parts)=>{ for(const p of parts){ if(p.t==='text') parent.appendChild(document.createTextNode(p.s)); else parent.appendChild(el(p.t==='b'?'strong':p.t==='i'?'em':'code',null,p.s)); } };
    for(const b of mdParse(text)){
      if(b.type==='h'){ const h=el('h'+(b.level+1)); inl(h,b.inline); box.appendChild(h); }
      else if(b.type==='p'){ const p=el('p'); inl(p,b.inline); box.appendChild(p); }
      else if(b.type==='hr') box.appendChild(el('hr'));
      else if(b.type==='code'){ const pre=el('pre'); pre.appendChild(el('code',null,b.text)); box.appendChild(pre); }
      else if(b.type==='list'){ const l=el(b.ordered?'ol':'ul'); for(const it of b.items){ const li=el('li',it.check===null?'':(it.check?'chk on':'chk')); if(it.check!==null) li.appendChild(el('span','box',it.check?'☑':'☐')); inl(li,it.inline); l.appendChild(li); } box.appendChild(l); }
    }
    if(!box.childNodes.length) box.appendChild(el('p','muted','')); }
  function renderCounter(){ if(formType==='list'){ const it=readItemRows(); $('ed-count').textContent=it.length?tr('ed.items',{d:it.filter(x=>x.done).length,n:it.length}):''; return; }
    const s=$('f-body').value; $('ed-count').textContent=s?tr('ed.count',{c:s.length,w:s.trim()?s.trim().split(/\s+/).length:0}):''; }
  // Checklisten-Zeilen im Formular: Kästchen (Kit) + Textfeld + Entfernen; Enter im Feld legt darunter eine neue Zeile an
  function itemRows(){ return Array.from($('f-items').querySelectorAll('.crow')); }
  function pushItemRow(text, done, after){ if(itemRows().length>=ITEMS_MAX) return null; const k=++itemSeq, row=el('div','crow'); row.id='f-i-'+k; row.dataset.t='f-it-'+k; row.dataset.c='f-ic-'+k;
    const lab=el('label','chk'); const cb=el('input'); cb.type='checkbox'; cb.id=row.dataset.c; cb.checked=!!done; cb.dataset.change='itemChanged'; lab.appendChild(cb);
    const ti=el('input'); ti.type='text'; ti.id=row.dataset.t; ti.maxLength=CAPS.item; ti.placeholder=tr('ed.itemPh'); ti.autocomplete='off'; ti.setAttribute('autocapitalize','sentences'); ti.spellcheck=false; ti.value=text||''; ti.dataset.input='editorChanged'; ti.dataset.enter='itemEnter';
    const del=el('button','btn sm ghost idel','✕'); del.type='button'; del.dataset.action='removeItemRow'; del.dataset.arg=String(k); del.title=tr('ed.itemDel'); del.setAttribute('aria-label',tr('ed.itemDel'));
    row.append(lab,ti,del); if(after&&after.parentNode===$('f-items')) after.after(row); else $('f-items').appendChild(row); row.classList.toggle('done',!!done); syncItemAdd(); return row; }
  function syncItemAdd(){ $('f-iadd').disabled=itemRows().length>=ITEMS_MAX; }
  function addItemRow(){ const row=pushItemRow('',false); if(!row) return toast(tr('err.itemsMax',{n:ITEMS_MAX})); $(row.dataset.t).focus(); }
  function itemEnter(_,elx){ const cur=elx&&elx.closest('.crow'); if(!cur) return; if(!$(cur.dataset.t).value.trim()) return; const row=pushItemRow('',false,cur); if(!row) return toast(tr('err.itemsMax',{n:ITEMS_MAX})); $(row.dataset.t).focus(); }
  function removeItemRow(k){ const r=$('f-i-'+k); if(!r) return; r.remove(); syncItemAdd(); editorChanged(); renderCounter(); }
  function itemChanged(_,elx){ const r=elx&&elx.closest('.crow'); if(r) r.classList.toggle('done',elx.checked); editorChanged(); renderCounter(); }
  function clearItemRows(){ $('f-items').replaceChildren(); syncItemAdd(); }
  function setItemRows(items){ clearItemRows(); for(const x of items) pushItemRow(x.text,x.done); }
  function readItemRows(){ return itemRows().map(r=>({text:$(r.dataset.t).value, done:$(r.dataset.c).checked})); }
  function sortDone(){ const it=readItemRows(); setItemRows(it.filter(x=>!x.done).concat(it.filter(x=>x.done))); editorChanged(); }
  async function resetDone(){ const rows=itemRows().filter(r=>$(r.dataset.c).checked); if(!rows.length) return; if(!(await ask(tr('confirm.resetDone',{n:rows.length}),{ok:'dlg.remove'}))) return;
    if(!editing||formType!=='list') return;                      // während der Rückfrage gesperrt
    itemRows().forEach(r=>{ $(r.dataset.c).checked=false; r.classList.remove('done'); }); editorChanged(); renderCounter(); }
  function relabelItemRows(){ itemRows().forEach(r=>{ $(r.dataset.t).placeholder=tr('ed.itemPh'); const b=r.querySelector('.idel'); b.title=tr('ed.itemDel'); b.setAttribute('aria-label',tr('ed.itemDel')); }); }
  function resetForm(){ ['f-title','f-cat','f-body'].forEach(id=>$(id).value=''); ['f-fav','f-pinned','f-md'].forEach(id=>$(id).checked=false); clearItemRows(); $('md-seg').classList.add('hidden'); hide('md-cheat'); setMdMode('edit'); closeMenus(); err('add-err'); setEntryType('text'); $('ed-count').textContent=''; $('ed-meta').textContent=''; $('ed-del').classList.add('hidden'); }
  function newEntry(t){ if(editing) closeEditor(); editId=null; editBase=null; editing=true; resetForm(); if(t==='list') setEntryType('list'); if(catFilter) $('f-cat').value=catFilter; tab('add'); setTimeout(()=>$(formType==='list'?'f-title':'f-body').focus(),80); if(formType==='list') addItemRow(); }
  function openEditor(id){ const e=byId(id); if(!e) return toast(tr('toast.noEntry')); if(editing) closeEditor(); editId=e.id; editing=true; resetForm(); setEntryType(e.type);
    $('f-title').value=e.title; $('f-cat').value=e.cat; $('f-fav').checked=e.fav; $('f-pinned').checked=e.pinned;
    if(e.type==='text'){ $('f-body').value=e.body; $('f-md').checked=e.md; $('md-seg').classList.toggle('hidden',!e.md); setMdMode(e.md?'view':'edit'); }
    else setItemRows(e.items);
    $('ed-meta').textContent=tr('ed.meta',{c:fmtDate(e.created),u:fmtDate(e.updated)}); $('ed-del').classList.remove('hidden'); renderCounter(); tab('add'); markSel();
    // Fixpunkt merken: was das Formular unverändert liefert (textarea normalisiert CRLF, Titel aus erster Zeile) — nur echte Änderungen werden geschrieben
    const base=sanitizeEntry(Object.assign({},e,readDraft())); editBase=base?sig(base):null; }
  // Entwurf aus dem Formular; leerer Titel → erste Zeile des Textes (Konzept: Easy-Notes-Bedienung)
  function readDraft(){ const t=formType, body=t==='text'?$('f-body').value:'', items=t==='list'?readItemRows():[];
    let title=line($('f-title').value,CAPS.title); if(!title&&t==='text'){ const first=body.split('\n').map(l=>line(l,CAPS.title)).find(Boolean); title=first||''; }
    return {type:t, title, body, items, cat:$('f-cat').value, fav:$('f-fav').checked, pinned:$('f-pinned').checked, md:t==='text'&&$('f-md').checked}; }
  const sig=e=>canon({type:e.type,title:e.title,body:e.body,items:e.items,cat:e.cat,fav:e.fav,pinned:e.pinned,md:e.md});
  const isBlank=e=>!e.title&&!e.body.trim()&&!e.items.length;
  function editorChanged(){ if(!editing) return; clearTimeout(autosaveTimer); autosaveTimer=setTimeout(()=>commitEditor(true),AUTOSAVE_MS); renderCounter(); }
  // Schreiben: dirty-Prüfung gegen den gespeicherten Stand, dann Snapshot → VAULT → persist; Rollback bei Fehler (Editor bleibt offen, Toast)
  function commitEditor(stay){
    clearTimeout(autosaveTimer); autosaveTimer=null;
    if(!editing||!VAULT) return Promise.resolve(false);
    const draft=readDraft(); const now=nowIso();
    const idx=editId?VAULT.entries.findIndex(e=>e.id===editId&&!e.deleted):-1, before=idx>=0?VAULT.entries[idx]:null;
    const entry=sanitizeEntry(Object.assign({id:editId||cryptoId(), created:before?before.created:now, updated:now, deleted:null},draft));
    if(!entry) return Promise.resolve(false);
    if(!before&&isBlank(entry)) return Promise.resolve(false);            // leere neue Notiz: nichts anlegen
    if(before&&sig(entry)===sig(before)) return Promise.resolve(false);    // unverändert: updated nicht anheben (sonst gewänne der Stand überall)
    if(editBase&&sig(entry)===editBase) return Promise.resolve(false);     // unverändert gegenüber dem Öffnen (fremder Stand mit CRLF/leerem Titel, Import währenddessen) — nicht zurückschreiben
    if(editId&&idx<0){ toast(tr('toast.noEntry')); return Promise.resolve(false); }   // inzwischen gelöscht (nur per Import möglich): nie mit derselben ID neu anlegen
    if(idx<0&&liveCount(VAULT.entries)>=MAX_ENTRIES){ err('add-err',tr('err.tooMany')); return Promise.resolve(false); }
    const snapshot=VAULT.entries.slice(), wasNew=!before;
    VAULT.entries = idx>=0 ? VAULT.entries.map((x,i)=>i===idx?entry:x) : VAULT.entries.concat([entry]);   // neues Array: persist erkennt den zweiten Schreiber (Audit run-1 #2)
    if(wasNew){ editId=entry.id; renderAddTitle(); $('ed-del').classList.remove('hidden'); }
    return persist().then(()=>{ if(editing&&editId===entry.id) editBase=sig(entry); if(stay&&editing&&editId===entry.id){ $('ed-meta').textContent=tr('ed.meta',{c:fmtDate(entry.created),u:fmtDate(entry.updated)}); if(DESK){ renderList(); } } return true; })
      .catch(e=>{ rollback(snapshot)(e); if(!(e&&e.locked)&&wasNew&&editing&&editId===entry.id){ editId=null; renderAddTitle(); $('ed-del').classList.add('hidden'); } return false; });   // editId===entry.id: nur die eigene Notiz zurücksetzen (Audit run-1 #4)
  }
  // Editor verlassen: speichern, dann Formular leeren. Eine leere neue Notiz wird verworfen (mit Hinweis).
  function closeEditor(){ if(!editing) return; const blankNew=!editId&&isBlank(readDraft()); commitEditor(false); editing=false; editId=null; editBase=null; resetForm(); renderDeskPane(); markSel(); if(blankNew) toast(tr('toast.discarded')); }
  function doneEditor(){ closeEditor(); tab('list'); }
  function copyCurrent(){ if(!editing) return; copyText(noteText(readDraft()),'what.note'); }
  async function deleteCurrent(){ if(!editing||!editId) return; const e=byId(editId); if(!e) return;
    // Bei vollem Papierkorb vernichtet diese Löschung die älteste — das muss dastehen, bevor der Nutzer zustimmt (Audit run-5 #1).
    const t=trash(), full=t.length>=MAX_TRASH, oldest=full?t[t.length-1]:null;
    if(!(await ask(full?tr('confirm.deleteFull',{t:titleOf(e),m:MAX_TRASH,o:titleOf(oldest),od:fmtDate(oldest.deleted)})
                      :tr('confirm.delete',{t:titleOf(e),d:TRASH_DAYS}),{ok:'dlg.toTrash',danger:true}))) return;
    if(!VAULT||!editing||editId!==e.id||!byId(e.id)) return;      // während der Rückfrage gesperrt, verlassen oder (Import) verschwunden
    clearTimeout(autosaveTimer); autosaveTimer=null;
    const snapshot=VAULT.entries.slice(), iso=nowIso();
    VAULT.entries=VAULT.entries.map(x=>x===e?Object.assign({},e,{updated:iso, deleted:iso}):x);   // neues Array (Audit run-1 #2)     // in den Papierkorb — der Inhalt bleibt TRASH_DAYS erhalten
    editing=false; editId=null; resetForm();
    persist().then(()=>{ tab('list'); toast(tr('toast.trashed',{d:TRASH_DAYS})); }).catch(e2=>{ rollback(snapshot)(e2); if(VAULT) openEditor(e.id); }); }

  /* ---------- Papierkorb (Alien Pass v1.5) ---------- */
  // Zähler am Symbol in der Suchzeile; leer bleibt das Symbol sichtbar (nur gedimmt), damit man es findet, bevor man es braucht.
  function renderTrashBtn(){ const b=$('trash-btn'), n=$('trash-n'); if(!b||!n) return; const c=trash().length;
    n.textContent=c?String(c):''; b.classList.toggle('ghost',c===0); b.title=b.ariaLabel=tr('trash.btn'); }
  function openTrash(){ tab('trash'); }
  // BEWUSST nur Titel, Typ und Löschdatum: kein Inhalt, nicht anklickbar. Wer den Inhalt braucht, stellt erst wieder her —
  // sonst wäre eine per fremder .notes eingeschleuste Notiz mit vertrautem Titel ein bequemer Phishing-Weg.
  function renderTrash(){
    if(!VAULT) return;
    const list=$('trash-list'); list.replaceChildren();
    const items=trash();
    $('trash-msg').textContent=items.length?(items.length>=MAX_TRASH?tr('trash.countFull',{n:items.length}):tr('trash.count',{n:items.length,d:TRASH_DAYS,m:MAX_TRASH})):'';
    $('trash-empty-btn').classList.toggle('hidden',!items.length);
    renderTrashBtn();
    if(!items.length){ list.appendChild(el('div','empty',tr('trash.empty'))); return; }
    for(const e of items){
      const row=el('div','entry static');
      row.appendChild(el('div','av'+(e.type==='list'?' list':''),e.type==='list'?'☑':((e.title.trim()[0])||'·').toUpperCase()));
      const main=el('div','main'); main.appendChild(el('div','t',titleOf(e)));
      main.appendChild(el('div','u',tr('trash.deletedOn',{d:fmtDate(e.deleted)}))); row.appendChild(main);
      const badges=el('div','badges'); if(e.type==='list') badges.appendChild(el('span','pill type',tr('pill.list'))); row.appendChild(badges);
      list.appendChild(row);
      const acts=el('div','row'); acts.style.margin='0 0 12px';
      const r=el('button','btn sm',tr('trash.restore')); r.dataset.action='restoreEntry'; r.dataset.arg=e.id;
      const d=el('button','btn sm danger',tr('trash.purge')); d.dataset.action='purgeEntry'; d.dataset.arg=e.id;
      acts.appendChild(r); acts.appendChild(d); list.appendChild(acts);
    }
  }
  function restoreEntry(id){ const e=trashById(id); if(!e) return toast(tr('toast.noEntry'));
    if(liveCount(VAULT.entries)>=MAX_ENTRIES) return toast(tr('err.tooMany'));
    const snapshot=VAULT.entries.slice();
    VAULT.entries=VAULT.entries.map(x=>x===e?Object.assign({},e,{updated:nowIso(), deleted:null}):x);   // neues Array (Audit run-1 #2)   // neueres updated ⇒ schlägt die Löschmarke auf anderen Geräten
    persist().then(()=>{ renderTrash(); renderList(); toast(tr('toast.restored')); }).catch(rollback(snapshot)); }
  async function purgeEntry(id){ const e=trashById(id); if(!e) return; if(!(await ask(tr('confirm.purge',{t:titleOf(e)}),{ok:'dlg.deleteForever',danger:true}))) return;
    if(!VAULT||trashById(id)!==e) return;                        // während der Rückfrage gesperrt oder Stand verändert
    const snapshot=VAULT.entries.slice();
    VAULT.entries=VAULT.entries.map(x=>x===e?tombstone(e, nowIso()):x);   // neues Array (Audit run-1 #2)                                 // updated=jetzt ⇒ der leere Stand gewinnt überall
    persist().then(()=>{ renderTrash(); renderList(); toast(tr('toast.purged')); }).catch(rollback(snapshot)); }
  async function emptyTrash(){ if(!VAULT) return; const n=trash().length; if(!n) return;
    if(!(await ask(tr('confirm.emptyTrash',{n}),{ok:'dlg.deleteForever',danger:true}))) return;
    if(!VAULT) return; const t=trash(); if(!t.length) return;   // während der Rückfrage gesperrt; Stand frisch lesen
    const snapshot=VAULT.entries.slice(), iso=nowIso(), ids=new Set(t.map(e=>e.id));
    VAULT.entries=VAULT.entries.map(e=>ids.has(e.id)?tombstone(e,iso):e);
    persist().then(()=>{ renderTrash(); renderList(); toast(tr('toast.trashEmptied')); }).catch(rollback(snapshot)); }

  /* ---------- Passphrase-Vorschlag + Stärke (Setup, Passphrase-Wechsel) ---------- */
  const whyText=why=>why.map(k=>tr('why.'+k)).join(', ');
  function suggestPass(){ const r=genWords(6,'-',false,false); if(!r.pw) return toast(tr('toast.wordsMissing')); $('setup-pass1').value=r.pw; $('setup-pass2').value=r.pw;
    document.querySelectorAll('#screen-setup [data-showpass]').forEach(b=>setEye(b,true)); meterSetup(); toast(tr('toast.suggest')); }
  function renderMeter(inId,outId){ const p=$(inId).value, o=$(outId); if(!p){ o.textContent=''; return; } const c=passCheck(p), st=c.level; const col=['var(--red)','var(--orange)','var(--text-mid)','var(--neon)'][st]; o.replaceChildren();
    const txt=p.length<12?tr('pass.s0'):c.weak?tr('pass.weak',{why:whyText(c.why)}):tr('pass.est',{s:tr('pass.s'+st)})+(c.why.length?' · '+tr('pass.has',{why:whyText(c.why)}):'');
    const s=el('span',null,'▮'.repeat(st+1)+'▯'.repeat(3-st)+' '+txt); s.style.color=col; o.appendChild(s); }
  function meterSetup(){ renderMeter('setup-pass1','setup-meter'); }
  function meterCp(){ renderMeter('cp1','cp-meter'); }

  /* ---------- Backup export / import (.notes) — wortgleich Alien Pass ---------- */
  const CAP = window.Capacitor || null;
  const isNative = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
  const SC = (isNative && CAP.Plugins && CAP.Plugins.SecureClip) ? CAP.Plugins.SecureClip   // eigenes Mini-Plugin (patch-hardening.mjs)
           : (DESK && DESK.clip) || null;
  // X11-Auswahl: mit der Maus Markiertes landet ohne Strg+C in der Auswahl (Mittelklick fügt ein). Am Desktop der Hülle melden
  // und mit der Kopier-Frist mitlöschen; läuft schon eine Frist, gilt diese (Alien Pass Gerätetest 22.09.2026).
  if(DESK&&DESK.clip&&typeof DESK.clip.selected==='function'){
    // AUCH maskierte Felder (type=password) melden: Chromium legt ihre Markierung im KLARTEXT in die X11-Auswahl (Messung 23.09.2026, Electron 44, X11)
    const selText=()=>{ const a=document.activeElement;
      if(a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA')&&typeof a.selectionStart==='number') return a.value.substring(a.selectionStart,a.selectionEnd);
      const g=window.getSelection(); return g?String(g):''; };
    // Auch auf Sperr-/Einrichtungsbildschirm (DEK null): eine markierte Passphrase läge sonst unbegrenzt in der Auswahl — beim Verlassen des Bildschirms wird gelöscht (leaveGate)
    const onSel=()=>{ const t=selText(); if(!t) return;
      let p=null; try{ p=DESK.clip.selected(t); }catch(_){ p=null; }
      if(p&&p.then) p.then(()=>{ if(!clipOwnedAt) armClip(); },()=>{}); };
    document.addEventListener('mouseup',onSel);
    // Strg+C auf Markiertem: nicht Chromium kopieren lassen (ohne KDE-Hinweis, ohne Löschen → Klipper-Verlauf), sondern über die Brücke
    document.addEventListener('copy',ev=>{ const t=selText(); if(!t) return; ev.preventDefault(); copyText(t,'what.sel'); });
    // Strg+X / Shift+Entf ebenso (Audit run-7 #1); danach die Markierung im Feld entfernen: execCommand('delete') hält Rückgängig intakt
    document.addEventListener('cut',ev=>{ const a=document.activeElement, t=selText(); if(!t) return; ev.preventDefault(); copyText(t,'what.sel');
      if(!a||(a.tagName!=='INPUT'&&a.tagName!=='TEXTAREA')||a.readOnly||a.disabled) return;
      let done=false; try{ done=document.execCommand('delete'); }catch(_){}
      if(!done){ a.setRangeText('',a.selectionStart,a.selectionEnd,'end'); a.dispatchEvent(new Event('input',{bubbles:true})); } });
    document.addEventListener('keyup',ev=>{ if(ev.shiftKey||ev.key==='Shift'||((ev.ctrlKey||ev.metaKey)&&(ev.key||'').toLowerCase()==='a')) onSel(); });
  }
  const BIO = (isNative && CAP.Plugins && CAP.Plugins.Biometric) ? CAP.Plugins.Biometric : null;   // Fingerabdruck-Plugin (patch-hardening.mjs), Web: kein Slot
  const SEC = (isNative && CAP.Plugins && CAP.Plugins.SecureScreen) ? CAP.Plugins.SecureScreen : null;   // FLAG_SECURE zur Laufzeit (patch-hardening.mjs)
  async function nativeSaveAndShare(name, content, dir, shareText){
    const FS=CAP.Plugins&&CAP.Plugins.Filesystem; if(!FS) throw new Error('Filesystem-Plugin fehlt');
    const w=await FS.writeFile({path:name, data:content, directory:dir||'DOCUMENTS', encoding:'utf8', recursive:true});
    try{ const SH=CAP.Plugins&&CAP.Plugins.Share; if(SH) await SH.share({title:name, text:shareText||'Alien Notes Backup', url:w.uri}); }catch(_){}
    return w.uri;
  }
  function downloadFile(name, content, type){ const blob=new Blob([content],{type:type||'application/octet-stream'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
  function renderBackupMsg(){ const m=$('bk-msg'); const lb=VAULT&&VAULT.meta.lastBackup; m.textContent=lb?tr('bk.last',{d:fmtDate(lb)}):''; }
  async function exportVault(){
    if(!VAULT||exportVault._busy) return; exportVault._busy=true;
    try{
      // Erst persistieren, dann lesen: sonst exportiert die Datei den Stand VOR dem Aufräumen beim Entsperren (Audit run-5 #3).
      try{ await persist(); }catch(e){ if(e&&e.locked) return; if(DESK){ $('bk-msg').textContent=tr('bk.failed',{e:String(e&&e.message||e)}); return; } }
      let raw; try{ raw=await vaultGet(); }catch(_){ $('bk-msg').textContent=tr('err.storeRead'); return; }
      const name='alien-notes-'+new Date().toISOString().slice(0,10)+'.notes';
      // Erst die Datei schreiben — der Backup-Stempel darf nur nach Erfolg gesetzt werden
      try{ if(isNative){
             try{ await nativeSaveAndShare(name, raw, 'DOCUMENTS', 'Alien Notes Backup'); $('bk-msg').textContent=tr('bk.doneNative',{n:name}); }
             catch(e1){ await nativeSaveAndShare(name, raw, 'CACHE', 'Alien Notes Backup'); $('bk-msg').textContent=tr('bk.doneShare',{n:name}); }
           } else if(DESK){ const n=await DESK.saveBackup(name, raw); if(!n){ $('bk-msg').textContent=''; return; } $('bk-msg').textContent=tr('bk.done',{n}); }
           else { downloadFile(name, raw, 'application/octet-stream'); $('bk-msg').textContent=tr('bk.done',{n:name}); }
           if(raw.length>MAX_FILE_BYTES) $('bk-msg').textContent+=tr('bk.tooBig',{m:MAX_FILE_BYTES/1048576}); }   // ehrlich: ein Backup über 20 MB nimmt kein Import an (Audit run-1b)
      catch(e){ $('bk-msg').textContent=tr('bk.failed',{e:String(e&&e.message||e)}); return; }
      if(!VAULT) return;
      const before={lastBackup:VAULT.meta.lastBackup,lastBackupCount:VAULT.meta.lastBackupCount};
      VAULT.meta.lastBackup=nowIso(); VAULT.meta.lastBackupCount=VAULT.entries.length;
      try{ await persist(); }catch(e){ if(!(e&&e.locked)&&VAULT) Object.assign(VAULT.meta,before); }
      renderBackupHint();
    }finally{ exportVault._busy=false; }
  }
  function pickFile(id){ const n=$(id); if(n) n.click(); }
  function importVault(ev){
    const f=ev&&ev.target&&ev.target.files&&ev.target.files[0]; if(!f) return; const input=ev.target; $('import-msg').textContent='';
    const r=new FileReader(); r.onerror=()=>{ $('import-msg').textContent=tr('bk.readErr'); input.value=''; };
    r.onload=()=>{ input.value=''; try{ pendingImport=parseFile(String(r.result)); }catch(e){ pendingImport=null; $('import-msg').textContent=fileErrMsg(e); return; }
      show('import-pass-box'); setTimeout(()=>$('import-pass').focus(),80); };
    if(f.size>MAX_FILE_BYTES){ $('import-msg').textContent=tr('err.fileLarge'); input.value=''; return; }
    r.readAsText(f);
  }
  function cancelImport(){ pendingImport=null; $('import-pass').value=''; hide('import-pass-box'); }
  async function doImportVault(){
    if(doImportVault._busy||!pendingImport||!VAULT) return; const f=pendingImport;
    if(f.kdf.m>KDF_CONFIRM_M){ if(!(await ask(tr('confirm.bigKdf',{m:Math.round(f.kdf.m/1024)}),{ok:'dlg.tryAnyway'}))) return;
      if(doImportVault._busy||pendingImport!==f||!VAULT) return; }   // während der Rückfrage gesperrt oder andere Datei gewählt
    const btn=$('import-btn'), orig=btn.textContent; doImportVault._busy=true; btn.disabled=true; btn.textContent=tr('busy.decrypting');
    try{
      let incoming;
      try{ const kek=await deriveKek(passBytes($('import-pass').value), f.kdf); const dek=await unwrapDek(f.wrap,kek,f.kdf,false); const obj=await decryptBody(f.body,dek,f.kdf); incoming=sanitizeVault(obj).entries; }
      catch(e){ $('import-pass').value=''; if(VAULT) $('import-msg').textContent=e&&e.message==='toomany'?tr('err.tooMany'):tr('bk.mergeFail'); return; }
      if(!VAULT||!DEK) return;                                   // während des Argon2-Laufs gesperrt → sauber abbrechen
      if(editing) doneEditor();                                  // offener Editor (Nutzer war während Argon2 unterwegs) würde nach dem Merge den alten Stand zurückschreiben (Audit run-1 #3)
      incoming=shapeIncoming(VAULT.entries, incoming);          // Papierkorb-Inhalt bleibt gerätelokal, fremde Marken verdrängen keine eigenen (Audit run-5)
      const before=VAULT.entries.slice(); const m=mergeEntries(VAULT.entries, incoming);
      if(liveCount(m.entries)>MAX_ENTRIES){ $('import-msg').textContent=tr('err.tooMany'); return; }
      VAULT.entries=m.entries;
      try{ await persist(); if(!VAULT) return; $('import-msg').textContent=tr('bk.merged',{a:m.added,u:m.updated,d:m.deleted,t:m.tombstonesIn})+(m.wiped?' '+tr('bk.wiped',{n:m.wiped}):''); cancelImport(); renderList(); }
      catch(e){ if(!(e&&e.locked)&&VAULT){ VAULT.entries=before; $('import-msg').textContent=e&&e.fileFull?tr('err.fileFull',{m:MAX_FILE_BYTES/1048576}):tr('err.saveFailed'); } }
    }finally{ doImportVault._busy=false; btn.disabled=false; btn.textContent=orig; }
  }


  /* ---------- Standard-Notes-Import (v1.1): entschlüsseltes Backup → snImport() (rein) → Rückfrage mit Zusammenfassung → Merge wie beim Backup ---------- */
  function snErrMsg(e){ const c=e&&e.message; return tr(c==='snencrypted'?'sn.errEncrypted':c==='snformat'?'sn.errFormat':c==='zipnosn'?'sn.errZipNoSn':c==='zipunsupported'?'sn.errZipUnsupported'
    :c==='toolarge'?'err.fileLarge':c==='zipenc'||c==='zip64'||c==='zipmulti'||c==='zipmethod'||c==='zipbad'?'sn.errZipBad':'sn.errJson'); }
  // ZIP-Eintrag entpacken: DecompressionStream('deflate-raw') des Browsers (WebView ab Chromium 103), Deckel MAX_FILE_BYTES beim Lesen — nie mehr in den RAM als erlaubt
  async function zipInflate(part){ if(!part.deflated) return part.data; if(typeof DecompressionStream!=='function') throw new Error('zipunsupported');
    let ds; try{ ds=new DecompressionStream('deflate-raw'); }catch(_){ throw new Error('zipunsupported'); }
    const rd=new Blob([part.data]).stream().pipeThrough(ds).getReader(); const chunks=[]; let n=0;
    for(;;){ const {done,value}=await rd.read(); if(done) break; n+=value.byteLength; if(n>MAX_FILE_BYTES){ try{ await rd.cancel(); }catch(_){} throw new Error('toolarge'); } chunks.push(value); }
    const out=new Uint8Array(n); let o=0; for(const c of chunks){ out.set(c,o); o+=c.byteLength; } return out; }
  function importSn(ev){
    const f=ev&&ev.target&&ev.target.files&&ev.target.files[0]; if(!f) return; const input=ev.target; $('sn-msg').textContent='';
    if(f.size>2*MAX_FILE_BYTES){ $('sn-msg').textContent=tr('err.fileLarge'); input.value=''; return; }   // ZIP darf doppelt so groß sein (Items/ ist eine Zweitkopie), der entpackte Eintrag bleibt bei 20 MB
    const r=new FileReader(); r.onerror=()=>{ $('sn-msg').textContent=tr('bk.readErr'); input.value=''; };
    r.onload=async()=>{ input.value=''; if(!VAULT||importSn._busy) return; let res;
      try{ let u8=new Uint8Array(r.result);
        if(u8.length>=4&&u8[0]===0x50&&u8[1]===0x4b&&u8[2]===3&&u8[3]===4){ const part=zipSlice(u8, zipFindSn(u8), MAX_FILE_BYTES); u8=await zipInflate(part); if(!VAULT||importSn._busy) return; }
        else if(u8.length>MAX_FILE_BYTES) throw new Error('toolarge');
        res=snImport(new TextDecoder('utf-8').decode(u8),{trashBudget:Math.max(0,MAX_TRASH-trash().length)}); }
      catch(e){ if(VAULT) $('sn-msg').textContent=snErrMsg(e); return; }
      snConfirm(res); };
    r.readAsArrayBuffer(f);
  }
  async function snConfirm(res){
    if(!VAULT||importSn._busy) return; const s=res.stats, sk=s.skipped;
    const ids=new Set(VAULT.entries.map(e=>e.id)), live=new Set(VAULT.entries.filter(e=>!e.deleted).map(dupKey));
    const fresh=res.entries.filter(e=>ids.has(e.id)||e.deleted||!live.has(dupKey(e)));   // gleicher Inhalt unter anderer ID = Dublette; gleiche ID = Re-Import, der Merge entscheidet
    const dupes=res.entries.length-fresh.length, known=fresh.filter(e=>ids.has(e.id)).length;
    const newLive=fresh.filter(e=>!e.deleted&&!ids.has(e.id)).length, newTrash=fresh.filter(e=>e.deleted&&!ids.has(e.id)).length;
    const parts=[fresh.length?tr('sn.take',{n:newLive,t:newTrash})+(known?' '+tr('sn.known',{n:known}):''):tr('sn.nothing')];
    const skip=[]; if(sk.auth) skip.push(tr('sn.skipAuth',{n:sk.auth})); if(sk.sheet) skip.push(tr('sn.skipSheet',{n:sk.sheet})); if(dupes) skip.push(tr('sn.skipDupes',{n:dupes}));
    if(s.trashOver) skip.push(tr('sn.trashOver',{n:s.trashOver,m:MAX_TRASH})); const o=sk.files+sk.other+sk.encrypted+sk.deleted+sk.empty; if(o) skip.push(tr('sn.skipOther',{n:o}));
    if(skip.length) parts.push(tr('sn.skipped')+' '+skip.join(', ')+'.');
    const chg=[]; if(s.capped.body) chg.push(tr('sn.capBody',{n:s.capped.body,k:CAPS.body/1000})); if(s.capped.items||s.capped.item) chg.push(tr('sn.capItems',{n:s.capped.items+s.capped.item,m:ITEMS_MAX,c:CAPS.item}));
    if(s.lost.tables) chg.push(tr('sn.lostTables',{n:s.lost.tables})); const li=s.lost.images+s.lost.files+s.lost.embeds; if(li) chg.push(tr('sn.lostImages',{n:li})); if(s.archived) chg.push(tr('sn.archived',{n:s.archived}));
    if(chg.length) parts.push(tr('sn.changed')+' '+chg.join(', ')+'.');
    if(!fresh.length){ $('sn-msg').textContent=parts.join(' '); return; }
    parts.push(tr('sn.hint'));
    const yes=await ask(parts.join('\n\n'),{ok:'dlg.import'}); if(!yes||!VAULT||!DEK||importSn._busy) return;   // während der Rückfrage gesperrt?
    importSn._busy=true;
    try{
      if(editing) doneEditor();                                  // offener Editor würde nach dem Merge den alten Stand zurückschreiben (wie doImportVault)
      const before=VAULT.entries.slice(); const m=mergeEntries(VAULT.entries, fresh);
      if(liveCount(m.entries)>MAX_ENTRIES){ $('sn-msg').textContent=tr('err.tooMany'); return; }
      VAULT.entries=m.entries;
      try{ await persist(); if(!VAULT) return; $('sn-msg').textContent=tr('sn.done',{a:m.added,u:m.updated,t:newTrash}); renderList(); toast(tr('sn.doneToast')); }
      catch(e){ if(!(e&&e.locked)&&VAULT){ VAULT.entries=before; $('sn-msg').textContent=e&&e.fileFull?tr('err.fileFull',{m:MAX_FILE_BYTES/1048576}):tr('err.saveFailed'); } }
    }finally{ importSn._busy=false; }
  }

  /* ---------- Aegis-Hürde (TOTP beim Entsperren) — Einrichtung ohne QR: Schlüssel oder otpauth-Link kopieren, Code bestätigen ---------- */
  function totpStart(){
    if(!VAULT) return; pendingSecret=base32Encode(rand(20));
    pendingOtpauth=`otpauth://totp/Alien-Notes:Notizen?secret=${pendingSecret}&issuer=Alien-Notes&algorithm=SHA1&digits=6&period=30`;
    $('totp-secret').textContent=pendingSecret;
    hide('totp-off'); show('totp-setup'); hide('totp-on'); $('totp-verify').value=''; err('totp-setup-err'); setTimeout(()=>$('totp-verify').focus(),80);
  }
  function copySecret(){ if(pendingSecret) copyText(pendingSecret,'what.secret'); }
  function copyOtpauth(){ if(pendingOtpauth) copyText(pendingOtpauth,'what.otpauth'); }
  async function totpConfirm(){
    if(!VAULT||!pendingSecret||totpConfirm._busy) return; err('totp-setup-err'); totpConfirm._busy=true;
    try{
      const t=normalizeTotp(pendingSecret); const code=$('totp-verify').value.trim();
      if(!/^\d{6}$/.test(code)||!(await totpValid(t, code))) return err('totp-setup-err',tr('err.totpSetupBad'));
      if(!VAULT) return; const before=VAULT.totp; VAULT.totp=t;
      try{ await persist(); }catch(e){ if(!(e&&e.locked)&&VAULT) VAULT.totp=before; return; }
      pendingSecret=null; pendingOtpauth=''; $('totp-verify').value=''; $('totp-secret').textContent=''; renderSettings(); toast(tr('toast.totpOn'));
    }finally{ totpConfirm._busy=false; }
  }
  function totpCancel(){ pendingSecret=null; pendingOtpauth=''; $('totp-verify').value=''; $('totp-secret').textContent=''; renderSettings(); }
  async function totpDisable(){ if(!VAULT||!VAULT.totp||!(await ask(tr('confirm.totpDisable'),{ok:'dlg.disable'}))) return; if(!VAULT||!VAULT.totp) return; const before=VAULT.totp; VAULT.totp=null; try{ await persist(); }catch(e){ if(!(e&&e.locked)&&VAULT) VAULT.totp=before; return; } renderSettings(); toast(tr('toast.totpOff')); }

  /* ---------- Fingerabdruck-Entsperren (nur Android-App) — wortgleich Alien Pass v1.8, Invarianten in BIO-INVARIANTEN.md dort ----------
     Der DEK wird zusätzlich unter einem 32-Byte-Zufallsschlüssel verpackt (Rolle 'bio', Blob in localStorage, nie in der .notes-Datei).
     Den Zufallsschlüssel verwahrt der Android-Keystore, gebunden an einen starken Fingerabdruck (Freigabe pro Nutzung; ein neu
     eingerichteter Fingerabdruck macht ihn ungültig). Nach einem Neustart verweigert das Plugin den Keystore-Teil (außer keep): Passphrase-Pflicht,
     danach wird der Slot mit frischem Zufall neu bewaffnet. Ehrlich: Regel im Code, keine kryptografische Garantie — siehe Hilfe. */
  const BIO_KEY='ai-notes-bio', BIO_REARM_KEY='ai-notes-bio-rearm', BIO_HOLD_KEY='ai-notes-bio-hold';   // Marker (keine Geheimnisse): Neu-Bewaffnung nach Neustart / bewusster Riegel
  // bioGen ist die Generation ALLER Pforten: jede Sperre und jeder Passphrase-Wechsel erhöht sie, jede laufende Pforte pinnt sie vor dem
  // ersten await und verwirft ihr Ergebnis, wenn sie sich geändert hat. bioKeep ist NUR Anzeige: die Wahrheit steht im Slot des Plugins.
  let bioArmed=false, bioNeedsRearm=false, bioRearmDek=null, bioAuto=true, bioKeep=false;
  function bioBlob(){ try{ return parseBioBlob(localStorage.getItem(BIO_KEY)); }catch(_){ return null; } }
  function bioMarker(){ try{ return localStorage.getItem(BIO_REARM_KEY)==='1'; }catch(_){ return false; } }
  function setBioMarker(on){ try{ if(on) localStorage.setItem(BIO_REARM_KEY,'1'); else localStorage.removeItem(BIO_REARM_KEY); }catch(_){} }
  // Riegel: „Jetzt sperren“ = bewusst gesperrt → beim nächsten Start nur die Passphrase (kein Knopf, kein Prompt); Schlüsselmaterial bleibt.
  function bioHold(){ try{ return localStorage.getItem(BIO_HOLD_KEY)==='1'; }catch(_){ return false; } }
  function setBioHold(on){ try{ if(on) localStorage.setItem(BIO_HOLD_KEY,'1'); else localStorage.removeItem(BIO_HOLD_KEY); }catch(_){} }
  function bioMsg(t){ const n=$('bio-msg'); if(!n) return; n.textContent=t||''; n.classList.toggle('hidden',!t); }
  // Warnung „neuer Fingerabdruck im System“: bleibt stehen, bis der Nutzer sie liest oder bewusst neu aktiviert (ein Toast ging im Gerätetest unter)
  const BIO_ALERT_KEY='ai-notes-bio-alert';
  function bioAlert(){ try{ return localStorage.getItem(BIO_ALERT_KEY)==='1'; }catch(_){ return false; } }
  function setBioAlert(on){ try{ if(on) localStorage.setItem(BIO_ALERT_KEY,'1'); else localStorage.removeItem(BIO_ALERT_KEY); }catch(_){} if(VAULT){ renderBioAlert(); renderSettings(); } }
  function bioAlertOk(){ setBioAlert(false); }
  function renderBioAlert(){ const box=$('bio-alert-list'); if(!box) return; box.replaceChildren(); if(!VAULT||!bioAlert()) return;
    const w=el('div','warn',tr('bio.alert')); w.style.marginBottom='12px'; const b=el('button','btn sm',tr('bio.alertOk')); b.dataset.action='bioAlertOk'; b.style.marginTop='8px';
    w.appendChild(el('br')); w.appendChild(b); box.appendChild(w); }
  // Eine laufende Passphrase-Pforte lässt den Fingerabdruck-Knopf ruhen; ein hängender Prompt friert die Passphrase NICHT ein (run-3, verify-bio [14]).
  function gateBusy(){ return !!(doUnlock._busy||doPin._busy||doBio._busy); }
  function renderBioGate(){ const b=$('bio-btn'); if(b){ b.classList.toggle('hidden',!bioArmed||bioHold()); b.disabled=!!(doUnlock._busy||doPin._busy); } const u=$('unlock-btn'); if(u&&!doUnlock._busy) u.disabled=!!doPin._busy; }   // Riegel: Knopf verborgen; Passphrase ruht nur während eines PIN-Argon2
  // Slot verwerfen: JS-Blob + Marker immer, Keystore-Teil auf Wunsch (bei ungültigem Schlüssel hat das Plugin ihn schon selbst gelöscht). bioGen++ lässt laufende enroll/unlock verfallen.
  function bioDrop(native){ try{ localStorage.removeItem(BIO_KEY); }catch(_){} setBioMarker(false); setBioHold(false); bioArmed=false; bioNeedsRearm=false; bioRearmDek=null; bioKeep=false; bioGen++; if(native&&BIO){ try{ BIO.disable().catch(()=>{}); }catch(_){} } renderBioGate(); }
  // Sperrbildschirm: nativen Zustand abgleichen. auto = Prompt sofort zeigen (nicht nach manuellem Sperren, nie im Hintergrund)
  async function bioProbe(auto){
    bioArmed=false; renderBioGate();
    if(!BIO){ if(bioBlob()||bioMarker()) bioDrop(false); return; }                     // Web-Build: kein Slot, Reste wegräumen
    const gen=bioGen, blob=bioBlob(), marker=bioMarker();
    let st; try{ st=await BIO.status(); }catch(_){ st={enabled:false,reason:'error'}; }
    if(gen!==bioGen||DEK||pendingUnlock) return;
    const reason=st&&st.reason;
    bioKeep=!!(st&&st.enabled&&st.keep);   // nur Anzeige: gilt der Slot über einen Neustart hinaus?
    // Neue Registrierung im System schlägt Neustart: das Plugin prüft den Kanarien-Schlüssel VOR der Boot-Kennung. Kein automatisches Neu-Bewaffnen.
    if(reason==='invalidated'){ bioDrop(false); bioMsg(tr('bio.reset')); setBioAlert(true); return; }
    if(reason==='reboot'||(!blob&&marker&&reason==='none')){                             // Neustart: nativ ist der Slot schon weg; JS-Blob verwerfen, Marker + Kanarie bleiben
      if(blob||reason==='reboot') bioDrop(false); setBioMarker(true); bioNeedsRearm=true; bioMsg(tr('bio.afterReboot')); return; }   // disable() würde auch die Kanarie löschen
    if(!blob){ if(st&&st.enabled){ try{ BIO.disable().catch(()=>{}); }catch(_){} } setBioMarker(false); setBioHold(false); return; }   // Keystore-Rest ohne JS-Blob: aufräumen
    if(st&&st.enabled&&bioHold()){ bioArmed=true; bioNeedsRearm=false; setBioMarker(false); renderBioGate(); bioMsg(tr('bio.held')); return; }   // Riegel: Slot gilt, aber kein Knopf, kein Prompt
    if(st&&st.enabled){ bioArmed=true; bioNeedsRearm=false; setBioMarker(false); renderBioGate(); if(auto&&!document.hidden) doBio(); return; }
    if(reason==='unavailable'||reason==='error'){ bioMsg(tr('bio.naNow')); return; }     // vorübergehend (Keystore beschäftigt): Slot behalten, Passphrase
    bioDrop(false); bioMsg(tr('bio.reset'));                                              // neuer Fingerabdruck / Schlüssel weg: bewusst neu aktivieren
  }
  // Slot (neu) bewaffnen: braucht einen EXTRAHIERBAREN DEK-Handle (WebCrypto-Objekt, nie Rohbytes), der danach fallen gelassen wird;
  // wrap bindet den Slot an den Passphrase-Slot der Datei (Ciphertext + IV). keep = „auch nach Neustart“: nur beim bewussten Aktivieren, nie beim Rearm.
  async function bioArm(dekX, kdf, wrap, rearm, keep){
    const gen=bioGen, secret=rand(32), wantKeep=!!keep&&!rearm;
    try{
      const key=await bioKey(secret); const blob=await wrapDek(dekX, key, kdf, 'bio'); const ser=serializeBioBlob(blob, wrap.ct, wrap.iv);
      // rearm:true → das Plugin richtet nur mit gültigem Kanarien-Schlüssel neu ein (sonst 'invalidated' bzw. 'nocanary')
      await BIO.enroll({secret:bufToB64(secret), rearm:!!rearm, keep:wantKeep, title:tr('bio.promptTitle'), subtitle:tr(rearm?'bio.promptRearm':'bio.promptEnroll'), negative:tr('btn.cancel')});
      if(gen!==bioGen||!VAULT){ try{ BIO.disable().catch(()=>{}); }catch(_){} setBioMarker(false); toast(tr('bio.aborted')); return false; }   // zwischendurch gesperrt / Passphrase gewechselt: nichts hinterlassen, auch keinen Marker
      localStorage.setItem(BIO_KEY, ser); setBioMarker(false); bioArmed=true; bioNeedsRearm=false; bioKeep=wantKeep; if(!rearm) setBioAlert(false); return true;   // bewusst neu aktiviert: Warnung erledigt
    }catch(e){ const c=e&&e.message;
      if(rearm&&c==='unavailable'){ bioArmed=false; setBioMarker(true); bioNeedsRearm=true; toast(tr('bio.naNow')); return false; }   // Keystore vorübergehend nicht bereit: beim nächsten Entsperren erneut, Kanarie + Marker bleiben
      if(c==='nocanary'){ bioDrop(false); toast(tr('bio.rearmNeeded')); return false; }   // Slot ohne Kanarie: bewusst neu aktivieren, kein Fehlalarm
      bioDrop(true); if(c==='invalidated') setBioAlert(true); toast(tr(c==='invalidated'?'bio.rearmRefused':c==='cancel'?'bio.cancelled':c==='lockout'?'bio.lockout':'bio.failed')); return false; }
    finally{ secret.fill(0); }
  }
  // Sperrbildschirm: Fingerabdruck → Keystore gibt den Zufallsschlüssel heraus → DEK auspacken → gleicher Weg wie die Passphrase
  async function doBio(){
    if(doBio._busy||doUnlock._busy||doPin._busy||!BIO||!bioArmed||bioHold()||DEK||pendingUnlock) return; err('lock-err');   // Riegel: Passphrase-Pflicht
    doBio._busy=true; renderBioGate(); renderPinGate();   // Riegel SOFORT, vor dem ersten await (vaultGet asynchron)
    const release=()=>{ doBio._busy=false; renderBioGate(); renderPinGate(); };
    let raw; try{ raw=await vaultGet(); }catch(_){ release(); return err('lock-err',tr('err.storeRead')); } if(!raw){ release(); return boot(); }
    let f; try{ f=parseFile(raw); }catch(e){ release(); return err('lock-err',fileErrMsg(e)); }
    const blob=bioBlob(); if(!blob){ release(); bioDrop(true); return; }
    if(!bioWrapOk(blob,f.wrap)){ bioArmed=false; release(); return bioMsg(tr('bio.wrapMismatch')); }   // fremder/veränderter Passphrase-Slot (ct ODER iv): nie übernehmen, Blob behalten (Backup-Restore heilt)
    const gen=bioGen; let secret=null;
    try{
      const r=await BIO.unlock({title:tr('bio.promptTitle'), subtitle:tr('bio.promptUnlock'), negative:tr('bio.usePass')});
      secret=b64Bytes(r&&r.secret); if(!secret||secret.length!==32) throw new Error('invalid');
      const key=await bioKey(secret); secret.fill(0);
      const dek=await unwrapDek(blob, key, f.kdf, false, 'bio');
      const obj=await decryptBody(f.body, dek, f.kdf); const v=sanitizeVault(obj);
      if(gen!==bioGen||DEK||pendingUnlock) return;                        // zwischendurch gesperrt oder anders entsperrt
      if(v.totp){ pendingUnlock={dek, kdf:f.kdf, wrap:f.wrap, vault:v}; }
      else { DEK=dek; KDF=f.kdf; WRAP=f.wrap; VAULT=v; failCount=0; lockedUntil=0; saveLockState(); }
    }catch(e){
      const c=e&&e.message; if(gen!==bioGen) return;
      if(c==='cancel') return; if(c==='lockout') return err('lock-err',tr('bio.lockout'));
      if(c==='reboot'){ bioDrop(false); setBioMarker(true); bioNeedsRearm=true; return bioMsg(tr('bio.afterReboot')); }   // Slot hat unlock() selbst gelöscht, Kanarie bleibt
      if(c==='error'){ err('lock-err',tr('bio.naNow')); return; }          // Timeout/Sensor nicht bereit: Slot bleibt nativ stehen → hier auch nichts löschen (N1)
      if(c==='tampered'){ bioDrop(false); setBioAlert(true); return bioMsg(tr('bio.tampered')); }   // GCM-Tag der Slot-Datei falsch: nie „vorübergehend“, kein automatisches Wipe
      if(c==='invalidated') setBioAlert(true);                            // neuer Finger, während die App gesperrt im Hintergrund lag: bleibende Warnung
      bioDrop(c!=='invalidated'&&c!=='none'); return bioMsg(tr('bio.reset'));   // ungültiger Schlüssel, alter/fremder Blob, Manipulation
    }finally{ doBio._busy=false; if(secret) secret.fill(0); renderBioGate(); renderPinGate(); }
    afterGate();
  }
  // Einstellungen: aktivieren (Passphrase bestätigen → extrahierbarer DEK-Handle nur für das Verpacken) / deaktivieren
  async function bioEnable(){
    if(bioEnable._busy||!VAULT||!BIO) return; err('bio-err');
    if(changePass._busy) return err('bio-err',tr('bio.busy'));
    if(pinEnable._busy) return err('bio-err',tr('pin.busy'));
    const btn=$('bio-btn-on'), orig=btn.textContent; bioEnable._busy=true; btn.disabled=true; btn.textContent=tr('busy.checking');   // Guard VOR dem ersten await
    try{
      let av; try{ av=await BIO.available(); }catch(_){ av={ok:false,reason:'error'}; }
      if(!av||!av.ok) return err('bio-err',tr(av&&av.reason==='noneEnrolled'?'bio.naEnrolled':(av&&(av.reason==='noHardware'||av.reason==='noStrong'))?'bio.naHardware':'bio.naNow'));
      const pass=$('bio-pass').value; if(!pass) return err('bio-err',tr('err.cpWrong'));
      let dekX; try{ const kek=await deriveKek(passBytes(pass), KDF); dekX=await unwrapDek(WRAP, kek, KDF, true); }catch(_){ return err('bio-err',tr('err.cpWrong')); }
      if(!VAULT||!DEK) return; $('bio-pass').value='';
      const keep=!!($('bio-keep')&&$('bio-keep').checked);   // Wahl gilt nur für DIESE Aktivierung; danach wieder ab Werk aus
      if(await bioArm(dekX, KDF, WRAP, false, keep)){ toast(tr('bio.on')); const k=$('bio-keep'); if(k) k.checked=false; }
    }finally{ bioEnable._busy=false; btn.disabled=false; btn.textContent=orig; $('bio-pass').value=''; maskInputs('#bio-card'); renderSettings(); }
  }
  async function bioDisable(){ if(!VAULT||!bioArmed||!(await ask(tr('confirm.bioDisable'),{ok:'dlg.disable'}))) return; if(!VAULT||!bioArmed) return; bioDrop(true); toast(tr('bio.off')); renderSettings(); }


  /* ---------- Schnell-Entsperren per PIN (Alien Pass v1.8, RAM-Slot bis zum Beenden, nur Desktop sichtbar) — Invarianten in PIN-INVARIANTEN.md dort ----------
     Die PIN ersetzt nach einer Sperre INNERHALB derselben Programmlaufzeit die Passphrase. Sie schützt NIE die Datei auf der Platte,
     sondern nur eine Kopie des Datenschlüssels, die beim Sperren im Arbeitsspeicher bleibt — unter einem PIN-abgeleiteten Argon2id-Schlüssel
     verpackt (AAD-Rolle 'pin', an m/t/p/Salz der DATEI gebunden wie der Fingerabdruck-Slot). Der Slot lebt AUSSCHLIESSLICH in dieser Closure:
     nie in localStorage, nie über die Desktop-Brücke, nie serialisiert, nie im Backup. Beenden der App = Kopie weg. Drei Fehlversuche verwerfen sie. */
  const PIN_MIN=6, PIN_MAX=12, PIN_TRIES=3, PIN_RE=/^\d{6,12}$/;
  const PIN_MAX_AGE=24*3600*1000;   // feste Grenze ohne Einstellung (Audit run-8): ein Desktop-Fenster bleibt sonst wochenlang offen
  let PIN=null, pinHold=false;   // {blob:{iv,ct}, pkdf, w, at, tries} — NUR RAM. pinHold = Riegel nach „Jetzt sperren“/Strg+L
  function pinMsg(t){ const n=$('pin-msg'); if(!n) return; n.textContent=t||''; n.classList.toggle('hidden',!t); }
  function wipeSlot(s){ try{ s.blob.iv.fill(0); s.blob.ct.fill(0); s.pkdf.salt.fill(0); }catch(_){} }
  function pinExpired(){ return !!PIN&&Date.now()-PIN.at>PIN_MAX_AGE; }
  function renderPinGate(){
    if(pinExpired()){ const s=PIN; PIN=null; pinHold=false; if(!doPin._busy) wipeSlot(s); if(!DEK&&!pendingUnlock) err('lock-err',tr('pin.expired')); if(VAULT) renderSettings(); }
    const box=$('pin-box'); if(box) box.classList.toggle('hidden',!(PIN&&!pinHold)); const b=$('pin-btn'); if(b) b.disabled=gateBusy(); }
  function pinDrop(){ const s=PIN; PIN=null; pinHold=false; if(s&&!doPin._busy) wipeSlot(s); renderPinGate(); if(VAULT) renderSettings(); }
  async function doPin(){
    if(doPin._busy||doUnlock._busy||doBio._busy||DEK||pendingUnlock) return; renderPinGate(); if(!PIN||pinHold) return; err('lock-err'); pinMsg('');
    const pin=$('lock-pin').value;
    if(!PIN_RE.test(pin)){ $('lock-pin').value=''; maskInputs('#screen-lock'); return pinMsg(tr('pin.format',{a:PIN_MIN,b:PIN_MAX})); }   // kein Fehlversuch: die Eingabe war nie eine PIN
    // Riegel SOFORT, vor dem ersten await (vaultGet asynchron): Passphrase-/Fingerabdruck-Knopf solange aus
    const btn=$('pin-btn'), orig=btn.textContent; doPin._busy=true; btn.disabled=true; btn.textContent=tr('busy.decrypting'); renderBioGate();
    const release=()=>{ doPin._busy=false; btn.disabled=false; btn.textContent=orig; renderPinGate(); renderBioGate(); };
    let raw; try{ raw=await vaultGet(); }catch(_){ release(); $('lock-pin').value=''; maskInputs('#screen-lock'); return err('lock-err',tr('err.storeRead')); } if(!raw){ release(); return boot(); }
    let f; try{ f=parseFile(raw); }catch(e){ release(); $('lock-pin').value=''; maskInputs('#screen-lock'); return err('lock-err',fileErrMsg(e)); }
    // fremder/veränderter Passphrase-Slot oder KDF-Header: der RAM-Slot passt nicht mehr — verwerfen und ehrlich „Datei geändert“ melden (Audit run-8 #1/#10)
    if(!PIN||PIN.w!==wrapTag(f.kdf,f.wrap)){ release(); $('lock-pin').value=''; maskInputs('#screen-lock'); pinDrop(); return err('lock-err',tr('pin.fileChanged')); }
    const slot=PIN, gen=bioGen;
    try{
      const pkey=await deriveKek(passBytes(pin), slot.pkdf);
      const dek=await unwrapDek(slot.blob, pkey, f.kdf, false, 'pin');
      const obj=await decryptBody(f.body, dek, f.kdf); const v=sanitizeVault(obj);
      if(gen!==bioGen||DEK||pendingUnlock||PIN!==slot){ $('lock-pin').value=''; maskInputs('#screen-lock'); return; }   // eine andere Pforte war schneller oder der Slot ist verworfen
      PIN.tries=0;
      if(v.totp){ pendingUnlock={dek, kdf:f.kdf, wrap:f.wrap, vault:v}; }   // Aegis-Hürde bleibt auch vor der PIN
      else { DEK=dek; KDF=f.kdf; WRAP=f.wrap; VAULT=v; failCount=0; lockedUntil=0; saveLockState(); }
    }catch(e){
      if(gen!==bioGen||DEK||pendingUnlock){ $('lock-pin').value=''; maskInputs('#screen-lock'); return; }
      $('lock-pin').value=''; maskInputs('#screen-lock');
      if(PIN!==slot) return;
      PIN.tries++;   // PIN-Fehlversuche zählen NICHT in die Passphrase-Bremse — sie sagen nichts über die Passphrase aus
      if(PIN.tries>=PIN_TRIES){ pinDrop(); return err('lock-err',tr('pin.dropped')); }
      return pinMsg(tr('pin.wrong',{n:PIN_TRIES-PIN.tries}));
    }finally{ doPin._busy=false; if(PIN!==slot) wipeSlot(slot); release(); }
    afterGate();
  }
  // Einstellungen: einrichten (Passphrase bestätigen → EINZIGER extrahierbarer DEK-Handle, nur zum Verpacken). Alle Prüfungen IM try,
  // damit das finally auf jedem Weg Felder leert und Augen schließt (Audit run-8 #2).
  async function pinEnable(){
    if(pinEnable._busy||!VAULT||!DEK) return; err('pin-err');
    if(changePass._busy||bioEnable._busy) return err('pin-err',tr('pin.busy'));
    const btn=$('pin-btn-on'), orig=btn.textContent; pinEnable._busy=true; btn.disabled=true; btn.textContent=tr('busy.checking');
    const gen=bioGen; let done=false;
    try{
      const p1=$('pin-new').value, p2=$('pin-rep').value, pass=$('pin-pass').value;
      if(!PIN_RE.test(p1)) return err('pin-err',tr('pin.format',{a:PIN_MIN,b:PIN_MAX}));
      if(p1!==p2) return err('pin-err',tr('pin.mismatch'));
      if(!pass) return err('pin-err',tr('err.cpWrong'));
      let dekX; try{ const kek=await deriveKek(passBytes(pass), KDF); dekX=await unwrapDek(WRAP, kek, KDF, true); }
      catch(_){ return err('pin-err',tr('err.cpWrong')); }
      if(gen!==bioGen||!VAULT||!DEK) return;
      const pkdf={m:KDF.m, t:KDF.t, p:KDF.p, salt:rand(16)};
      const pkey=await deriveKek(passBytes(p1), pkdf);
      if(gen!==bioGen||!VAULT||!DEK) return;
      const blob=await wrapDek(dekX, pkey, KDF, 'pin');
      if(gen!==bioGen||!VAULT||!DEK) return;
      PIN={blob, pkdf, w:wrapTag(KDF,WRAP), at:Date.now(), tries:0}; pinHold=false; done=true;
      toast(tr('pin.on'));
    }catch(_){ err('pin-err',tr('pin.failed')); }
    finally{ pinEnable._busy=false; btn.disabled=false; btn.textContent=orig; $('pin-new').value=$('pin-rep').value=$('pin-pass').value=''; maskInputs('#pin-card'); renderPinGate(); if(VAULT) renderSettings();
      if(!done&&(gen!==bioGen||!VAULT||!DEK)) toast(tr('pin.aborted')); }
  }
  async function pinDisable(){ if(!VAULT||!PIN||!(await ask(tr('confirm.pinDisable'),{ok:'dlg.discard'}))) return; if(!VAULT||!PIN) return; pinDrop(); toast(tr('pin.off')); }
  // Desktop-Tastatur: Strg+L sperren, Strg+F Suche, Strg+N neue Notiz, Strg+S Notiz fertig. Nur in der Hülle, nur entsperrt (Strg+L auch in der Wartestellung).
  function deskKey(ev){
    if(!DESK||!ev.ctrlKey||ev.altKey||ev.shiftKey||ev.metaKey) return false; const k=(ev.key||'').toLowerCase();
    if(k==='l'&&(DEK||pendingUnlock)){ lockNow(); return true; }
    if(dlgResolve) return true;   // offene Rückfrage: kein Strg+N/F/S daran vorbei (nur Sperren)
    if(!DEK) return false;
    if(k==='f'){ closeHelp(); tab('list'); const q=$('search'); q.focus(); q.select(); return true; }
    if(k==='n'){ closeHelp(); newEntry(); return true; }
    if(k==='s'){ if(editing) doneEditor(); return true; }   // wie „Fertig“; ohne Editor nur den Browser-Dialog schlucken
    return false;
  }

  /* ---------- Einstellungen ---------- */
  // Bewusst gesperrt: Riegel für den Fingerabdruck — nächster Start nur mit Passphrase, danach gilt er wieder (Verwerfen würde die Gewohnheit bestrafen)
  function lockNow(){ if(BIO&&(bioArmed||bioBlob())) setBioHold(true); if(PIN) pinHold=true; bioAuto=false; lockSaving(); }
  function renderSettings(){ if(!VAULT) return; const s=VAULT.settings; $('set-autolock').value=String(s.autolock); $('set-bglock').value=String(s.bgLock); $('set-clip').value=String(s.clipClear); syncCombos();
    const on=!!VAULT.totp; $('totp-off').classList.toggle('hidden',on||!!pendingSecret); $('totp-on').classList.toggle('hidden',!on); $('totp-setup').classList.toggle('hidden',!pendingSecret);
    const bc=$('bio-card'); if(bc){ bc.classList.toggle('hidden',!BIO); $('bio-off').classList.toggle('hidden',bioArmed); $('bio-on').classList.toggle('hidden',!bioArmed);
      // zwei fertige Texte statt eines zusammengesetzten: beide tragen data-i18n, applyI18n übersetzt sie, hier wird nur umgeschaltet
      const bt=$('bio-on-text'), bk=$('bio-on-text-keep'); if(bt&&bk){ bt.classList.toggle('hidden',bioKeep); bk.classList.toggle('hidden',!bioKeep); }
      const ba=$('bio-alert'); if(ba){ ba.textContent=bioAlert()?tr('bio.alert'):''; ba.classList.toggle('hidden',!bioAlert()); } }
    // PIN-Karte nur am Desktop (Klasse .only-desk im HTML, hier zusätzlich per JS — Android später freischalten, der Code ist plattformneutral)
    const pc=$('pin-card'); if(pc){ pc.classList.toggle('hidden',!DESK); $('pin-off').classList.toggle('hidden',!!PIN); $('pin-on').classList.toggle('hidden',!PIN); }
    // FLAG_SECURE-Karte nur in der Android-App (Web/Desktop haben den Schalter nicht); Kästchen = Schutz AN
    const sc=$('secure-card'); if(sc){ sc.classList.toggle('hidden',!SEC); $('set-secure').checked=s.secure!==0; }
    const soft=document.documentElement.getAttribute('data-theme')==='soft'; $('th-dark').classList.toggle('on',!soft); $('th-soft').classList.toggle('on',soft);
    $('about-line').textContent=tr('about',{v:APP_VERSION,m:Math.round(KDF.m/1024),t:KDF.t,p:KDF.p}); }
  function setSetting(key, v){ if(!VAULT) return; const n=Number(v); if(!SETTINGS_ALLOWED[key].includes(n)) return; const before=VAULT.settings[key]; VAULT.settings[key]=n; return persist().then(()=>{ resetIdle(); return true; }).catch(e=>{ if(e&&e.locked) return false; if(VAULT){ VAULT.settings[key]=before; renderSettings(); } return false; }); }
  const setAutolock=v=>{ setSetting('autolock',v); }, setBgLock=v=>{ setSetting('bgLock',v); }, setClipClear=v=>{ setSetting('clipClear',v); };   // ohne Rückgabe (Tests warten sonst auf den Persist); setSecure nutzt das Promise
  /* ---------- FLAG_SECURE (kein Screenshot, schwarze Vorschau im App-Umschalter): ab Werk an, abschaltbar (Entscheidung 24.09.2026) ----------
     Die Wahl liegt in settings.secure (nie importiert). Gesperrt und beim Einrichten ist der Schutz IMMER an — nur eine entsperrte Sitzung
     hebt ihn auf Wunsch auf; lock() schaltet ihn wieder ein, bevor der Sperrbildschirm erscheint. Nativ setzt/löscht das Plugin die Flagge. */
  function applySecure(on){ if(!SEC) return; try{ const p=SEC.set({on:!!on}); if(p&&p.catch) p.catch(()=>{}); }catch(_){} }
  // Flagge folgt der gespeicherten Einstellung: erst nach erfolgreichem Persist umschalten, bei Fehler bleibt der Schutz an (Audit run-1 Hardening)
  function setSecure(_, elx){ if(!VAULT||!elx) return; const on=!!elx.checked; const p=setSetting('secure', on?1:0); if(p&&p.then) p.then(okk=>{ if(okk&&VAULT) applySecure(on); }); }
  function theme(t){ try{ if(t==='soft'){ document.documentElement.setAttribute('data-theme','soft'); localStorage.setItem('alien-theme','soft'); } else { document.documentElement.removeAttribute('data-theme'); localStorage.setItem('alien-theme','dark'); } }catch(_){} if(VAULT) renderSettings(); else { const soft=t==='soft'; $('th-dark').classList.toggle('on',!soft); $('th-soft').classList.toggle('on',soft); } }
  async function changePass(){
    if(changePass._busy||!VAULT) return; err('cp-err');
    if(bioEnable._busy) return err('cp-err',tr('bio.busy'));                 // nicht parallel zum Fingerabdruck-Aktivieren (Audit run-3 #5)
    if(pinEnable._busy) return err('cp-err',tr('pin.busy'));                 // ebenso wenig parallel zum PIN-Einrichten
    const cur=$('cp-cur').value, p1=$('cp1').value, p2=$('cp2').value;
    if(p1.length<12){ maskInputs('#tab-settings'); return err('cp-err',tr('err.cpShort')); }        // Tippfehler: Augen zu, die alte Passphrase bleibt nie sichtbar stehen (Audit run-8 #2)
    if(p1!==p2){ maskInputs('#tab-settings'); return err('cp-err',tr('err.cpMismatch')); }
    const btn=$('cp-btn'), orig=btn.textContent; changePass._busy=true; btn.disabled=true; btn.textContent=tr('busy.changing');
    const old={DEK,KDF,WRAP};
    try{
      try{ const kOld=await deriveKek(passBytes(cur), KDF); await unwrapDek(WRAP,kOld,KDF,false); }   // alte Passphrase real prüfen
      catch(_){ return err('cp-err',tr('err.cpWrong')); }
      { const c=passCheck(p1); if(c.weak&&!(await ask(tr('confirm.weakPassCp',{why:whyText(c.why)}),{ok:'dlg.useAnyway'}))) return; }   // erst nach der alten Passphrase
      if(!VAULT||!DEK) return;                                   // während der Rückfrage gesperrt
      const kdf={m:KDF.m,t:KDF.t,p:KDF.p,salt:rand(16)};
      const kNew=await deriveKek(passBytes(p1), kdf);
      const dekX=await newDek(); const wrap=await wrapDek(dekX,kNew,kdf); const dek=await unwrapDek(wrap,kNew,kdf,false);   // DEK-Rotation
      if(!VAULT||!DEK) return;                                   // zwischenzeitlich gesperrt → nichts wiederbeleben
      DEK=dek; KDF=kdf; WRAP=wrap;
      // Bei .locked NICHT zurückrollen: die alten Schlüssel wiederherzustellen würde eine gesperrte Sitzung wiederbeleben
      try{ await persist(); }catch(e){ if(!(e&&e.locked)&&VAULT){ DEK=old.DEK; KDF=old.KDF; WRAP=old.WRAP; } return; }
      const hadBio=bioArmed||!!bioBlob()||bioMarker(); if(hadBio) bioDrop(true); pinDrop(); bioGen++;   // neuer DEK/Salt: Fingerabdruck- und PIN-Slot passen nicht mehr   // neuer DEK/Salt: Fingerabdruck-Slot passt nicht mehr → bewusst neu aktivieren; bioGen++ lässt auch einen laufenden enroll verfallen (Audit run-3 #5)
      $('cp-cur').value=$('cp1').value=$('cp2').value=''; $('cp-meter').textContent=''; toast(tr(hadBio?'toast.passChangedBio':'toast.passChanged')); renderSettings();
    }finally{ changePass._busy=false; btn.disabled=false; btn.textContent=orig; }
  }
  async function wipeLocal(){ if(!VAULT||!(await ask(tr('confirm.wipe'),{ok:'dlg.deleteForever',danger:true}))) return; if(!VAULT) return; bioDrop(true); pinDrop(); try{ localStorage.removeItem(BIO_ALERT_KEY); }catch(_){}
    try{ localStorage.removeItem(LS_KEY); }catch(_){}   // auch auf Android: sonst holte migrateStore einen Rest aus dem Browser-Speicher zurück (Audit run-1b)
    vaultDel().then(()=>{ editing=false; editId=null; lock(); }).catch(()=>toast(tr('err.saveFailed'))); }

  /* ---------- misc ---------- */
  function openHelp(){ show('help-overlay'); $('help-overlay').scrollTop=0; }
  function closeHelp(){ hide('help-overlay'); }
  function toggleLang(){ setLang(LANG==='de'?'en':'de'); }
  function relabel(){ if(!VAULT){ if(!pendingUnlock){ err('lock-err'); pinMsg(''); bioMsg(''); } return; } renderAddTitle(); relabelItemRows(); renderCounter(); if(editing&&editId){ const e=byId(editId); if(e) $('ed-meta').textContent=tr('ed.meta',{c:fmtDate(e.created),u:fmtDate(e.updated)}); } renderList(); renderTrash(); renderSettings(); renderBackupMsg(); }
  function renderAll(){ renderList(); renderSettings(); renderBackupMsg(); }
  function kdfChanged(){ kdfTouched=true; }

  return {boot,doSetup,doUnlock,doTotp,cancelTotp,lock,lockNow,tab,dialogOk,dialogCancel,dialogOpen,dialogKey,
    newEntry,openEditor,doneEditor,copyCurrent,deleteCurrent,editorChanged,changeEntryType,mdModeEdit,mdModeView,mdToggle,mdCheat,mdExample,insertDate,
    addItemRow,itemEnter,removeItemRow,itemChanged,sortDone,resetDone,
    renderList,setCatFilter,clearCatFilter,toggleFavFilter,openCatMenu,toggleCatMenu,catInput,pickCat,
    openTrash,renderTrash,restoreEntry,purgeEntry,emptyTrash,
    closeMenus,syncCombo,syncCombos,toggleCombo,chooseOpt,
    suggestPass,meterSetup,meterCp,kdfChanged,
    exportVault,importVault,importSn,doImportVault,cancelImport,pickFile,
    setAutolock,setBgLock,setClipClear,setSecure,theme,changePass,wipeLocal,
    totpStart,totpConfirm,totpCancel,totpDisable,copySecret,copyOtpauth,doBio,bioEnable,bioDisable,bioAlertOk,doPin,pinEnable,pinDisable,deskKey,
    openHelp,closeHelp,toggleLang,relabel,togglePass,maskInputs,eyeWrap,enhancePassFields};
})();

/* ===== KIT: Event-Delegation (die Funktion muss im App-Export stehen) ===== */
document.addEventListener('click',ev=>{
  if(!ev.target.closest('.combo')) App.closeMenus();   // Klick außerhalb eines Auswahlfelds schließt jedes Menü
  const sp=ev.target.closest('[data-showpass]');
  if(sp){ App.togglePass(null,sp); return; }
  const elx=ev.target.closest('[data-action]'); if(!elx) return;
  const fn=App[elx.dataset.action]; if(typeof fn==='function') fn(elx.dataset.arg, elx);
});
// Auge: Fokus bleibt im Passwortfeld (Tastatur klappt nicht zu, Cursor bleibt stehen) — am Gerät bestätigt (GrapheneOS, 16.09.2026)
document.addEventListener('mousedown',ev=>{ if(ev.target.closest('.pw-eye')) ev.preventDefault(); });
document.addEventListener('change',ev=>{
  const elx=ev.target.closest('[data-change]'); if(!elx) return;
  const a=elx.dataset.change; const fn=App[a]; if(typeof fn!=='function') return;
  if(a==='importVault'||a==='importSn') return fn(ev);
  fn(elx.value, elx);
});
document.addEventListener('input',ev=>{
  const elx=ev.target.closest('[data-input]'); if(!elx) return;
  const fn=App[elx.dataset.input]; if(typeof fn==='function') fn(elx.value, elx);
});
document.addEventListener('keydown',ev=>{
  if(App.deskKey(ev)){ ev.preventDefault(); return; }
  if(App.dialogKey(ev)){ ev.preventDefault(); return; }
  if(ev.key==='Escape'){ App.closeMenus(); App.closeHelp(); return; }
  if(ev.key!=='Enter') return;
  const elx=ev.target.closest('[data-enter]'); if(!elx) return;
  const fn=App[elx.dataset.enter]; if(typeof fn==='function'){ ev.preventDefault(); fn(elx.dataset.arg, elx); }
});
window.addEventListener('DOMContentLoaded',()=>{
  const ok=window.crypto&&crypto.subtle&&typeof WebAssembly!=='undefined'&&window.hashwasm&&typeof hashwasm.argon2id==='function';
  if(!ok){ const c=document.querySelector('.container'); c.replaceChildren(); const d=document.createElement('div'); d.className='card warn'; d.textContent=tr('nocrypto'); c.appendChild(d); return; }
  const k=document.getElementById('setup-kdf'); if(k) k.addEventListener('change',App.kdfChanged);
  const dg=document.getElementById('dlg'); if(dg) dg.addEventListener('click',ev=>{ if(ev.target===dg) App.dialogCancel(); });   // Tippen auf den Hintergrund = Abbrechen
  if(window.AlienDesktop){   // Zweispaltig im breiten Fenster (CSS html.desk): der Editor wird rechte Spalte der Liste statt eigener Ansicht
    document.documentElement.classList.add('desk'); const a=document.getElementById('tab-add'), de=document.getElementById('detail-empty');
    if(a&&de) de.parentNode.insertBefore(a,de); }
  App.enhancePassFields();   // vor applyI18n: setzt die Augen-Beschriftung
  applyI18n();
  App.boot();
});
