# Changelog — Alien Notes

## v1.7 — 2026-10-03

Kleine Verbesserungen an der Linux-Desktop-Fassung, nachgezogen aus Alien Pass 1.18. Am Datei-Format, an der Verschlüsselung und an deinen
Notizen ändert sich nichts.
- **Desktop — Tab ins Passphrase-Feld:** Springt man mit Tab in ein gefülltes Passphrase-Feld, markiert der Browser den Inhalt, und unter X11
  landet er in der Auswahl für den Mittelklick. Die App meldet das jetzt der Hülle (auch bei gehaltener Tab-Taste oder sofortigem Weitertippen),
  die die Auswahl wie bei der Maus mit der Kopier-Frist bzw. beim Sperren wieder löscht.
- **Desktop — markierte Passphrase nach einem Klick:** War eine Passphrase im Feld markiert und klickte man danach woanders hin, zum Beispiel auf
  „Einstellungen“, blieb sie in der Mittelklick-Auswahl liegen: Weder die Kopier-Frist noch das Sperren löschten sie. Jetzt wird sie wie vorgesehen
  gelöscht. Strg+C auf einer solchen Markierung läuft weiter über die geschützte Zwischenablage.
- **Desktop — lange Notizen:** Notizen über 20.000 Zeichen ließen sich am Desktop nicht kopieren, und war eine solche Notiz markiert, blieb sie
  nach dem Sperren in der Mittelklick-Auswahl. Beides geht jetzt bis zur vollen Notizlänge.
- **Desktop — Markieren und sofort sperren:** Wer etwas markierte und direkt danach „Jetzt sperren“ klickte, ließ die Markierung bis zum Ende der
  Kopier-Frist stehen. Sie wird jetzt beim Sperren gelöscht.
- **Desktop — Spendenlink:** Nach einem Zurückstellen der Systemuhr blieb der Link bis zur alten Uhrzeit wirkungslos. Die Sperre gegen eine
  Link-Flut misst jetzt mit einer Uhr, die nicht zurückspringt.

## v1.6 — 2026-10-03

Vor allem für die Linux-Desktop-Fassung. Am Datei-Format, an der Verschlüsselung und an deinen Notizen ändert sich nichts.
- **Desktop:** Die Scrollbalken sind jetzt schmal und in Neon-Farbe statt in Grau — an der Seite, im Handbuch, in der Editor-Spalte und
  in jeder anderen scrollbaren Fläche, in beiden Darstellungen.
- **Desktop, behoben:** Der Link „Energie aufladen · Spenden“ im Fuß tat in der Desktop-App nichts. Er öffnet jetzt die Spendenseite im
  Standard-Browser des Systems (auf Englisch die englische Seite). Die App öffnet nach außen nur genau diese beiden Adressen, alle anderen
  Links und Weiterleitungen bleiben gesperrt.
- **Desktop, behoben:** Ein Klick auf das Auge im Passphrase-Feld setzte den Cursor an den Anfang — wer weitertippte, schrieb an die falsche Stelle.
  Der Cursor bleibt jetzt stehen, wo er war.
- **Standard-Notes-Import, behoben:** Eine Notiz, deren Text nur aus unsichtbaren Steuerzeichen bestand, kam als leere, unsichtbare Notiz an.
  Sie wird jetzt übersprungen und in der Import-Meldung unter „sonstige Elemente“ mitgezählt. Ein Titel, vor dem viele unsichtbare Zeichen
  stehen, geht nicht mehr verloren.
- Desktop-App mit der aktuellen Browser-Engine (Electron 44.5.1).

## v1.5 — 2026-09-26

Härtung ohne Änderung an Oberfläche, Datei-Format oder Notizen, nachgezogen aus Alien Pass 1.14/1.15.
- **Behoben:** Seit 1.4 bekommt die WebView keinen Autofill-Manager mehr. Android versucht aber beim Schließen einer App, eine unterbrochene
  Autofill-Speichern-Abfrage wiederherzustellen, wenn die App mit bestimmten Zusatzdaten gestartet wurde — und rechnet dabei fest mit einem
  Manager. Jede andere App hätte Alien Notes mit diesen Zusatzdaten öffnen und beim Schließen abstürzen lassen können. Die App entfernt sie
  jetzt beim Start, bevor Android sie liest. Der Bauvorgang prüft zusätzlich an der fertigen APK, dass alle Autofill-Riegel im Programmcode stecken.
