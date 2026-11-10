#!/usr/bin/env bash
# Kopiert die Web-Assets in www/ (Capacitor-webDir) und prüft VORHER die Integrität des
# gebündelten Fremdcodes (hash-wasm Argon2id, EFF-Wortliste). Falscher Hash = Build-Abbruch. (Alien Notes, aus Alien Pass übernommen)
set -euo pipefail
cd "$(dirname "$0")"

# Gepinnte Hashes (hash-wasm 4.12.0, dist/argon2.umd.min.js; EFF Large Wordlist 2016-07-18) — identisch mit Alien Pass
ARGON2_SHA="dcec617a2e1b700fa132d1583a186cb70611113395e869f2dd6cc82b415d3094"
EFF_SHA="addd35536511597a02fa0a9ff1e5284677b8883b83e986e43f15a3db996b903e"
EFF_JS_SHA="b7ccf3dd6958efa9000d8d68c63ebfdbab4a98493cf2fbcd25e1fc31ba57a6b7"   # bei Neugenerierung der .js neu pinnen
check(){ local f="$1" want="$2"; local got; got=$(sha256sum "$f" | cut -d' ' -f1)
  [ "$got" = "$want" ] || { echo >&2 "FEHLER: Hash von $f weicht ab ($got) — Build abgebrochen!"; exit 1; }; }
check vendor/hash-wasm/argon2.umd.min.js "$ARGON2_SHA"
check vendor/eff/eff_large_wordlist.txt "$EFF_SHA"
check vendor/eff/eff-wordlist.js "$EFF_JS_SHA"
# Fremdcode darf weder evaluieren noch funken (unbedingt geprüft, nicht nur bei Änderung)
for f in vendor/hash-wasm/argon2.umd.min.js vendor/eff/eff-wordlist.js; do
  if grep -qE 'eval\(|Function\(|fetch\(|XMLHttpRequest|WebSocket|importScripts|document\.|location\.|setTimeout\(\s*["'"'"']|setInterval\(\s*["'"'"']|window\[' "$f"; then
    echo >&2 "FEHLER: $f enthält eval/Function/Netz/DOM-Zugriffe — Build abgebrochen!"; exit 1; fi
