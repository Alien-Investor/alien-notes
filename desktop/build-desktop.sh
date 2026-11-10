#!/usr/bin/env bash
# Alien Notes Desktop bauen: www/ (Vendor-Hashes wie bei der APK) → Electron (Version + Hash gepinnt) → app.asar + Fuses
# → Flatpak ohne Netz, als User-Installation. Kein sudo, keine npm-Installationsskripte.
set -euo pipefail
cd "$(dirname "$0")"
# Release-Sperre (v1.14 run-12 c-2; seit v1.15 wie Alien Pass v1.24, Querfund Pass v1.23 run-13 R5/R6, dort aus Steuertool v1.5 run-2 #4): alte Prüfdatei
# ZUERST weg — ein abgebrochener Lauf hinterlässt keine gültige. make-release.sh lädt nur ein Bundle mit passender bundle.ok hoch.
rm -f build/release/bundle.ok
# Gebaut wird aus einem PRIVATEN Abbild von HEAD (git worktree), nie aus dem gemeinsamen Arbeitsbaum (v1.15, Steuertool run-2 #4 über Pass run-13 R6): dort
# liefen build-www.sh, cp ../www, node pack.mjs und flatpak-builder minutenlang — eine zweite Sitzung, die eine Datei ändert und zurückstellt (auch
# „git stash … git stash pop“), bekam ein Bundle mit fremdem Inhalt. Darum: sauberer Stand verlangt, Abbild unter ~/.cache (der Builder sieht nur ~/).
# git-crypt: erst ohne Checkout anlegen, dann den Schlüssel des Repos VERLINKEN (nie kopieren, nie ausgeben), dann auschecken — die Desktop-Quellen
# sind Klartext, ohne Schlüssel (fremder Klon) geht es genauso. Ohne Git (Selbstbau aus einem Archiv) wird wie bisher im Ordner gebaut, kein Release-Build.
# Diese Datei bleibt Klartext und sourct das verschlüsselte release-quellen.sh bewusst nicht: Liste und Prüfungen stehen hier selbst.
REPO="$(cd .. && pwd)"
# Quellen des Bundles (Pfade relativ zum Projekt; dazu ganz vendor/). Liste wortgleich `feste_quellen desktop` in release-quellen.sh — weicht sie ab, bricht
# make-release.sh ab. Steht hier oben (Pass run-13 r2c-4): die Prüfung auf nicht versionierte Eingaben unten nimmt genau diese Liste. Zwischen DESK_SRC und
# desk_summen nur Kommentare (Prüfhelfer schneiden genau diesen Bereich aus). Seit v1.15 ganz vendor/ statt einzelner Dateien (auch eff_large_wordlist.txt,
# gegen die build-www.sh die .js prüft).
DESK_SRC="VERSION index.html app.js app-theme.css icon.svg build-www.sh assets/icon-only.png desktop/main.js desktop/preload.js desktop/atomic.js desktop/pack.mjs
  desktop/build-desktop.sh desktop/package.json desktop/package-lock.json desktop/flatpak/alien-notes.sh desktop/flatpak/org.alieninvestor.notes.desktop
  desktop/flatpak/org.alieninvestor.notes.yml"