- **Import:** Wird die App gesperrt und gleich wieder entsperrt, während eine gewählte Datei noch gelesen, entpackt oder entschlüsselt wird,
  verwirft sie diesen Import, statt ihn in die neue Sitzung zu tragen. Wird sie nur gesperrt, läuft der Import wie seit 1.2 nach dem Entsperren
  weiter (jetzt auch, wenn die Sperre beim Entpacken eines Standard-Notes-ZIPs kam). Eine neu eingerichtete Notizen-Datei übernimmt keine
  vorher gewählte Datei. Handbuch: beim `.notes`-Backup folgt nach dem Entsperren die Passphrase-Abfrage der Datei.

## v1.4 — 2026-09-26

Härtung ohne Änderung an Oberfläche, Datei-Format oder Notizen, nachgezogen aus Alien Pass 1.12.
- **Neu:** Die App nimmt ihre Felder vom Android-Autofill-Framework aus. Bisher meldete die WebView jedes Passwortfeld an den systemweiten
  Autofill-Dienst — ist dort ein Passwort-Manager eingerichtet, bot er sich in den Passphrase-Feldern von Alien Notes an und konnte anbieten,
  die Passphrase zu speichern. Das Attribut `autocomplete="off"` im HTML hält das nicht auf, darum jetzt nativ: Die App gibt der WebView keinen
  Autofill-Manager mehr (Quelltext wie bisher in `patch-hardening.mjs`). Alien Notes hat weiterhin keinen eigenen Autofill-Dienst.

## v1.3 — 2026-09-26

Kleine Korrektur aus dem Alltag, nachgezogen aus Alien Pass 1.11. Am Datei-Format, an der Verschlüsselung und an deinen Notizen ändert sich nichts.
- **Behoben:** Stand „Sperren im Hintergrund“ auf „sofort“, ließ sich eine kopierte Notiz nie in eine andere App einfügen — der App-Wechsel
  sperrte Alien Notes und leerte dabei sofort die Zwischenablage. Jetzt bleibt das Kopierte bei der Sofort-Sperre bis zum Ablauf der eingestellten
  Zeit stehen (ab Werk 30 s) und wird wie bisher auch im Hintergrund gelöscht. Der Schlüssel im Speicher geht weiterhin sofort weg. Steht
  „Zwischenablage leeren“ auf „nur beim Sperren“, leert die Sperre wie bisher sofort. Handbuch entsprechend ergänzt.
- **Nachgereicht zum Import nach dem Entsperren (1.2):** Der gemerkte Dateiverweis verfällt auch dann nach fünf Minuten, wenn die Uhr zwischendurch
  zurückgestellt wurde. Eine nach der Wahl geänderte Datei meldet „Datei konnte nicht gelesen werden.“ statt still zu verschwinden.

## v1.2 — 2026-09-26

Gerätetest-Fund aus Alien Pass, hier nachgezogen: Bei „Sperren im Hintergrund: sofort“ war der Import unmöglich. Der Datei-Picker ist eine
eigene Android-Ansicht, die App sperrte beim Öffnen und verwarf die gewählte Datei still. Jetzt merkt sie sich die Datei (nur den Verweis,
gelesen wird nichts, solange die App zu ist), zeigt auf dem Sperrbildschirm „Datei gewählt — zum Importieren entsperren“ und setzt den Import
nach dem Entsperren mit genau dieser Datei fort — im Sicherung-Tab, für `.notes`-Backups (dann mit der Passphrase-Abfrage der Datei) wie für
Standard-Notes-Backups. Der Verweis verfällt nach fünf Minuten ohne Entsperren (dann sagt es ein Hinweis). Die Sperre selbst bleibt, wie sie ist: Bei „sofort“ liegt
kein Schlüssel im Speicher, während die App im Hintergrund ist.
Aus der internen Review dieser Änderung: Kam eine Sperre, während eine gerade gewählte Datei noch gelesen wurde (etwa „Jetzt sperren“), zeigte die
gesperrte App bisher das Passphrase-Feld der Datei oder ließ ein Standard-Notes-Backup still fallen — beides wird jetzt ebenfalls nach dem Entsperren nachgeholt.

