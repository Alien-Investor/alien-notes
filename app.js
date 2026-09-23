"use strict";
/* app.js — Alien Notes. Grundgerüst aus dem App-Design-Kit (KIT-Abschnitte unverändert) + Sentinel-Region aus Alien Pass v1.8.
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
  "scaffold.title":"Scaffold",
  "scaffold.text":"Repository, design kit and file format (AINV1) are in place. The user interface follows in the next step.",
  "help.title":"Manual",
  "help.p1":"Alien Notes is being built. The manual arrives together with the interface.",
};
const T = {
  "pw.toggle":{de:"Anzeigen / verbergen",en:"Show / hide"},
  "toast.saved":{de:"Gespeichert",en:"Saved"},
};
let LANG = (function(){ try{ return localStorage.getItem(LANG_KEY) || ((navigator.language||'de').toLowerCase().indexOf('de')===0?'de':'en'); }catch(_){ return 'de'; } })();
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
  if(raw.length>MAX_FILE_BYTES) throw new Error('toolarge');
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
  if(type==='text') o.body=str(e.body,CAPS.body);
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
/* === VAULT-FORMAT END === */

const App = (function(){
  /* ===== KIT: Helfer ===== */
  const $ = id => document.getElementById(id);
  function el(tag, cls, text){ const n=document.createElement(tag); if(cls) n.className=cls; if(text!=null) n.textContent=text; return n; }
  function toast(msg){ const t=$('toast'); if(!t) return; t.textContent=msg; t.classList.remove('hidden'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.add('hidden'),2600); }
  function theme(t){ try{ if(t==='soft'){ document.documentElement.setAttribute('data-theme','soft'); localStorage.setItem('alien-theme','soft'); }
    else { document.documentElement.removeAttribute('data-theme'); localStorage.setItem('alien-theme','dark'); } }catch(_){}
    ['th-dark','th-soft'].forEach(id=>{ const b=$(id); if(b) b.classList.toggle('on', (id==='th-soft')===(t==='soft')); }); }
  function toggleLang(){ setLang(LANG==='de'?'en':'de'); }
  function tab(name){ document.querySelectorAll('.tabview').forEach(v=>v.classList.toggle('hidden', v.id!=='tab-'+name));
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active', b.dataset.arg===name)); closeMenus(); }
  function openHelp(){ const o=$('help-overlay'); if(o) o.classList.remove('hidden'); }
  function closeHelp(){ const o=$('help-overlay'); if(o) o.classList.add('hidden'); }

  /* ===== KIT: Auge im Passwortfeld =====
     enhancePassFields() beim Laden (VOR applyI18n) legt um JEDES input[type=password] mit id ein .pw-wrap + Knopf .pw-eye.
     Genau EIN Feld je Auge. Dynamisch erzeugte Felder: eyeWrap(input) aufrufen. Beim Sperren/Verstecken/Fehlversuch maskInputs(scope). */
  function setEye(b,on){ b.setAttribute('aria-pressed',on?'true':'false'); b.dataset.showpass.split(',').forEach(id=>{ const f=$(id); if(f) f.type=on?'text':'password'; }); }
  function togglePass(_,b){ if(b) setEye(b,b.getAttribute('aria-pressed')!=='true'); }
  function maskInputs(scope){ document.querySelectorAll((scope||'')+' [data-showpass]').forEach(b=>setEye(b,false)); }
  function eyeWrap(inp){ const w=el('div','pw-wrap'), b=el('button','pw-eye'); b.type='button'; b.dataset.showpass=inp.id; b.setAttribute('aria-pressed','false'); b.title=tr('pw.toggle');
    if(inp.parentNode) inp.parentNode.insertBefore(w,inp); w.append(inp,b); return w; }
  function enhancePassFields(){ document.querySelectorAll('input[type=password]').forEach(i=>{ if(i.id&&!i.closest('.pw-wrap')) eyeWrap(i); }); }

  /* ===== KIT: Auswahlfeld (.combo) =====
     Markup: <div class="combo"><button class="combo-btn" data-action="toggleCombo" data-arg="ID"><span id="cb-ID"></span><span class="caret">▾</span></button>
             <select class="combo-native" id="ID" data-change="…"><option …></select><div id="cm-ID" class="combo-menu hidden"></div></div>
     Das native <select> bleibt WERTSPEICHER (.value, change-Delegation, Tests) — nicht durch eigene Zustandsführung ersetzen.
     Wer per JS Wert oder Optionstext ändert, ruft syncCombo(id). closeMenus() versteckt UND leert (Optionen können Nutzerdaten sein). */
  function closeMenus(){ document.querySelectorAll('.combo-menu').forEach(m=>{ m.classList.add('hidden'); m.replaceChildren(); }); }
  function syncCombo(id){ const sel=$(id), lab=$('cb-'+id); if(!sel||!lab) return; const o=sel.options[sel.selectedIndex]; lab.textContent=o?o.textContent:''; }
  function syncCombos(){ document.querySelectorAll('.combo-native').forEach(sel=>syncCombo(sel.id)); }
  function toggleCombo(id){ const menu=$('cm-'+id), sel=$(id); if(!menu||!sel) return;
    const wasOpen=!menu.classList.contains('hidden'); closeMenus(); if(wasOpen) return;
    for(const o of sel.options){ const b=el('button','combo-opt'+(o.value===sel.value?' on':''),o.textContent); b.type='button'; b.dataset.action='chooseOpt'; b.dataset.arg=o.value; b.dataset.sel=id; menu.appendChild(b); }
    menu.classList.remove('hidden'); }
  function chooseOpt(value, elx){ const sel=$(elx&&elx.dataset.sel); closeMenus();
    // Guard (Review-Fund Tresor v2.10): nur echte Optionen eines Wertspeichers; gleicher Wert → kein change (sonst unnötiges Speichern + Toast)
    if(!sel||!sel.classList.contains('combo-native')||!Array.from(sel.options).some(o=>o.value===value)||sel.value===value) return;
    sel.value=value; syncCombo(sel.id);
    sel.dispatchEvent(new Event('change',{bubbles:true})); }   // die change-Delegation übernimmt von hier

  /* ===== APP: Alien Notes — Oberfläche folgt in Schritt 3 (Liste, Editor, Checkliste, Suche, Kategorien, Papierkorb) ===== */
  function relabel(){ /* JS-gerenderte Inhalte beim Sprachwechsel neu zeichnen */ }
  function boot(){ syncCombos(); theme(document.documentElement.getAttribute('data-theme')==='soft'?'soft':'dark'); const v=$('ver'); if(v) v.textContent='v'+APP_VERSION; }

  return {boot,tab,toast,theme,toggleLang,openHelp,closeHelp,relabel,
    togglePass,maskInputs,eyeWrap,enhancePassFields,
    closeMenus,syncCombo,syncCombos,toggleCombo,chooseOpt};
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
  const fn=App[elx.dataset.change]; if(typeof fn==='function') fn(elx.value, elx);
});
document.addEventListener('input',ev=>{
  const elx=ev.target.closest('[data-input]'); if(!elx) return;
  const fn=App[elx.dataset.input]; if(typeof fn==='function') fn(elx.value, elx);
});
document.addEventListener('keydown',ev=>{
  if(ev.key==='Escape'){ App.closeMenus(); App.closeHelp(); return; }
  if(ev.key!=='Enter') return;
  const elx=ev.target.closest('[data-enter]'); if(!elx) return;
  const fn=App[elx.dataset.enter]; if(typeof fn==='function') fn();
});
window.addEventListener('DOMContentLoaded',()=>{
  App.enhancePassFields();   // vor applyI18n: setzt die Augen-Beschriftung
  applyI18n();
  App.boot();
});