desk_summen() { (cd .. && { printf '%s\n' $DESK_SRC; find vendor -type f; } | LC_ALL=C sort | xargs -d '\n' sha256sum --); }   # cwd = desktop/
# Gibt es ein Git-Verzeichnis, aber git scheitert (kein git im PATH, verbogenes GIT_DIR …), wird NICHT still im gemeinsamen Ordner gebaut (Pass run-13 c-5:
# genau der Fall, den das Abbild schließt) — Selbstbau ohne Git nur, wenn es wirklich kein Repo ist
if [ "${NOTES_IM_ABBILD:-}" != 1 ] && [ -e "$REPO/.git" ] && ! git -C "$REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "FEHLER: $REPO/.git vorhanden, aber git rev-parse scheitert (git im PATH? GIT_DIR?) — kein Bau im gemeinsamen Ordner." >&2; exit 1
fi
if [ "${NOTES_IM_ABBILD:-}" != 1 ] && git -C "$REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  [ -z "$(git -C "$REPO" status --porcelain --untracked-files=no)" ] || { echo "FEHLER: nicht committete Änderungen — gebaut wird HEAD, erst committen." >&2; exit 1; }
  # Nicht versionierte Eingaben fehlten im Abbild STILL (Pass run-13 c-7); gitignorierte Build-Ordner zeigt git status nicht. Genau die Eingaben DIESES
  # Builds (DESK_SRC + vendor/, Pass r2c-4): vom Rest unter assets/ liest er nur icon-only.png, desktop/test/ gar nicht — eine nicht versionierte
  # Datei dort blockierte ihn sonst mit falscher Begründung. Eine neue path:-Quelle im Manifest muss ohnehin in DESK_SRC stehen (Prüfung unten).
  ST="$(git -C "$REPO" status --porcelain --untracked-files=all -- vendor $DESK_SRC)"
  NV="$(grep '^?? ' <<<"$ST" || true)"
  [ -z "$NV" ] || { echo "FEHLER: nicht versionierte Dateien unter den Quellen — sie fehlten im Abbild von HEAD (erst committen oder entfernen):" >&2; echo "$NV" >&2; exit 1; }
  # Reste abgebrochener Läufe (Pass run-13 c-9): nach SIGKILL/Absturz läuft der trap nicht — Abbild-Ordner und Worktree-Einträge (mit dem verlinkten
  # git-crypt-Schlüssel) blieben still liegen. Melden und abbrechen, nie selbst löschen; ein laufender Build (Prozess aus .lauf lebt, gleiche Startzeit) ist kein Rest.
  AB="$HOME/.cache/alien-notes-abbild"
  lebt() { local p s; [ -f "$1/.lauf" ] && read -r p s < "$1/.lauf" || return 1; [ -n "$s" ] && [ "$(awk '{print $22}' "/proc/$p/stat" 2>/dev/null)" = "$s" ]; }
  RM=""; WT=""
  for d in "$AB"/apk.* "$AB"/desktop.*; do [ -e "$d" ] || [ -L "$d" ] || continue; lebt "$d" || RM+="  rm -rf '$d'"$'\n'; done
  WTL="$(git -C "$REPO" worktree list --porcelain)"
  while read -r w; do [ -n "$w" ] || continue; d="$(dirname "$w")"; if [ -d "$w" ] && ! lebt "$d"; then WT+="  git -C '$REPO' worktree remove --force '$w'"$'\n'; fi
    [ -d "$w" ] || WT+="  (verwaister Eintrag $w)"$'\n'; done < <(awk -v ab="$AB/" 'index($0, "worktree " ab) == 1 {print substr($0, 10)}' <<<"$WTL")
  [ -z "$RM$WT" ] || { { echo "FEHLER: Reste eines abgebrochenen Builds unter $AB (entschlüsselte Quellen / Worktree mit verlinktem git-crypt-Schlüssel)."
    echo "  Erst sicherstellen, dass kein Build mehr läuft, dann von Hand entfernen (in dieser Reihenfolge) und neu starten:"; printf '%s%s' "$WT" "$RM"
    echo "  git -C '$REPO' worktree prune"; } >&2; exit 1; }
  mkdir -p "$AB"; ABB="$(mktemp -d "$AB/desktop.XXXXXX")"; echo "$$ $(awk '{print $22}' /proc/$$/stat)" > "$ABB/.lauf"
  aufraeumen() { git -C "$REPO" worktree remove --force "$ABB/repo" >/dev/null 2>&1 || true; rm -rf "$ABB"; git -C "$REPO" worktree prune || true; }
  trap aufraeumen EXIT
  git -C "$REPO" worktree add -q --no-checkout --detach "$ABB/repo" HEAD
  KEY="$(git -C "$REPO" rev-parse --path-format=absolute --git-common-dir)/git-crypt/keys/default"
  if [ -f "$KEY" ]; then GD="$(git -C "$ABB/repo" rev-parse --absolute-git-dir)"; mkdir -p "$GD/git-crypt/keys"; ln -s "$KEY" "$GD/git-crypt/keys/default"; fi
  git -C "$ABB/repo" checkout -q --detach HEAD
  [ -z "$(git -C "$ABB/repo" status --porcelain)" ] || { echo "FEHLER: Abbild nicht sauber ausgecheckt (git-crypt?)" >&2; exit 1; }
  echo "Abbild von HEAD $(git -C "$ABB/repo" rev-parse --short HEAD): $ABB/repo"
  rc=0; NOTES_IM_ABBILD=1 bash "$ABB/repo/desktop/build-desktop.sh" || rc=$?
  [ "$rc" = 0 ] || { echo "FEHLER: Build im Abbild gescheitert (rc=$rc)" >&2; exit "$rc"; }
  # wie bisher der ganze Ordner (auch test-electron/ der Hüllenprobe) — eigener Befehl: links von && griffe set -e nicht (Steuertool R2-1 #5)
  rm -rf build
  [ ! -e build ] || { echo "FEHLER: desktop/build ließ sich nicht leeren" >&2; exit 1; }
  mkdir -p build/release
  B="$(cd "$ABB/repo/desktop/build/release" && ls -1 -- *.flatpak 2>/dev/null || true)"; [ "$(grep -c . <<<"$B" || true)" = 1 ] || { echo "FEHLER: nicht genau ein Bundle im Abbild" >&2; exit 1; }
  cp "$ABB/repo/desktop/build/release/$B" "$ABB/repo/desktop/build/release/SHA256SUMS" build/release/
  cp "$ABB/repo/desktop/build/release/bundle.ok" build/release/bundle.ok   # Prüfdatei zuletzt, nur zu genau diesem Bundle
  [ "$(sha256sum < "build/release/$B" | cut -d' ' -f1)" = "$(head -1 build/release/bundle.ok)" ] || { rm -f build/release/bundle.ok; echo "FEHLER: Kopie aus dem Abbild ≠ bundle.ok" >&2; exit 1; }
  echo "Bundle: desktop/build/release/$B (aus dem Abbild von HEAD)"; cat build/release/SHA256SUMS
  echo "Signieren (Nutzer): gpg --local-user 100F9E25BFAEA807DBC357D750C0D78583BFCB81 --armor --detach-sign desktop/build/release/SHA256SUMS"
  exit 0
