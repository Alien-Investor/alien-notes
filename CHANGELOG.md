# Changelog — Alien Notes

## v1.1 — in Arbeit

Rückfragen (Löschen, Papierkorb leeren, Umwandeln, Haken zurücksetzen, schwache Passphrase, große Import-Datei, Pforten deaktivieren,
Notizen löschen) erscheinen als eigener Dialog im App-Design statt als Systemdialog. Grund: Der Android-Systemdialog erbt den
Screenshot-Schutz (FLAG_SECURE) nicht, ein Screenshot bei offener Löschnachfrage zeigte den Notiztitel. Der eigene Dialog hat je Frage
einen passenden Knopf („In den Papierkorb“, „Endgültig löschen“, „Umwandeln“ …), Escape oder ein Tipp daneben bricht ab, eine Sperre während
der Frage lässt die Antwort verfallen.

Umzug von Standard Notes: Unter „Sicherung“ liest die App ein entschlüsseltes Standard-Notes-Backup, wahlweise direkt das heruntergeladene
ZIP (entpackt wird nur die Backup-Datei darin, mit dem Entpacker des Systems, ohne Fremdcode) oder die Textdatei daraus. Klartext-, Markdown-, Code- und
Rich-Text-Notizen werden Textnotizen, Super-Notizen werden in die Markdown-Untermenge übersetzt (Tabellen als Textzeilen, Bilder als
Platzhalter), Checklisten werden Checklisten; der erste Tag wird die Kategorie, Angeheftetes bleibt angeheftet, Sterne werden Favoriten,
der Papierkorb landet im Papierkorb. Authenticator-Einträge (2FA-Geheimnisse), Tabellen und Dateien werden nie übernommen und in der
Rückfrage genannt. Ein zweiter Import derselben Datei legt keine Dubletten an. Das Handbuch beschreibt den Weg und mahnt, das
entschlüsselte Backup danach zu löschen.

Rückgängig nach dem Löschen: Nach „In den Papierkorb“ bleibt sechs Sekunden ein Knopf „Rückgängig“ im Hinweis, der die Notiz sofort zurückholt.

Kategorie umbenennen: Kategorie-Chip antippen, dann den Stift daneben — alle Notizen der Kategorie ziehen um, auch im Papierkorb; ein vorhandener
Name legt zusammen, ein leerer Name heißt „ohne Kategorie“. Die Rückfrage dafür hat ein Eingabefeld im App-Design (kein Systemdialog).

Chip „☐ Offen“: zeigt nur Checklisten mit unerledigten Einträgen, kombinierbar mit einer Kategorie; erscheint nur, wenn es solche gibt.

„Keine Vorschau“ je Notiz: ein Kästchen im Editor lässt die Liste nur den Titel zeigen — gegen Mitleser über die Schulter. Die Suche findet
den Inhalt weiterhin. Neues Feld im Datei-Format (ältere Fassungen lesen die Datei weiter, das Feld fällt dort weg).

Schriftgröße: drei Stufen unter Einstellungen → Darstellung (Normal, Groß, Sehr groß), gilt für das Gerät wie die Darstellung selbst.

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
