# Alien Notes

Lokale, verschlüsselte **Notizen- und Checklisten-App** für Android / GrapheneOS und den **Linux-Desktop** (Flatpak).
Läuft komplett **offline** — keine Cloud, kein Server, kein Konto, keine Telemetrie.
Die Android-App fordert **keine Internet-Berechtigung** an — nur die beiden Berechtigungen für den Fingerabdrucksensor.
Deine Notizen verlassen das Gerät nie im Klartext.

Schwester-App von [Alien Pass](https://codeberg.org/Alien-Investor/alien-pass) und dem
[Sachwert-Tresor](https://codeberg.org/Alien-Investor/sachwert-tresor) — gleiche Architektur, gleiche Härtung, gleicher Alien-Investor-Stil.

> **Stand:** in Entwicklung, noch kein Release. Dieses README wird mit dem ersten Release vervollständigt.

## Was es werden soll

- Notizen (Freitext) und Checklisten, Kategorien, Favoriten, angepinnte Einträge, Suche
- Umschaltbare Markdown-Ansicht je Notiz (kleine eigene Untermenge, kein Fremd-Renderer)
- Verschlüsselt mit demselben Schlüsselbau wie Alien Pass: Argon2id leitet aus der Passphrase einen Schlüssel ab, der den
  eigentlichen Datenschlüssel verpackt; alles AES-256-GCM mit gebundenem Kopf
- Entsperren per Passphrase, Fingerabdruck (Android; wahlweise auch über einen Neustart hinaus, ab Werk aus) oder PIN (Desktop), optionale Aegis-Hürde
- Backup als verschlüsselte `.notes`-Datei; Import = Zusammenführen (pro Eintrag gewinnt die neuere Änderung)
- Papierkorb (30 Tage, gerätelokal), Sperre lockerer als beim Passwort-Manager und einstellbar

## Dateiformat

Dieselbe Formatfamilie wie Alien Pass, aber eine **eigene Datei**: Kennung `AINV1` statt `AIPV1`, Endung `.notes`.
Alien Pass weist eine Notizen-Datei ab und umgekehrt — die Apps teilen nie Schlüssel oder Slots, auch wenn du dieselbe Passphrase wählst.

```
{ magic:"AINV1", ver:1,
  kdf:{name:"argon2id", m, t, p, salt},
  wrap:{iv, ct},      // Datenschlüssel, verpackt mit dem Passphrase-Schlüssel
  body:{iv, ct} }     // Notizen, verschlüsselt mit dem Datenschlüssel
```

Zusatzdaten (AAD) für beide Teile: `AINV1|1|argon2id|m|t|p|salt|rolle` — eine veränderte Kopfzeile lässt die Entschlüsselung scheitern.

## Open Source & selbst prüfen

Der gesamte Client-Code (`index.html`, `app.js`, `app-theme.css`, `vendor/`) liegt im Klartext in diesem Repo.
`node roundtrip-test.mjs` prüft das Dateiformat, die Schlüsselhierarchie, den Sanitizer und den Merge direkt am Quelltext der App.

## Lizenz

MIT — siehe [LICENSE](LICENSE).