fi
if [ "${NOTES_IM_ABBILD:-}" = 1 ]; then   # nur im Abbild, nie im gemeinsamen Arbeitsbaum (eine von Hand gesetzte Variable gäbe sonst eine gültige bundle.ok)
  case "$(pwd -P)/" in "$(realpath -m "$HOME/.cache/alien-notes-abbild")"/*) ;; *) echo "FEHLER: NOTES_IM_ABBILD=1 nur im Abbild unter ~/.cache/alien-notes-abbild/" >&2; exit 1;; esac
fi
# ── ab hier im Abbild (oder Selbstbau ohne Git) ──

EL_VER="44.7.2"
EL_SHA="777b26a64aee3d185acb9f93c04782bb51eae7c2c61c793963ef24374e5a1539"   # electron-v44.7.2-linux-x64.zip (SHASUMS256.txt des Release, gegengeprüft mit checksums.json aus npm electron@44.7.2; v1.14, gleiche Engine wie Alien Pass v1.22 und Sachwert-Tresor v3.11, dort am 15.10.2026 geprüft)
APP_ID="org.alieninvestor.notes"
CACHE="$HOME/.cache/alien-notes-desktop"
ZIP="$CACHE/electron-v$EL_VER-linux-x64.zip"

mkdir -p "$CACHE"
if [ ! -f "$ZIP" ]; then
  curl -fL --proto '=https' --tlsv1.2 -o "$ZIP.part" "https://github.com/electron/electron/releases/download/v$EL_VER/electron-v$EL_VER-linux-x64.zip"
  mv "$ZIP.part" "$ZIP"
fi
echo "$EL_SHA  $ZIP" | sha256sum -c --quiet - || { echo "FEHLER: Hash des Electron-Archivs weicht ab — Build abgebrochen!"; exit 1; }
echo "Electron $EL_VER: Hash OK."

# Prüfsummen der Quellen, aus denen das Bundle entsteht, VOR dem Bau (v1.14, run-12 c-2): make-release.sh vergleicht sie mit dem Tag — ein veraltetes oder
# aus einem anderen Stand gebautes Bundle geht so nicht neben der richtigen APK raus. Pfade relativ zum Projekt; ändert sich etwas während des Baus: Abbruch.
# Liste DESK_SRC und desk_summen oben (seit v1.15 dort; wortgleich `feste_quellen desktop` in release-quellen.sh, dazu ganz vendor/).
DESK_SUMS0="$(desk_summen)" || { echo "FEHLER: Quellenliste unvollständig (DESK_SRC)" >&2; exit 1; }
summe0() { awk -v f="$1" '$2==f{print $1}' <<<"$DESK_SUMS0"; }   # Soll einer Quelle vor dem Bau
# jq ohne ~/.jq, wortgleich release-quellen.sh (Release-Audit v1.15 Runde 3): jq 1.7 liest ~/.jq als Vorspann jedes Programms, dort definierte Funktionen
# überdecken eingebaute (gemessen: „def keys: [];“) — lock_gleich bestünde sonst jede Abweichung. HOME zeigt für jq auf einen Pfad, den nur root anlegen kann.
jq() { HOME=/nonexistent command jq "$@"; }
# lock_gleich wortgleich release-quellen.sh (Steuertool R2-1 #2, ohne nicht installierte optionale Pakete; Pass run-13 Punkt 3/15)
lock_gleich() {
  local d="$1" weg k
  [ -f "$d/node_modules/.package-lock.json" ] && [ -n "$(jq -S '.packages' "$d/package-lock.json" 2>/dev/null)" ] || return 1
  weg="$(jq -r --slurpfile ist "$d/node_modules/.package-lock.json" \
    '.packages|to_entries[]|select(.key!="" and .value.optional==true and ($ist[0].packages[.key]==null))|.key' "$d/package-lock.json")" || return 1
  while read -r k; do [ -z "$k" ] || [ ! -e "$d/$k" ] || return 1; done <<<"$weg"
  [ "$(jq -S --slurpfile ist "$d/node_modules/.package-lock.json" \
       '.packages|del(."")|with_entries(select((.value.optional==true and ($ist[0].packages[.key]==null))|not))' "$d/package-lock.json")" \
    = "$(jq -S '.packages' "$d/node_modules/.package-lock.json")" ]
}
# Build-Werkzeuge (asar, fuses) frisch aus dem Lock — NACH der Summenbildung, dann gegen genau diese Lock geprüft (Steuertool R1 a-A5, R2-1 #2, Pass run-13 R7);
# vorher genügte ein vorhandenes node_modules/@electron/asar
# Wie build-apk.sh (Pass run-13 c-6 / r2d Nachtrag): nichts im Hüllen-Ordner, das npm ci am Lock vorbei lenkt (script-shell, Registry, Entpack-Pfad)
for c in .npmrc .prebuild-installrc npm-shrinkwrap.json; do
  [ ! -e "$c" ] && [ ! -L "$c" ] || { echo "FEHLER: desktop/$c — lenkt npm/prebuild-install am Lock vorbei. Entfernen." >&2; exit 1; }
done
npm ci --ignore-scripts --no-audit --no-fund
lock_gleich . || { echo "FEHLER: node_modules ≠ package-lock.json nach npm ci" >&2; exit 1; }
# Jede Datei, die das Flatpak-Manifest einbindet (path:), muss in der Quellenliste stehen (Steuertool R1 a-A2/b-B2)
while read -r mp; do
  [ "$mp" = ../build/electron ] && continue
  rel="$(realpath -m --relative-to=.. "flatpak/$mp")"
  printf '%s\n' $DESK_SRC | grep -qxF "$rel" || { echo "FEHLER: $rel (Manifest) fehlt in DESK_SRC" >&2; exit 1; }
done < <(sed -n -E 's/^ *(- +)?path: *//p' flatpak/$APP_ID.yml)
# Andere Formen, Quellen einzubinden (paths:, url:, Modul-Dateien), unterstützt die Prüfung nicht — dann lieber abbrechen (Steuertool R2-1 #6)
! grep -qE '^ *(- +)?(paths|url|mirror-urls) *:|^ *(- +)?type: *(archive|git|patch|script|shell|extra-data|svn|bzr|inline)( |$)|^ *- +[^ :]+\.(ya?ml|json) *$' flatpak/$APP_ID.yml \
  || { echo "FEHLER: Manifest bindet Quellen in einer nicht geprüften Form ein (paths/url/Modul-Datei)" >&2; exit 1; }