## v1.1 — 2026-09-26

Rückfragen (Löschen und endgültig Löschen, Papierkorb leeren, Umwandeln, Haken zurücksetzen, schwache Passphrase, Import-Datei mit hohem
Argon2-Speicherbedarf, Pforten deaktivieren, Notizen löschen, Standard-Notes-Import) erscheinen als eigener Dialog im App-Design statt als Systemdialog. Grund: Der Android-Systemdialog erbt den
Screenshot-Schutz (FLAG_SECURE) nicht, ein Screenshot bei offener Löschnachfrage zeigte den Notiztitel. Der eigene Dialog hat je Frage
einen passenden Knopf („In den Papierkorb“, „Endgültig löschen“, „Umwandeln“ …), Escape oder ein Tipp daneben bricht ab, eine Sperre während
der Frage lässt die Antwort verfallen.

Umzug von Standard Notes: Unter „Sicherung“ liest die App ein entschlüsseltes Standard-Notes-Backup, wahlweise direkt das heruntergeladene
ZIP (entpackt wird nur die Backup-Datei darin, mit dem Entpacker des Systems, ohne Fremdcode) oder die Textdatei daraus. Klartext-, Markdown-, Code- und
Rich-Text-Notizen werden Textnotizen, Super-Notizen werden in die Markdown-Untermenge übersetzt (Tabellen als Textzeilen, Bilder als
Platzhalter), Checklisten werden Checklisten; der erste Tag wird die Kategorie, Angeheftetes bleibt angeheftet, Sterne werden Favoriten,
der Papierkorb landet im Papierkorb, soweit dort Platz ist (frische 30-Tage-Frist). Authenticator-Einträge (2FA-Geheimnisse), Spreadsheet-Notizen
und Datei-Anhänge werden nie übernommen und in der Rückfrage gezählt. Ein zweiter Import derselben Datei legt keine Dubletten an. Das Handbuch beschreibt den Weg und mahnt, das
entschlüsselte Backup danach zu löschen.

Rückgängig nach dem Löschen: Nach „In den Papierkorb“ bleibt sechs Sekunden ein Knopf „Rückgängig“ im Hinweis, der die Notiz sofort zurückholt.

Kategorie umbenennen: Kategorie-Chip antippen, dann den Stift daneben — alle Notizen der Kategorie ziehen um, auch im Papierkorb; ein vorhandener
Name legt zusammen, ein leerer Name heißt „ohne Kategorie“. Die Rückfrage dafür hat ein Eingabefeld im App-Design (kein Systemdialog).

Chip „☐ Offen“: zeigt nur Checklisten mit unerledigten Einträgen, kombinierbar mit einer Kategorie; erscheint nur, wenn es solche gibt.

„Keine Vorschau“ je Notiz: ein Kästchen im Editor lässt die Liste nur den Titel zeigen — gegen Mitleser über die Schulter. Die Suche findet
den Inhalt weiterhin. Neues Feld im Datei-Format (ältere Fassungen lesen die Datei weiter, das Feld fällt dort weg).

Schriftgröße: drei Stufen unter Einstellungen → Darstellung (Normal, Groß, Sehr groß), gilt für das Gerät wie die Darstellung selbst.

Mehrere Notizen auf einmal: der ☑-Knopf neben dem Papierkorb blendet Kästchen ein; gewählte Notizen lassen sich gemeinsam in den Papierkorb legen
(ein „Rückgängig“ für alle, höchstens 200 auf einmal — so viele fasst der Papierkorb), in eine Kategorie setzen oder als Favorit markieren.
Suche und Chips wirken dabei weiter, „Alle“ nimmt die gezeigten; bereits gewählte bleiben gewählt, auch wenn ein Filter sie ausblendet.

