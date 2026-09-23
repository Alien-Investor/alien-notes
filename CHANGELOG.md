# Changelog — Alien Notes

## v0.1 — in Arbeit (Start 24.09.2026)

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
