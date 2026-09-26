# Alien Notes

Lokale, verschlüsselte **Notizen- und Checklisten-App** für Android / GrapheneOS und den **Linux-Desktop** (Flatpak).
Läuft komplett **offline** — keine Cloud, kein Server, kein Konto, keine Telemetrie.
Die Android-App fordert **keine Internet-Berechtigung** an — nur die zwei normalen Berechtigungen für den Fingerabdrucksensor (siehe Sicherheit).
Die Desktop-Fassung läuft als Flatpak **ohne Netzwerk-Berechtigung und ohne Zugriff auf deine Dateien**.
Deine Notizen verlassen das Gerät nie im Klartext.

Schwester-App von [Alien Pass](https://codeberg.org/Alien-Investor/alien-pass) und dem
[Sachwert-Tresor](https://codeberg.org/Alien-Investor/sachwert-tresor) — gleiche Architektur, gleiche Härtung, gleicher Alien-Investor-Stil.

## 📲 Installieren (Android / GrapheneOS)

Bewusst **nicht im Google Play Store**. Verteilung über signierte Releases hier auf Codeberg
und im [Zap Store](https://zapstore.dev). Empfohlen über **[Obtainium](https://github.com/ImranR98/Obtainium)**:

1. In Obtainium **„App hinzufügen"** → diese Repo-URL eintragen:
   ```
   https://codeberg.org/Alien-Investor/alien-notes
   ```
2. Quell-Typ wird als **Forgejo/Gitea** erkannt → **Hinzufügen** → **Installieren**.
3. Updates meldet Obtainium automatisch.

**Ohne Obtainium:** [Neuestes Release](https://codeberg.org/Alien-Investor/alien-notes/releases/latest) → `.apk` laden und installieren.

**Signatur-Fingerprint** (SHA-256 des Signatur-Zertifikats, über alle Versionen gleich — mit
[AppVerifier](https://github.com/soupslurpr/AppVerifier) prüfen):
```
AppVerifier (mit Doppelpunkten):
F3:68:F9:0B:F8:DF:8C:55:BB:6C:28:6D:32:25:BA:8A:F4:45:22:7B:A6:9B:36:00:DF:BB:F6:A1:44:09:BA:7C

Plain SHA-256 (apksigner):
f368f90bf8df8c55bb6c286d3225ba8af445227ba69b3600dfbbf6a14409ba7c
```

## 🖥️ Installieren (Linux-Desktop, Flatpak)

Derselbe Code wie auf dem Handy, verpackt mit Electron als **Flatpak** (x86_64). Das Dateiformat ist identisch: Backups vom Handy lassen
sich am Desktop importieren und umgekehrt. Verteilung als Datei mit GPG-signierter Prüfsumme im [Codeberg-Release](https://codeberg.org/Alien-Investor/alien-notes/releases) —
nicht auf Flathub, kein automatisches Update.

**Voraussetzung:** Flatpak mit dem Flathub-Remote (für die Laufzeit `org.freedesktop.Platform` 25.08, die flatpak beim Installieren nachlädt):
```
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
```

**1. Drei Dateien aus dem Release laden:** `alien-notes-X.Y-linux-x86_64.flatpak`, `SHA256SUMS`, `SHA256SUMS.asc`.

**2. Signatur prüfen.** Die Pakete sind mit dem GPG-Release-Schlüssel von Alien Investor signiert
([`alien-investor-release-key.asc`](alien-investor-release-key.asc) hier im Repo, derselbe Schlüssel wie bei Alien Pass und Sachwert-Tresor).
Den Fingerabdruck zusätzlich über einen zweiten Weg vergleichen (Website [alien-investor.org](https://alien-investor.org/alien-notes.html)):
```
Fingerabdruck:  100F 9E25 BFAE A807 DBC3  57D7 50C0 D785 83BF CB81
```
```
gpg --import alien-investor-release-key.asc
gpg --verify SHA256SUMS.asc SHA256SUMS      # „Korrekte Signatur von "Alien Investor (Release-Signatur) …"“
sha256sum -c SHA256SUMS                     # „…flatpak: OK“
```

**3. Installieren und starten:**
```
flatpak install --user alien-notes-X.Y-linux-x86_64.flatpak
flatpak run org.alieninvestor.notes
```
Danach steht Alien Notes im Anwendungsmenü.

**Update:** Eine neue Bündel-Datei lässt sich (Flatpak 1.14) nicht über die installierte legen. Neue Version laden und prüfen (Schritt 1–2), dann
```
flatpak uninstall --user org.alieninvestor.notes    # löscht KEINE Daten (ohne --delete-data)
flatpak install --user alien-notes-X.Y-linux-x86_64.flatpak
```
Die Notizen liegen in `~/.var/app/org.alieninvestor.notes/data/alien-notes/notes.ainv` und bleiben dabei erhalten. Vorher trotzdem ein Backup anlegen.

**Selbst prüfen, dass die App kein Netz hat:**
```
flatpak info --user --show-permissions org.alieninvestor.notes
```
Erwartet genau:
```
[Context]
shared=ipc;
sockets=wayland;fallback-x11;
devices=dri;
```
Kein `network`, kein `filesystem`.

## Erster Start

Beim ersten Öffnen vergibst du deine **Passphrase** (mindestens 12 Zeichen; der Vorschlag-Button
erzeugt sechs Würfelwörter aus der EFF-Liste). Die App misst dabei, wie schnell dein Gerät die
Schlüsselableitung schafft, und schlägt eine passende Argon2-Stufe vor.

> ⚠️ **Kein Reset, kein Backdoor.** Passphrase vergessen = Notizen weg.
> Lege ein Backup an (verschlüsselte `.notes`-Datei) und bewahre die Passphrase sicher auf.

## Was es kann

- **Notizen und Checklisten.** Eine Notiz ist freier Text (bis 100.000 Zeichen); eine Checkliste hat bis zu 200 Einträge mit Kästchen,
  „Erledigte nach unten“ und „Haken zurücksetzen“. Der Typ lässt sich umschalten — Zeilen werden Einträge und umgekehrt, mit Rückfrage,
  wenn dabei etwas gekürzt würde.
- **Kein Speichern-Knopf.** Die App speichert beim Tippen (nach 1,5 s Ruhe) und beim Verlassen der Notiz — verschlüsselt, jedes Mal
  die ganze Datei. Der Titel darf leer bleiben, dann dient die erste Zeile als Titel.
- **Markdown-Ansicht je Notiz** (Schalter, ab Werk aus): Überschriften (`#` bis `###`), **fett**, *kursiv*, Listen, Kästchen (`- [ ]`,
  `- [x]`), Code, Trennlinien. Eigene kleine Untermenge, kein Fremd-Renderer, kein HTML, Links bleiben bewusst reiner Text — die App hat
  ohnehin kein Netz. Ein Spickzettel im Editor zeigt „so tippen → so sieht es aus“ und fügt auf Wunsch eine Beispielnotiz ein.
- **Kategorien** wie Ordner (frei eintippen, Vorschläge aus vorhandenen, Filter-Chips über der Liste, umbenennen mit allen Notizen darin),
  **Favoriten**, **angeheftete** Notizen ganz oben, Chip „Offen“ für Checklisten mit unerledigten Einträgen, Suche über Titel, Text,
  Checklisten-Einträge und Kategorie. „Datum einfügen“ setzt Datum und Uhrzeit an den Cursor.
- **Umzug von Standard Notes** (seit 1.1): liest ein entschlüsseltes Standard-Notes-Backup — das heruntergeladene ZIP direkt oder die Textdatei
  daraus. Klartext-, Markdown-, Code-, Rich-Text- und Super-Notizen werden Notizen, Checklisten werden Checklisten, der erste Tag wird die
  Kategorie. Authenticator-Einträge (2FA), Spreadsheets und Dateien werden nie übernommen; ein zweiter Import legt keine Dubletten an.
- **Mehrere auf einmal** (seit 1.1): Notizen auswählen und gemeinsam in den Papierkorb legen (ein „Rückgängig“ für alle, höchstens 200 auf
  einmal), in eine Kategorie setzen oder als Favorit markieren.
- **„Rückgängig“ nach dem Löschen** (sechs Sekunden), **„Keine Vorschau“** je Notiz (die Liste zeigt nur den Titel), **drei Schriftgrößen**, und
  jede Rückfrage ist ein Dialog im App-Design — der Android-Systemdialog erbt den Screenshot-Schutz nicht (seit 1.1).
- **Kopieren** legt die ganze Notiz in die Zwischenablage; die App leert sie nach der eingestellten Zeit (ab Werk 30 s, abschaltbar) und beim
  Sperren. In der Android-App ist Kopiertes als **sensibel** markiert — die System-Vorschau zeigt den Inhalt nicht (Android 13+).
- **Sperre, lockerer als beim Passwort-Manager:** ab Werk keine Sperre nach Inaktivität und im Hintergrund erst nach 30 Minuten (beides
  einstellbar bis „nie“ bzw. „sofort“). Die Hintergrund-Sperre greift, wenn du nach der gewählten Zeit zurückkehrst; bis dahin bleibt der
  Schlüssel im Arbeitsspeicher. „Jetzt sperren“ löscht Schlüssel und alles Angezeigte sofort. Die Datei auf dem Gerät ist immer verschlüsselt.
  Bei „sofort“ sperrt die App auch, während der Datei-Picker offen ist; die gewählte Datei wird nach dem Entsperren importiert (seit 1.2).
- **Papierkorb**: Gelöschtes bleibt **30 Tage** wiederherstellbar, höchstens **200 Notizen** gleichzeitig; er zeigt nur Titel, Typ und
  Löschdatum, nie den Inhalt. „Endgültig löschen“ und „Papierkorb leeren“ vernichten sofort. Der Papierkorb ist gerätelokal: beim
  Zusammenführen wandert die Löschung auf die anderen Geräte, der Inhalt nicht.
- **Verschlüsseltes Backup** (`.notes`) und **Zusammenführen** zwischen Geräten: je Notiz gewinnt die neuere Änderung, Löschungen werden
  ein Jahr lang mitgeführt. Die Datei darf eine andere Passphrase haben. Sync z.B. über Syncthing, auch zwischen Handy und Linux-Desktop.
- **Aegis-Hürde** (optional): nach der Passphrase zusätzlich ein TOTP-Code aus Aegis — Schlüssel oder otpauth-Link zum Kopieren, kein QR.
  Ehrlich benannt als *Hürde*, nicht als zweiter Faktor (siehe Sicherheit).
- **Fingerabdruck-Entsperren** (optional, Android) wie bei Alien Pass, mit Passphrase-Pflicht nach jedem Neustart, sofern beim Aktivieren nicht
  „auch nach Neustart“ angekreuzt wird (ab Werk aus). **Schnell-Entsperren mit PIN** (optional, nur Desktop) nach einer Sperre.
- **Screenshots und App-Umschalter** (Android): ab Werk gesperrt (FLAG_SECURE), in den Einstellungen abschaltbar — Notizen sind nicht immer
  geheim. Gesperrt und beim Einrichten ist der Schutz immer an.
- **Deutsch / Englisch**, Handbuch in der App (`?`-Button), zwei Farbschemata.

## Sicherheit

- **Schlüsselableitung: Argon2id** (Standard 64 MiB, 3 Durchgänge, wählbar 32/64/128 MiB) — memory-hard,
  also teuer für GPU-Angriffe auf eine gestohlene Datei.
- **Verschlüsselung: AES-256-GCM** (native WebCrypto). Ein zufälliger Datenschlüssel (DEK) verschlüsselt die
  Notizen; die Passphrase verpackt nur diesen Schlüssel (KEK). Alle Kopfdaten der Datei (Version, Argon2-Parameter,
  Salt) sind als AAD mitauthentisiert — Manipulation fällt auf. Beim Passphrase-Wechsel wird auch der DEK erneuert.
- **Eigene Datei, eigene Schlüssel:** Dieselbe Formatfamilie wie Alien Pass, aber mit eigener Kennung `AINV1` und Endung `.notes`.
  Alien Pass weist eine Notizen-Datei ab und umgekehrt — die Apps teilen nie Schlüssel oder Slots, auch bei gleicher Passphrase.
- **Import-Grenzen**: Eine fremde `.notes`-Datei darf keine beliebigen Argon2-Parameter erzwingen (8–256 MiB, 1–16 Durchgänge,
  Arbeitsbudget), keine Übergröße, keine Fremdfelder. Alle Inhalte laufen durch eine Feld-Whitelist — auch die lokale Datei beim
  Entsperren. Höchstens 5.000 aktive Notizen; Löschmarken zählen nicht mit und werden auf 2.000 begrenzt. Der Papierkorb ist zusätzlich auf
  200 begrenzt, und eine fremde Datei kann darin nichts unterbringen (Papierkorb-Inhalt ist gerätelokal, eingelesene Löschungen kommen nur
  als inhaltsleere Löschmarke an). Einstellungen, Aegis-Schlüssel und Fingerabdruck-Slot werden nie importiert.
- **Dateigrenze 20 MB**, auch beim Speichern: Eine Änderung, die die Datei darüber wachsen ließe, wird mit Hinweis verworfen; verkleinern geht
  immer, und eine übergroße Datei bleibt zu öffnen (Lesegrenze 40 MB), damit man aufräumen kann.
- **Keine INTERNET-Permission**: Die Android-App fordert genau zwei normale Berechtigungen an, beide für den Fingerabdrucksensor:
  `USE_BIOMETRIC` und `USE_FINGERPRINT` (letztere nur bis Android 8.1, `maxSdkVersion=27`, mitgebracht von der AndroidX-Biometrie-Bibliothek).
  Kein Internet, keine Dateien, keine Kontakte. Dass sie nicht nach Hause funken *kann*, erzwingt das Betriebssystem — im Manifest der
  APK nachprüfbar (`aapt dump permissions`). Daneben steht dort nur eine von AndroidX automatisch erzeugte, selbst definierte Signatur-Berechtigung
  (`org.alieninvestor.notes.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`), die app-interne Broadcast-Empfänger nicht exportiert;
  sie gibt keiner anderen App Zugriff und erscheint nicht in den Android-Berechtigungen. Der Build bricht ab, sobald irgendeine andere Berechtigung auftaucht.
- **FLAG_SECURE, ehrlich beschrieben**: Android verweigert Screenshots der App; in Bildschirmaufnahmen und beim Übertragen auf andere Bildschirme
  bleibt sie schwarz, im App-Umschalter erscheint eine leere Karte. Abschaltbar in den Einstellungen; gesperrt und beim Einrichten immer an.
  Kein Schutz vor Bedienungshilfen-Apps, Root oder einer Kamera.
  **allowBackup=false** verhindert ADB- und Cloud-Backups; **data_extraction_rules.xml** schließt zusätzlich den
  Gerät-zu-Gerät-Transfer aus. Backups machst nur du selbst über die verschlüsselte `.notes`-Datei.
- **Notizen als Datei im privaten App-Ordner** (Android: `files/alien-notes/notes.ainv`, Desktop: `~/.var/app/…/notes.ainv`), atomar
  geschrieben (Temp-Datei, fsync, Umbenennen, Größe nachgeprüft) — ein Absturz hinterlässt nie eine halbe Datei. Der Browser-Speicher der
  WebView wird nicht mehr genutzt; seine Grenze lag bei rund 5 MB.
- **Content-Security-Policy** mit `connect-src 'none'` und ohne `unsafe-inline`: kein Netz, kein Inline-Script. `'wasm-unsafe-eval'` ist
  der einzige Zusatz — Chromium verlangt den Token für jede WebAssembly-Kompilierung (Argon2); er erlaubt ausschließlich WASM, kein String-Eval.
- **Markdown ohne Angriffsfläche:** Die Ansicht entsteht ausschließlich über `createElement`/`textContent` — kein `innerHTML`, kein HTML aus
  Notizen, keine Links, keine Bilder. Der Parser ist eigener, kleiner Code mit linearer Laufzeit (eine Laufzeitfalle in der
  Überschriften-Erkennung wurde im internen Audit gefunden und behoben).
- **Sperre**: Schlüssel und alle Anzeigen werden aus dem Speicher entfernt; jede Sperre wartet vorher einen laufenden Speichervorgang ab.
  Nach Fehlversuchen greift eine Wartezeit. Nativer Code beschränkt sich auf vier kleine, im Repo im Klartext einsehbare Stücke: FLAG_SECURE,
  Zwischenablage-Plugin, Fingerabdruck-Plugin und Dateispeicher (alle als Quelltext in `patch-hardening.mjs`; der Vendor-Hash-Check steht in
  `build-www.sh`, ebenfalls Klartext).
- **Fingerabdruck-Entsperren, Aegis-Hürde, PIN am Desktop:** wortgleich aus Alien Pass übernommen und dort ausführlich eingeordnet — siehe das
  [Alien-Pass-README](https://codeberg.org/Alien-Investor/alien-pass#sicherheit). Kurz: Der Fingerabdruck-Slot liegt außerhalb der Datei im
  Android-Keystore und verlangt nach Neustart, Passphrase-Wechsel und neuem Fingerabdruck die Passphrase; die Aegis-Hürde hilft gegen jemanden,
  der die Passphrase abgeschaut hat und das entsperrte Handy hält, ist aber kein zweiter Faktor; die Desktop-PIN schützt nur eine Schlüsselkopie
  im Arbeitsspeicher, höchstens 24 Stunden.
- **Fremdcode**: nur die Argon2-Bibliothek [hash-wasm](https://github.com/Daninet/hash-wasm) (MIT, v4.12.0)
  und die [EFF-Wortliste](https://www.eff.org/dice) (CC BY 3.0) — beide gebündelt, der Build prüft ihre SHA-256-Hashes und dass die
  Bibliothek weder `eval` noch Netzzugriffe enthält.
- **Desktop-Fassung (Linux), ehrlich eingeordnet:** Kein Netz, vom System erzwungen (Flatpak ohne Netzwerk-Berechtigung, zusätzlich
  CSP, Anfrage-Filter und WebRTC ins Leere); keine Dateien außer über den Dateidialog des Systems; Chromium-Sandbox über Flatpaks Käfig,
  Renderer ohne Node, Electron-Fuses, keine Fernsteuerung, keine DevTools. Grenzen: eigene Browser-Engine (Electron 44, Updates nur mit neuer
  App-Version), **kein Schutz vor Bildschirmfotos**, unter X11 kann jedes Programm Tastatur und Zwischenablage mitlesen, **bei Bildschirmsperre
  und Ruhezustand sperrt die App nicht von selbst** (Strg+L sperrt sofort), kein Fingerabdruck.
- **Interner Audit** (24.09.2026, Skill-gestützt mit mehreren Prüfern, kein unabhängiges Audit) über die gegenüber Alien Pass neue Fläche:
  Editor und Autosave, Sanitizer und Import, Markdown-Renderer, gelockerte Sperre, FLAG_SECURE-Schalter, Android-Plugins und Build. Ergebnis:
  keine Klartext-Lecks, keine Injektion; sieben Funde niedriger Schwere (Wettläufe zwischen Autosave und Sperre, Import bei offenem Editor,
  Laufzeitfalle im Markdown-Parser, unehrliche Rückfragen beim Typwechsel) und ein Hinweis, alle vor dem Release behoben. Ein Nachlauf
  prüfte den danach eingebauten Dateispeicher und die 20-MB-Schreibgrenze: ein Fund (die Toleranz der Grenze wanderte mit und ließ kleine
  Schreibvorgänge die Datei schrittweise über die Lesegrenze treiben), ebenfalls vor dem Release behoben. **Zweiter interner Audit** (25./26.09.2026,
  vor 1.1) über die neue Fläche: Standard-Notes-Import samt ZIP-Leser, Rückfrage-Dialog, Rückgängig, Mehrfachauswahl. Ergebnis: kein Weg vom
  fremden Backup in Markup, Skript oder Prototyp; fünf Funde ohne Fremdakteur (zwei mittlerer Schwere: ein seit 0.1 bestehender Wettlauf beim
  Speichern auf Android, der eine Änderung still verlieren konnte, und ein Rückgängig-Weg über die 5.000er-Grenze, der die Datei aussperrte; drei
  niedriger Schwere rund um die Mehrfachauswahl und das Löschen während des Autosaves), alle vor dem Release behoben und mit Regressionstests belegt.
- **Grenzen, ehrlich benannt**: Im Hintergrund leert die Android-App die Zwischenablage nur, solange Android sie nicht eingefroren hat
  (meist nach dem zweiten App-Wechsel); danach erst beim Zurückkehren. Ab Android 13 leert das System nach etwa 1 h selbst, davor nicht.
  Die Tastatur lernt aus dem Getippten (eine WebView kann das nicht abschalten) — wer das nicht will, nutzt eine Tastatur ohne
  personalisiertes Lernen. Mit „nie“ als Hintergrund-Sperre bleibt der Schlüssel im Arbeitsspeicher, bis das System den Prozess beendet.

## Dateiformat

```
{ magic:"AINV1", ver:1,
  kdf:{name:"argon2id", m, t, p, salt},
  wrap:{iv, ct},      // Datenschlüssel, verpackt mit dem Passphrase-Schlüssel
  body:{iv, ct} }     // Notizen, verschlüsselt mit dem Datenschlüssel
```

Zusatzdaten (AAD) für beide Teile: `AINV1|1|argon2id|m|t|p|salt|rolle` — eine veränderte Kopfzeile lässt die Entschlüsselung scheitern.
Jede Notiz trägt `id`, `type` (text|list), `cat`, `title`, `body` oder `items`, `fav`, `pinned`, `md`, `created`, `updated`, `deleted`.

## Open Source & selbst prüfen

Der komplette **Client-Code ist offen** ([MIT](LICENSE)): `index.html` (UI), `app.js` (App + Krypto), `app-theme.css`, `icon.svg`, `vendor/`.
Die Desktop-Hülle liegt vollständig in `desktop/` (Hauptprozess, Brücke, Build-Skript mit gepinntem Electron-Hash, Flatpak-Manifest).

- **Kein Nach-Hause-Telefonieren:** keine `fetch`/`XMLHttpRequest`/WebSocket-Aufrufe, keine externen Skripte, keine CDNs.
  Einzige externe URL ist der Spenden-Link im Footer.
- `node roundtrip-test.mjs` prüft Dateiformat, Schlüsselhierarchie, Sanitizer, Merge, Papierkorb und den Markdown-Parser direkt am
  Quelltext der App — ohne Browser.
- Der Build (`build-www.sh`, `patch-hardening.mjs`) bricht ab, wenn `app.js` Netz-, Eval- oder HTML-Senken enthält, wenn eine Berechtigung
  dazukommt oder eines der vier nativen Plugins in der APK fehlt.

## Lizenz

MIT — siehe [LICENSE](LICENSE).