done
# eff-wordlist.js muss exakt aus der .txt stammen
node -e '
const fs=require("fs");
const words=fs.readFileSync("vendor/eff/eff_large_wordlist.txt","utf8").trim().split("\n").map(l=>l.split("\t")[1].trim());
const js=fs.readFileSync("vendor/eff/eff-wordlist.js","utf8");
if(!js.includes("window.EFF_WORDS="+JSON.stringify(words)+";")){console.error("FEHLER: eff-wordlist.js passt nicht zur .txt");process.exit(1);}'
# Eigener Code: kein Netz, kein eval, kein innerHTML mit Nutzerdaten (nur die i18n-Übersetzung statischer Texte darf innerHTML nutzen)
if grep -nE 'fetch\(|XMLHttpRequest|WebSocket|importScripts|new Function\(|\beval\(' app.js; then echo >&2 "FEHLER: app.js enthält Netz-/Eval-Aufrufe — Build abgebrochen!"; exit 1; fi
if grep -nE '\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write|DOMParser|createContextualFragment|setTimeout\(\s*["'\'']|setInterval\(\s*["'\'']' app.js; then echo >&2 "FEHLER: HTML-Senke in app.js (nur applyI18n darf über el[prop] statische Übersetzungen setzen) — Build abgebrochen!"; exit 1; fi
# Kein Systemdialog (alert/confirm/prompt, auch über window./globalThis./self.): er erbt FLAG_SECURE nicht (Gerätetest 25.09.2026, Screenshot zeigte den
# Notiztitel) — Rückfragen nur über den eigenen Dialog ask(). Schlichter grep über ALLES, auch Kommentare (seit v1.14 nennen keine Kommentare die Aufrufe): der
# awk-Versuch, Kommentare auszunehmen, wurde von „//“ in Zeichenketten und „/*“ in Zeichenketten blind (run-12 c Hinweis 1).
if grep -nE '(^|[^A-Za-z0-9_$])(alert|confirm|prompt)[[:space:]]*\(' app.js; then echo >&2 "FEHLER: Systemdialog (alert/confirm/prompt) in app.js — eigener Dialog ask() — Build abgebrochen!"; exit 1; fi
# Platzhalter in den ausgelieferten Texten (v1.14, Release-Audit run-12 c2-2): Textentwürfe markieren unbelegte Teile mit [eckigen Klammern] („nur, wenn der
# Gerätetest sie belegt“) — die Sperre galt bisher nur dem CHANGELOG, ein stehengebliebener Teil im Handbuch ginge ungeprüft in APK und Bundle. Geprüft wird
# der sichtbare Text von index.html (ohne Kommentare/Skripte/Tags, dazu title/aria-label/placeholder/content/alt) und alle Zeichenketten der Tabellen I18N und T
# in app.js. Findet sie eine Tabelle nicht, bricht der Build ab (nie still ungeprüft). Kästchen [ ]/[x] und Links [Text](…) bleiben hier frei (Checklisten im
# Handbuch); die Release-Notiz prüft make-release.sh strenger, ohne diese Ausnahmen.
# Seit v1.15 (Querfund Alien Pass v1.23 Release-Audit run-13 c-4, Regel wortgleich Pass build-www.sh v1.24): Groß-/Kleinschreibung egal, dazu ???, XX (auch
# „XX.10.2026“) und vX.Y; Attribute auch in einfachen Anführungszeichen; ein Wert in I18N/T außerhalb von "…" (einfache Anführungszeichen, Template-Literal)
# bricht ab, weil die Prüfung ihn sonst gar nicht läse (Zerleger: "…" und Kommentare werden übersprungen). Gemessen 10.11.2026 über Arbeitsbaum, HEAD und alle
# 15 Tags: 0 Fehlalarme; 10 Mutanten (todo/Todo/Fixme, ???, XX.10.2026, vX.Y, Attribut in ‘…’, Wert in '…' bzw. als Template in I18N/T) rot, vorher grün.
# Release-Audit v1.15 Runde 1 (Prüfer b F4, 10.11.2026): Zahl-Entitäten (&#91; &#x5B;, auch ohne Semikolon) und die benannten Entitäten für Klammern/Fragezeichen
# werden vor der Prüfung dekodiert (im Text, in den Attributen und in den I18N/T-Werten), Attribute auch mit Leerzeichen um „=“, ohne Anführungszeichen und groß
# geschrieben (TITLE=…) — „&#91;Datum&#93;“, „title=TODO“ und „title = "[…]"“ gingen sonst durch. Gemessen: Arbeitsbaum, HEAD und alle 15 Tags ohne Fehlalarm,
# 9 Mutanten rot, „&amp;#91;“ (zeigt den Text „&#91;“) bleibt grün.
# Runde 2 (Prüfer b B5): JS-Escapes in den I18N/T-Werten (\uXXXX, \u{…}, \xXX) werden von links nach rechts aufgelöst (ein doppelter Backslash bleibt
# Text); die Kommentarformen <!-->, <!---> und --!> (der Browser schließt sie anders als die Prüfung, Text dahinter wäre sichtbar, aber ungeprüft) brechen ab;
# value und label stehen in der Attributliste. Gemessen: Arbeitsbaum, HEAD und alle 15 Tags ohne Fehlalarm, 9 Mutanten rot, ein Wert mit echtem Backslash vor
# „u005B“ bleibt grün.
# Runde 3 (Prüfer B-3): der Text wird zusätzlich mit ENTFERNTEN Tags geprüft (vorher nur mit Leerzeichen an ihrer Stelle) — „TO<b></b>DO“ zeigt der
# Browser als „TODO“. Grenze dieser Regel (bewusst): sie fängt VERSEHENTLICH stehengebliebene Platzhalter, keine absichtliche Verschleierung — offen bleiben
# „Kommentare“ in Attributwerten und in style/textarea, Zeilenfortsetzung und Verkettung in app.js, ein Wort direkt an einem Nachbar-Element („…</h2><p>TO<b></b>DO“).
# Gemessen: Arbeitsbaum, HEAD und alle 15 Tags ohne Fehlalarm; „TO<b></b>DO“ in index.html und „FIX<b></b>ME“ in I18N rot, vorher grün.
node -e '
const fs=require("fs"); const RX=/\[(?![ xX]\])[^\]]{1,300}\](?!\()|\?\?\?|\bX{2,}\b|\bvX\.Y\b|\b(?:TODO|TBD|FIXME)\b/i;
const roh=fs.readFileSync("index.html","utf8");
if(/<!--->|<!-->|--!>/.test(roh)){ console.error("FEHLER: index.html enthält <!-->, <!---> oder --!> (Kommentarformen, die der Browser anders schließt als diese Prüfung) — umschreiben"); process.exit(1); }
const raw=roh.replace(/<!--[\s\S]*?-->/g," ").replace(/<(script|style)[\s\S]*?<\/\1>/g," ");
const ent=(t)=>t.replace(/&#(?:x([0-9a-f]+)|([0-9]+));?/gi,(m,h,d)=>{ const n=h?parseInt(h,16):+d; return n>0&&n<=0x10ffff?String.fromCodePoint(n):m; })
  .replace(/&(lsqb|lbrack|rsqb|rbrack|quest|lcub|lbrace|rcub|rbrace|lt|gt|quot|apos|nbsp|amp);/gi,(m,n)=>({lsqb:"[",lbrack:"[",rsqb:"]",rbrack:"]",quest:"?",lcub:"{",lbrace:"{",rcub:"}",rbrace:"}",lt:"<",gt:">",quot:"\"",apos:"\x27",nbsp:" ",amp:"&"})[n.toLowerCase()]);
const attrs=[...raw.matchAll(/\b(?:title|aria-label|placeholder|content|alt|value|label)\s*=\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|([^\s>"\x27]+))/gi)].map(m=>m[1]??m[2]??m[3]).join("\n");
const html=ent(raw.replace(/<[^>]+>/g," "))+"\n"+ent(raw.replace(/<[^>]+>/g,""))+"\n"+ent(attrs);
const js=fs.readFileSync("app.js","utf8").split("\n");
const block=(start)=>{ const i=js.findIndex(l=>l.startsWith(start)); if(i<0){ console.error("FEHLER: Tabelle "+start+" in app.js nicht gefunden (Platzhalter-Prüfung)"); process.exit(1); }
  const out=[]; for(let k=i;k<js.length;k++){ out.push(js[k]); if(k>i&&/^};/.test(js[k])) return out.join("\n"); } console.error("FEHLER: Ende von "+start+" nicht gefunden"); process.exit(1); };
const jsEsc=(t)=>t.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g,(m,e)=>{ if(e[0]==="u"&&e[1]==="{"){ const n=parseInt(e.slice(2,-1),16); return n<=0x10ffff?String.fromCodePoint(n):m; }
  if(e[0]==="u"&&e.length===5||e[0]==="x"&&e.length===3) return String.fromCharCode(parseInt(e.slice(1),16)); return ({n:"\n",t:"\t",r:"\r"})[e]??e; });
const strs=(src)=>[...src.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m=>jsEsc(m[1])).filter(s=>!/^[a-z]+(\.[A-Za-z0-9]+)+$/.test(s)).join("\n"); const strsE=(src)=>ent(strs(src).replace(/<[^>]+>/g," "))+"\n"+ent(strs(src).replace(/<[^>]+>/g,""));
const fremd=(src)=>{ for(let i=0;i<src.length;i++){ const c=src[i];
  if(c==="\""){ for(i++;i<src.length&&src[i]!=="\"";i++){ if(src[i]==="\\") i++; } continue; }
  if(c==="/"&&src[i+1]==="/"){ while(i<src.length&&src[i]!=="\n") i++; continue; }
  if(c==="/"&&src[i+1]==="*"){ const j=src.indexOf("*/",i+2); if(j<0) return "/*"; i=j+1; continue; }
  if(c==="\x27"||c==="\x60") return src.slice(i,i+60); }
  return null; };
for(const start of ["const I18N = {","const T = {"]){ const f=fremd(block(start)); if(f!==null){ console.error("FEHLER: "+start+" in app.js hat einen Wert außerhalb von \"…\" (einfache Anführungszeichen/Template) — die Platzhalter-Prüfung läse ihn nicht: "+JSON.stringify(f)); process.exit(1); } }
for(const [name,text] of [["index.html",html],["app.js I18N",strsE(block("const I18N = {"))],["app.js T",strsE(block("const T = {"))]]){
  const m=RX.exec(text); if(m){ console.error("FEHLER: Platzhalter in "+name+": "+JSON.stringify(m[0].slice(0,120))+" — erst auflösen (Gerätetest/Faktencheck)"); process.exit(1); } }
' || { echo >&2 "FEHLER: Platzhalter-Prüfung der App-Texte — Build abgebrochen!"; exit 1; }
echo "Vendor-Integrität OK."

rm -rf www && mkdir -p www/vendor
cp index.html app.js app-theme.css icon.svg www/
# Versionsanzeige aus VERSION setzen (einzige Quelle)
VNAME=$(grep '^VERSION_NAME=' VERSION | cut -d= -f2 | tr -d '[:space:]')
[ -n "$VNAME" ] || { echo >&2 "FEHLER: VERSION_NAME fehlt in VERSION"; exit 1; }
sed -i -E "s|^const APP_VERSION = '[^']*';|const APP_VERSION = '$VNAME';|" www/app.js
grep -q "^const APP_VERSION = '$VNAME';" www/app.js || { echo >&2 "FEHLER: APP_VERSION konnte nicht auf $VNAME gesetzt werden"; exit 1; }
echo "APP_VERSION = $VNAME"
cp -r vendor/fonts vendor/hash-wasm www/vendor/
mkdir -p www/vendor/eff && cp vendor/eff/eff-wordlist.js www/vendor/eff/
echo "www/ gebaut:"; find www -type f | sort