# Eigener Befehl, nicht links von && — sonst greift set -e nicht und ein Vendor-Fehler würde still übergangen (Audit run-6 #6)
(cd .. && ./build-www.sh) || { echo "FEHLER: build-www.sh fehlgeschlagen — Build abgebrochen!" >&2; exit 1; }
echo "www/ gebaut."
VNAME=$(grep '^VERSION_NAME=' ../VERSION | cut -d= -f2 | tr -d '[:space:]')
DREV=$(grep '^DESKTOP_REV=' ../VERSION | cut -d= -f2 | tr -d '[:space:]')
[[ "$VNAME" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] || { echo "FEHLER: VERSION_NAME fehlt oder ungültig in VERSION" >&2; exit 1; }
[[ "$DREV" =~ ^[1-9][0-9]*$ ]] || { echo "FEHLER: DESKTOP_REV fehlt oder ungültig in VERSION" >&2; exit 1; }
# Reiner Engine-Neubau (nur DESKTOP_REV hoch) bekommt ein -rN im Dateinamen; die App-Version bleibt VERSION_NAME
TAG="$VNAME"; [ "$DREV" = 1 ] || TAG="$VNAME-r$DREV"

rm -rf build   # eigener Befehl: links von && griffe set -e nicht (Steuertool R2-1 #5)
[ ! -e build ] || { echo "FEHLER: desktop/build ließ sich nicht entfernen" >&2; exit 1; }
mkdir -p build/app build/electron
unzip -q "$ZIP" -d build/electron
rm -f build/electron/chrome-sandbox build/electron/resources/default_app.asar   # Sandbox kommt im Flatpak über zypak
cp main.js preload.js atomic.js build/app/
cp ../assets/icon-only.png build/app/icon.png   # Fenster-Icon (_NET_WM_ICON) für Taskleiste/Alt+Tab — Electron rendert kein SVG
cp -r ../www build/app/www
# Inhalt = Quellen VOR dem Bau (v1.14 run-12 c2 Hinweis 5; seit v1.15 wie Pass run-13 R5, Steuertool R1 a-A3): jede Kopie gegen DESK_SUMS0 — Hülle, Icon,
# www/ (genau die Dateien, die build-www.sh ausliefert, app.js mit gesetzter APP_VERSION), Dateimenge exakt. Ein paralleler build-www.sh (zweite Session,
# Vorfall 26.09.2026) brächte sonst ein halbes www/ ins Bundle.
for p in main.js:desktop/main.js preload.js:desktop/preload.js atomic.js:desktop/atomic.js icon.png:assets/icon-only.png; do
  [ "$(sha256sum < "build/app/${p%%:*}" | cut -d' ' -f1)" = "$(summe0 "${p#*:}")" ] || { echo "FEHLER: ${p%%:*} im Bundle ≠ ${p#*:} vor dem Bau — neu bauen!" >&2; exit 1; }
done
WWW_FILES="$( { printf '%s\n' index.html app-theme.css icon.svg; awk '{print $2}' <<<"$DESK_SUMS0" | grep -E '^vendor/(fonts|hash-wasm)/|^vendor/eff/eff-wordlist\.js$'; } | LC_ALL=C sort)"
[ "$(cd build/app/www && find . -type f -o -type l | sed 's#^\./##' | LC_ALL=C sort)" = "$(printf '%s\napp.js\n' "$WWW_FILES" | LC_ALL=C sort)" ] \
  || { echo "FEHLER: www/ im Bundle hat andere Dateien als erwartet — neu bauen!" >&2; exit 1; }
while read -r f; do [ "$(sha256sum < "build/app/www/$f" | cut -d' ' -f1)" = "$(summe0 "$f")" ] || { echo "FEHLER: $f im Bundle ≠ Quelle vor dem Bau — neu bauen!" >&2; exit 1; }; done <<<"$WWW_FILES"
[ "$(sha256sum < ../app.js | cut -d' ' -f1)" = "$(summe0 app.js)" ] \
  && cmp -s <(sed -E "s|^const APP_VERSION = '[^']*';|const APP_VERSION = '$VNAME';|" ../app.js) build/app/www/app.js \
  || { echo "FEHLER: app.js im Bundle ≠ Quelle vor dem Bau — neu bauen!" >&2; exit 1; }
printf '{"name":"alien-notes","productName":"Alien Notes","version":"%s","main":"main.js","private":true}\n' "$VNAME" > build/app/package.json
node pack.mjs build/app build/electron

# Genauer Soll-Vergleich statt Sperrliste: jedes zusätzliche Recht (Bus-Policy, org.freedesktop.Flatpak, session-bus, devices=all …)
# bräche das Versprechen „kein Netz, keine Dateien“ genauso (Audit run-6 #5)
WANT=$(printf '[Context]\nshared=ipc;\nsockets=wayland;fallback-x11;\ndevices=dri;')

# Der Builder läuft selbst als Flatpak und sieht nur ~/ — deshalb liegt alles unter desktop/build/ (im Abbild unter ~/.cache)
# Erst bauen, dann die Rechte am gebauten Stand prüfen, erst danach installieren — eine App mit falschen Rechten
# soll gar nicht erst installiert werden (Audit run-7, Härtung)
flatpak run org.flatpak.Builder --force-clean --state-dir=build/.flatpak-builder build/fp flatpak/$APP_ID.yml
# Ausgabe des Builders gegen die Quellen vor dem Bau (v1.15, wie Pass v1.23 / Steuertool R2-2-2): Starter, .desktop, Icon byte-gleich, main/ = geprüftes build/electron
for paar in "bin/alien-notes:desktop/flatpak/alien-notes.sh" "share/applications/$APP_ID.desktop:desktop/flatpak/$APP_ID.desktop" \
            "share/icons/hicolor/scalable/apps/$APP_ID.svg:icon.svg"; do
  [ "$(sha256sum < "build/fp/files/${paar%%:*}" | cut -d' ' -f1)" = "$(summe0 "${paar#*:}")" ] \
    || { echo "FEHLER: ${paar%%:*} im gebauten Stand ≠ ${paar#*:} vor dem Bau — nicht installiert!" >&2; exit 1; }
done
diff -r build/fp/files/main build/electron >/dev/null || { echo "FEHLER: /app/main ≠ build/electron — nicht installiert!" >&2; exit 1; }
# metadata: alles außer [Application], [Build] und der Debug-Erweiterung muss exakt dem Soll entsprechen (Reihenfolge der Sockets wie im metadata)
PRE=$(awk '/^\[/{skip=($0=="[Application]"||$0=="[Build]"||$0 ~ /^\[Extension .*\.Debug\]$/)} !skip' build/fp/metadata | sed '/^$/d')
WANT_META=$(printf '[Context]\nshared=ipc;\nsockets=fallback-x11;wayland;\ndevices=dri;')
if [ "$PRE" != "$WANT_META" ]; then echo "$PRE"; echo "FEHLER: Rechte im gebauten Stand weichen vom Soll ab — nicht installiert!" >&2; exit 1; fi
flatpak run org.flatpak.Builder --user --install --export-only --repo=build/repo --state-dir=build/.flatpak-builder build/fp flatpak/$APP_ID.yml

# Endkontrolle an der installierten App: kein Netz, kein Dateisystem, nur Anzeige + GPU
PERM=$(flatpak info --user --show-permissions "$APP_ID")
echo "$PERM"
if [ "$(echo "$PERM" | sed '/^$/d')" != "$WANT" ]; then echo "FEHLER: Flatpak-Rechte weichen vom Soll ab — abgebrochen!" >&2; exit 1; fi
echo "Endkontrolle OK: kein Netz, kein Dateisystem. Start: flatpak run $APP_ID"

# Release-Datei: Flatpak-Bundle aus demselben Repo wie die geprüfte Installation. --runtime-repo lässt flatpak die Laufzeit
# (org.freedesktop.Platform) beim Nutzer von Flathub nachladen. Signiert wird SHA256SUMS (vom Nutzer, GPG-Release-Schlüssel).
mkdir -p build/release
BUNDLE="alien-notes-$TAG-linux-x86_64.flatpak"
flatpak build-bundle --runtime-repo=https://dl.flathub.org/repo/flathub.flatpakrepo build/repo "build/release/$BUNDLE" "$APP_ID"
(cd build/release && sha256sum "$BUNDLE" > SHA256SUMS)
[ "$(desk_summen)" = "$DESK_SUMS0" ] || { echo "FEHLER: Quellen haben sich während des Baus geändert — neu bauen!" >&2; exit 1; }
lock_gleich . || { echo "FEHLER: node_modules hat sich während des Baus geändert" >&2; exit 1; }
# Prüfdatei (wird NICHT hochgeladen): 1. Zeile Bundle-Hash, 2. Zeile Electron-Pin, danach die Quellen (make-release.sh gleicht sie mit dem Tag ab).
# Nur aus dem Abbild (v1.15, Pass run-13 c-5): ein Selbstbau ohne Git (Archiv) bekommt keine — make-release.sh lädt ohne sie nichts hoch.
if [ "${NOTES_IM_ABBILD:-}" = 1 ]; then
  { sha256sum "build/release/$BUNDLE" | cut -d' ' -f1; echo "electron $EL_VER $EL_SHA"; echo "$DESK_SUMS0"; } > build/release/bundle.ok
else
  echo "Hinweis: Selbstbau ohne Git — keine bundle.ok (kein Release-Build)."
fi
echo "Bundle: desktop/build/release/$BUNDLE"; cat build/release/SHA256SUMS
echo "Signieren (Nutzer): gpg --local-user 100F9E25BFAEA807DBC357D750C0D78583BFCB81 --armor --detach-sign desktop/build/release/SHA256SUMS"