Behoben (Audit-Nachlauf): Auf Android konnte eine Änderung still verloren gehen, wenn sie in das Zeitfenster eines gerade laufenden Speicherns fiel
(seit 0.1; die letzte Eingabe fehlte nach dem Neustart, eine bestätigte Löschung tauchte wieder auf). „Rückgängig“ nach einer Massenlöschung hält jetzt die
Grenze von 5.000 Notizen ein (sonst ließ sich die Datei nicht mehr öffnen). Löschen direkt nach dem Tippen meldete in seltenen Fällen Erfolg, ohne zu
löschen. „Alle“ bei leerer Trefferliste wählte unsichtbare Notizen. Im Standard-Notes-Import werden Authenticator-Einträge auch bei alten Konten ohne
Typangabe erkannt (Zuordnung über die Erweiterung), „Angeheftet“ wird an beiden Stellen des Backups gelesen, und ein Backup-Eintrag unterhalb von
„Items/“ im ZIP zählt nicht mehr als Backup-Datei.

## v0.1 — 2026-09-24

Grundgerüst aus Alien Pass v1.8: Repo, App-Design-Kit, Datei-Format `AINV1` (Argon2id + AES-256-GCM, eigene Datei-Endung `.notes`),
Sanitizer für Notizen und Checklisten, Merge, Papierkorb, Format-Test.
Oberfläche: Setup und Sperre, Liste mit Suche, Kategorie- und Favoriten-Chips, angeheftete Notizen, Editor mit Autosave (Titel darf leer
bleiben), Checklisten mit Umwandlung Text ↔ Liste, Markdown-Ansicht je Notiz (eigene kleine Untermenge, Links nur als Text), Papierkorb,
Backup als `.notes` (Export/Import = Zusammenführen), Einstellungen (Sperren mit Stufe „nie“, Zwischenablage, Passphrase, Darstellung).
Pforten: Aegis-Hürde (Schlüssel/otpauth-Link kopieren, kein QR), Fingerabdruck-Entsperren mit „auch nach Neustart“ (wie Alien Pass v1.8),
Schalter für Screenshots/App-Umschalter-Vorschau (FLAG_SECURE ab Werk an, abschaltbar). Android-Build-Pipeline mit Härtung und eigenem Icon.
Linux-Desktop: Electron im Flatpak ohne Netz und Dateisystem (wie Alien Pass), Notizen als Datei, Backup über den Systemdialog, Zwischenablage
mit KDE-Hinweis, zweispaltig Liste und Notiz ab 1000 px, Strg+N/F/L, Schnell-Entsperren per PIN bis zum Beenden. Jede Sperre sichert vorher den
Editor-Stand.
Kleine Helfer im Editor: Markdown-Spickzettel mit „Beispiel einfügen“, „Datum einfügen“, „Haken zurücksetzen“, Strg+S am Desktop.
Interner Audit run-1 (24.09.2026, sieben LOW, ein INFO, alle behoben): Sperre wartet laufende Speichervorgänge ab, gleichzeitige Schreibvorgänge
gehen nicht mehr verloren, Import schließt einen offenen Editor, Öffnen ohne Änderung schreibt nichts, Markdown-Überschriften ohne
Laufzeitfalle, Typwechsel warnt vor Kürzung. Faktencheck der Texte: Sperr-Hinweis, FLAG_SECURE-Karte, Berechtigungen, Zwischenablage präzisiert.
Android speichert die Notizen-Datei im privaten App-Ordner statt im Browser-Speicher der WebView (dessen Grenze lag bei rund 5 MB); bestehende
Notizen werden beim ersten Start übernommen. Die 20-MB-Grenze gilt jetzt auch beim Speichern und Zusammenführen (vorher konnte die App eine
Datei schreiben, die sie danach nicht mehr öffnete); eine übergroße Datei lässt sich weiter öffnen und durch Löschen verkleinern. Audit-Nachlauf
über Dateispeicher und Schreibgrenze (ein Fund, behoben: die Toleranz der Grenze gilt jetzt gegenüber der Größe beim Entsperren, nicht je Schreibvorgang).
