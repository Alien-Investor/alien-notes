#!/usr/bin/env bash
# Alien Notes Desktop bauen: www/ (Vendor-Hashes wie bei der APK) → Electron (Version + Hash gepinnt) → app.asar + Fuses
# → Flatpak ohne Netz, als User-Installation. Kein sudo, keine npm-Installationsskripte.
set -euo pipefail
cd "$(dirname "$0")"

EL_VER="44.4.3"
EL_SHA="fe880a7e37160cfd4e00193bc4c713ead7a778abfe74860a2d36d86fd0be48a8"   # electron-v44.4.3-linux-x64.zip (SHASUMS256.txt des Release)
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

[ -d node_modules/@electron/asar ] && [ -d node_modules/@electron/fuses ] || { echo "FEHLER: erst 'npm ci' in desktop/"; exit 1; }

# Eigener Befehl, nicht links von && — sonst greift set -e nicht und ein Vendor-Fehler würde still übergangen (Audit run-6 #6)
(cd .. && ./build-www.sh) || { echo "FEHLER: build-www.sh fehlgeschlagen — Build abgebrochen!" >&2; exit 1; }
echo "www/ gebaut."
VNAME=$(grep '^VERSION_NAME=' ../VERSION | cut -d= -f2 | tr -d '[:space:]')
DREV=$(grep '^DESKTOP_REV=' ../VERSION | cut -d= -f2 | tr -d '[:space:]')
[[ "$DREV" =~ ^[1-9][0-9]*$ ]] || { echo "FEHLER: DESKTOP_REV fehlt oder ungültig in VERSION" >&2; exit 1; }
# Reiner Engine-Neubau (nur DESKTOP_REV hoch) bekommt ein -rN im Dateinamen; die App-Version bleibt VERSION_NAME
TAG="$VNAME"; [ "$DREV" = 1 ] || TAG="$VNAME-r$DREV"

rm -rf build && mkdir -p build/app build/electron
unzip -q "$ZIP" -d build/electron
rm -f build/electron/chrome-sandbox build/electron/resources/default_app.asar   # Sandbox kommt im Flatpak über zypak
cp main.js preload.js atomic.js build/app/
cp ../assets/icon-only.png build/app/icon.png   # Fenster-Icon (_NET_WM_ICON) für Taskleiste/Alt+Tab — Electron rendert kein SVG
cp -r ../www build/app/www
printf '{"name":"alien-notes","productName":"Alien Notes","version":"%s","main":"main.js","private":true}\n' "$VNAME" > build/app/package.json
node pack.mjs build/app build/electron

# Genauer Soll-Vergleich statt Sperrliste: jedes zusätzliche Recht (Bus-Policy, org.freedesktop.Flatpak, session-bus, devices=all …)
# bräche das Versprechen „kein Netz, keine Dateien“ genauso (Audit run-6 #5)
WANT=$(printf '[Context]\nshared=ipc;\nsockets=wayland;fallback-x11;\ndevices=dri;')

# Der Builder läuft selbst als Flatpak und sieht nur ~/ — deshalb liegt alles unter desktop/build/
# Erst bauen, dann die Rechte am gebauten Stand prüfen, erst danach installieren — eine App mit falschen Rechten
# soll gar nicht erst installiert werden (Audit run-7, Härtung)
flatpak run org.flatpak.Builder --force-clean --state-dir=build/.flatpak-builder build/fp flatpak/$APP_ID.yml
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
echo "Bundle: desktop/build/release/$BUNDLE"; cat build/release/SHA256SUMS
echo "Signieren (Nutzer): gpg --local-user 100F9E25BFAEA807DBC357D750C0D78583BFCB81 --armor --detach-sign desktop/build/release/SHA256SUMS"
