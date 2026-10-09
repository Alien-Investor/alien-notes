// Roundtrip-/Format-Test (Node, kein Browser). Evaluiert die Sentinel-Region aus app.js
// (=== VAULT-FORMAT BEGIN/END ===) DIREKT — keine Nachbildung, damit Lese- und Schreibpfad
// garantiert derselbe Code sind. Prüft Schlüsselhierarchie, AAD, Grenzen, Merge, Sanitizer, Papierkorb, TOTP.
// Aus Alien Pass v1.8 übernommen und auf das Notizen-Modell (text/list, 13 Felder, Magic AINV1) angepasst.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { inflateRawSync } from 'node:zlib';
import { mkZip } from './test-zip.mjs';
const require = createRequire(import.meta.url);
globalThis.hashwasm = require('./vendor/hash-wasm/argon2.umd.min.js');
const words = readFileSync('vendor/eff/eff_large_wordlist.txt','utf8').trim().split('\n').map(l=>l.split('\t')[1].trim());
globalThis.EFF_WORDS = words;

const src = readFileSync('app.js','utf8');
// Versionsanzeige (Einstellungen) muss zur Datei VERSION passen
{ const vn=(readFileSync('VERSION','utf8').match(/^VERSION_NAME=(.+)$/m)||[])[1]?.trim();
  const av=(src.match(/^const APP_VERSION = '([^']*)';/m)||[])[1];
  if(!vn||av!==vn) throw new Error(`APP_VERSION (${av}) != VERSION_NAME (${vn})`);
  console.log('  ✓ APP_VERSION', av, '= VERSION_NAME'); }
const a = src.indexOf('/* === VAULT-FORMAT BEGIN ==='), z = src.indexOf('/* === VAULT-FORMAT END === */');
if(a<0||z<0) throw new Error('Sentinel nicht gefunden');
const region = src.slice(a, z);
if(/\b(document|window|localStorage)\s*[.\[]/.test(region)) throw new Error('Sentinel-Region enthält DOM-Code');
const V = new Function(region + `
  return {bufToB64,b64ToBuf,base32Encode,base32Decode,rand,randInt,cryptoId,passBytes,aad,deriveKek,newDek,wrapDek,unwrapDek,
    encryptBody,decryptBody,serializeFile,parseFile,kdfOk,KDF_DEFAULT,KDF_BOUNDS,MAX_ENTRIES,MAX_FILE_BYTES,MAX_READ_BYTES,emptyVault,sanitizeEntry,sanitizeEntries,sanitizeVault,sanitizeSettings,
    SETTINGS_DEFAULT,SETTINGS_ALLOWED,BG_NEVER,normalizeTotp,otpauthUri,sanitizeItems,ITEMS_MAX,ENTRY_TYPES,CAPS,mergeEntries,winner,canon,purgeTombstones,tombstone,
    totpCode,totpRemaining,genWords,passStrength,passCheck,MAX_TOMBSTONES,liveCount,tombFrom,isWiped,wipeTrash,shapeIncoming,TRASH_DAYS,MAX_TRASH,TOMBSTONE_DAYS,ts,
    dupKey,entryType,line,bioKey,parseBioBlob,serializeBioBlob,bioWrapOk,wrapTag,mdParse,mdInline,noteText,lineToItem,linesToItems,itemsToBody,splitItemPaste,snImport,snId,htmlToText,lexToMd,zipEntries,zipSlice,zipFindSn,ZIP_NAME_SN,renameCatEntries,bodyJson,bulkEdit};`)();

let pass=0, fail=0; const ok=(c,m)=>{ if(c){pass++;console.log('  ✓',m);} else {fail++;console.log('  ✗ FEHLER:',m);} };
const throwsWith=async(fn,code,m)=>{ try{ await fn(); ok(false,m+' (kein Fehler)'); }catch(e){ ok(e&&e.message===code,m+' → '+(e&&e.message)); } };
const KDF_TEST={m:8192,t:1,p:1};   // klein für schnelle Tests; Format identisch
const FIELDS=13;                   // Whitelist-Felder eines Eintrags: id,type,cat,title,body,items,fav,pinned,md,hide,created,updated,deleted

async function createVault(pass, vault, kdfP){
  const kdf=Object.assign({}, kdfP||KDF_TEST, {salt:V.rand(16)});
  const kek=await V.deriveKek(V.passBytes(pass), kdf);
  const dekX=await V.newDek(); const wrap=await V.wrapDek(dekX,kek,kdf); const dek=await V.unwrapDek(wrap,kek,kdf,false);
  const body=await V.encryptBody(vault,dek,kdf);
  return {raw:V.serializeFile(kdf,wrap,body), kdf, wrap, dek};
}
async function open(raw, pass){
  const f=V.parseFile(raw); const kek=await V.deriveKek(V.passBytes(pass), f.kdf);
  const dek=await V.unwrapDek(f.wrap,kek,f.kdf,false); const obj=await V.decryptBody(f.body,dek,f.kdf); return {f,dek,vault:V.sanitizeVault(obj)};
}
const E=(o)=>Object.assign({id:V.cryptoId(),type:'text',title:'T',body:'',items:[],cat:'',fav:false,pinned:false,md:false,created:'2026-01-01T00:00:00.000Z',updated:'2026-01-02T00:00:00.000Z',deleted:null},o);

console.log('\n[1] Format-Roundtrip + Schlüsselhierarchie');
{
  const vault=V.emptyVault(); vault.entries.push(V.sanitizeEntry(E({title:'Einkauf',body:'GeheimMarker77!\nZeile 2'})));
  const c=await createVault('passphrase-eins-zwei', vault);
  const o=await open(c.raw,'passphrase-eins-zwei');
  ok(o.vault.entries.length===1&&o.vault.entries[0].body==='GeheimMarker77!\nZeile 2','Setup → Serialize → Parse → Unlock liefert Eintrag (Zeilenumbruch bleibt)');
  ok(!c.raw.includes('GeheimMarker')&&!c.raw.includes('Einkauf'),'Klartext nicht in der Datei');
  ok(JSON.parse(c.raw).magic==='AINV1','Datei trägt das eigene Magic AINV1');
  let threw=false; try{ await open(c.raw,'falsche-passphrase-xx'); }catch(_){ threw=true; } ok(threw,'falsche Passphrase wirft');
  // Persist-Symmetrie: mit dem entpackten DEK neu verschlüsseln → wieder lesbar (gleiche kdf/wrap)
  const body2=await V.encryptBody(o.vault,o.dek,o.f.kdf); const raw2=V.serializeFile(o.f.kdf,o.f.wrap,body2);
  const o2=await open(raw2,'passphrase-eins-zwei'); ok(o2.vault.entries[0].body==='GeheimMarker77!\nZeile 2','Neu-Persist mit gelesenen Header-Werten bleibt lesbar (Lese/Schreib-Symmetrie)');
  // Nicht-Default-KDF-Parameter überleben
  const c3=await createVault('passphrase-eins-zwei', vault, {m:16384,t:2,p:2}); const o3=await open(c3.raw,'passphrase-eins-zwei');
  ok(o3.f.kdf.m===16384&&o3.f.kdf.t===2&&o3.f.kdf.p===2,'Nicht-Default m/t/p werden gelesen und zurückgeschrieben');
  const f=JSON.parse(c.raw); const saltB=Buffer.from(f.kdf.salt,'base64'); ok(saltB.length===16&&Buffer.from(saltB).toString('base64')===f.kdf.salt,'Salt kanonisch (16 B, Standard-Base64)');
  ok(V.KDF_DEFAULT.m===65536&&V.KDF_DEFAULT.t===3&&V.KDF_DEFAULT.p===1,'KDF-Defaults wie Alien Pass (64 MiB / t3 / p1)');
}

console.log('\n[2] AAD / Manipulation / Rollentrennung');
{
  const c=await createVault('passphrase-eins-zwei', V.emptyVault());
  const tamper=(fn)=>{ const f=JSON.parse(c.raw); fn(f); return JSON.stringify(f); };
  for(const [name,fn] of [['kdf.t',f=>f.kdf.t=2],['kdf.m',f=>f.kdf.m=16384],['kdf.p',f=>f.kdf.p=2],['salt',f=>{const b=Buffer.from(f.kdf.salt,'base64');b[0]^=1;f.kdf.salt=b.toString('base64');}]]){
    let threw=false; try{ await open(tamper(fn),'passphrase-eins-zwei'); }catch(_){ threw=true; } ok(threw,'manipuliertes '+name+' scheitert an AAD');
  }
  let threw=false; try{ await open(tamper(f=>{ f.body.ct=f.wrap.ct; f.body.iv=f.wrap.iv; }),'passphrase-eins-zwei'); }catch(_){ threw=true; } ok(threw,'wrap-Ciphertext als body abgelehnt (AAD-Rolle)');
  threw=false; try{ await open(tamper(f=>{ const b=Buffer.from(f.body.ct,'base64'); b[3]^=0xff; f.body.ct=b.toString('base64'); }),'passphrase-eins-zwei'); }catch(_){ threw=true; } ok(threw,'gekipptes Ciphertext-Byte scheitert');
  threw=false; try{ await open(tamper(f=>{ f.ver=2; }),'passphrase-eins-zwei'); }catch(e){ threw=e.message==='newer'; } ok(threw,'ver=2 → "newer" (vor KDF)');
  await throwsWith(()=>Promise.resolve(V.parseFile(tamper(f=>{ f.kdf.m=1e9; }))),'kdfbounds','m=1e9 abgelehnt VOR KDF-Arbeit');
  await throwsWith(()=>Promise.resolve(V.parseFile(tamper(f=>{ f.kdf.m=262144; f.kdf.t=16; }))),'kdfbounds','Budget m·t überschritten abgelehnt');
  await throwsWith(()=>Promise.resolve(V.parseFile(tamper(f=>{ f.kdf.t=0; }))),'kdfbounds','t=0 abgelehnt');
  await throwsWith(()=>Promise.resolve(V.parseFile(tamper(f=>{ f.magic='AISV1'; }))),'format','falsches magic abgelehnt');
  await throwsWith(()=>Promise.resolve(V.parseFile(tamper(f=>{ f.magic='AIPV1'; }))),'format','Alien-Pass-Datei (AIPV1) abgelehnt — kein Vermischen der Tresore');
  await throwsWith(()=>Promise.resolve(V.parseFile('x'.repeat(41*1024*1024))),'toolarge','Übergröße (> 2 × 20 MB) vor JSON.parse abgelehnt');
  await throwsWith(()=>Promise.resolve(V.parseFile('x'.repeat(21*1024*1024))),'format','21 MB lesbar (Lesegrenze 2 × Schreibgrenze: übergroße Datei bleibt zu öffnen und schrumpfbar)');
  await throwsWith(()=>Promise.resolve(V.parseFile(tamper(f=>{ f.wrap.ct=f.wrap.ct.slice(0,10); }))),'format','wrap.ct falsche Länge abgelehnt');
  await throwsWith(()=>Promise.resolve(V.parseFile(tamper(f=>{ f.kdf.salt='!!!'; }))),'format','Salt kein Base64 abgelehnt');
  // Ein mit Alien-Pass-AAD verschlüsselter Body ist unter AINV1 nicht lesbar, selbst mit richtigem DEK
  { const kdf=Object.assign({},KDF_TEST,{salt:V.rand(16)}); const dek=await V.newDek();
    const aadPass=new TextEncoder().encode(`AIPV1|1|argon2id|${kdf.m}|${kdf.t}|${kdf.p}|${V.bufToB64(kdf.salt)}|body`);
    const iv=V.rand(12); const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aadPass},dek,new TextEncoder().encode('{}')));
    let cross=false; try{ await V.decryptBody({iv,ct},dek,kdf); cross=true; }catch(_){ } ok(!cross,'AAD unterscheidet AIPV1 und AINV1 auch bei gleichem Schlüssel'); }
  // IV-Eindeutigkeit
  const ivs=new Set(); for(let i=0;i<10000;i++) ivs.add(Buffer.from(V.rand(12)).toString('hex')); ok(ivs.size===10000,'10.000 IVs eindeutig');
}

console.log('\n[3] Passphrase-Wechsel mit DEK-Rotation');
{
  const vault=V.emptyVault(); vault.entries.push(V.sanitizeEntry(E({title:'A'})));
  const c=await createVault('alte-passphrase-123', vault);
  const o=await open(c.raw,'alte-passphrase-123');
  const kdf={m:o.f.kdf.m,t:o.f.kdf.t,p:o.f.kdf.p,salt:V.rand(16)}; const kNew=await V.deriveKek(V.passBytes('neue-passphrase-456'),kdf);
  const dekX=await V.newDek(); const wrap=await V.wrapDek(dekX,kNew,kdf); const dek=await V.unwrapDek(wrap,kNew,kdf,false);
  const raw2=V.serializeFile(kdf,wrap,await V.encryptBody(o.vault,dek,kdf));
  const o2=await open(raw2,'neue-passphrase-456'); ok(o2.vault.entries[0].title==='A','neue Passphrase öffnet');
  let threw=false; try{ await open(raw2,'alte-passphrase-123'); }catch(_){ threw=true; } ok(threw,'alte Passphrase öffnet NICHT mehr');
  ok(JSON.parse(raw2).wrap.ct!==JSON.parse(c.raw).wrap.ct&&JSON.parse(raw2).kdf.salt!==JSON.parse(c.raw).kdf.salt,'wrap + salt erneuert');
  threw=false; try{ await V.decryptBody(V.parseFile(raw2).body,o.dek,kdf); }catch(_){ threw=true; } ok(threw,'alter DEK passt nicht mehr (Rotation)');
}

console.log('\n[4] Sanitizer (Whitelist, Zeitstempel, Settings, Aegis-Hürde)');
{
  const now=Date.parse('2026-09-24T12:00:00.000Z');
  ok(V.sanitizeEntry({id:'fx01'},now)===null,'ungültige ID (kurz) → verworfen');
  ok(V.sanitizeEntry({id:'GHIJKLMNGHIJKLMN'},now)===null,'ungültige ID (kein hex) → verworfen');
  ok(V.sanitizeEntry({id:'0123456789ABCDEF'},now).id==='0123456789abcdef','ID wird lowercased');
  const x=V.sanitizeEntry({id:'0123456789abcdef',title:'<img src=x onerror=alert(1)>',body:'a'.repeat(200000),items:{},cat:123,fav:'yes',pinned:1,md:'true',created:'kaputt',updated:'2030-01-01T00:00:00.000Z',__proto__:{x:1},constructor:'y'},now);
  ok(x.title==='<img src=x onerror=alert(1)>'&&x.cat===''&&Array.isArray(x.items)&&x.items.length===0,'Typen erzwungen (Strings bleiben Strings, Rest leer) — Escaping macht der Renderer');
  ok(x.body.length===V.CAPS.body&&V.CAPS.body===100000,'body auf 100.000 gekürzt');
  ok(x.fav===false&&x.pinned===false&&x.md===false,'fav/pinned/md nur echtes true');
  ok(Date.parse(x.updated)<=now+120000,'Zukunfts-updated auf now+2min geklemmt: '+x.updated);
  ok(x.created===x.updated,'created ungültig → = updated');
  ok(!Object.prototype.hasOwnProperty.call(x,'constructor')&&Object.keys(x).length===FIELDS,'nur Whitelist-Felder ('+FIELDS+')');
  const y=V.sanitizeEntry({id:'0123456789abcdef',title:'x',updated:'nope'},now); ok(y.updated==='1970-01-01T00:00:00.000Z','ungültiges updated → Epoche (gewinnt nie)');
  const t=V.sanitizeEntry({id:'0123456789abcdef',title:'geheim',body:'geheim',deleted:'2026-02-01T00:00:00.000Z',updated:'2026-02-01T00:00:00.000Z'},now);
  ok(t.deleted&&t.title==='geheim'&&t.body==='geheim'&&Object.keys(t).length===FIELDS,'Papierkorb: Inhalt überlebt das Laden, '+FIELDS+' Felder');
  { const w=V.tombFrom(t); ok(w.title===''&&w.body===''&&w.items.length===0&&w.deleted===t.deleted&&V.isWiped(w),'tombFrom() ist inhaltsleer, behält die Zeitstempel und gilt als gewipt'); }
  const t2=V.sanitizeEntry({id:'0123456789abcdef',title:'x',deleted:true,updated:'2026-02-01T00:00:00.000Z'},now); ok(t2.deleted==='2026-02-01T00:00:00.000Z','deleted=true ohne Datum → updated');
  const nl=V.sanitizeEntry(E({body:'Zeile 1\r\n\tZeile 2\n\nZeile 4\rEnde'}),now); ok(nl.body==='Zeile 1\n\tZeile 2\n\nZeile 4\nEnde','body behält Zeilenumbrüche und Tabs (roh, nur gekappt); CRLF/CR → LF kanonisch (Audit run-1 #8)');
  // TOTP (Aegis-Hürde)
  ok(V.normalizeTotp('JBSWY3DPEHPK3PXP').secret==='JBSWY3DPEHPK3PXP','Base32 normalisiert');
  ok(V.normalizeTotp('jbsw y3dp ehpk 3pxp').secret==='JBSWY3DPEHPK3PXP','Base32 mit Leerzeichen/klein');
  const u=V.normalizeTotp('otpauth://totp/Proton:alien%40proton.me?secret=JBSWY3DPEHPK3PXP&issuer=Proton&algorithm=SHA256&digits=8&period=60');
  ok(u&&u.algorithm==='SHA256'&&u.digits===8&&u.period===60&&u.issuer==='Proton'&&u.label==='Proton:alien@proton.me','otpauth-URI geparst');
  ok(V.normalizeTotp('otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&digits=9')===null,'digits=9 abgelehnt');
  ok(V.normalizeTotp('otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&period=0')===null,'period=0 abgelehnt');
  ok(V.normalizeTotp('otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP')===null,'hotp abgelehnt');
  ok(V.normalizeTotp('nicht-base32-!!')===null,'kaputt → null');
  ok(V.normalizeTotp({secret:'JBSWY3DPEHPK3PXP',algorithm:'sha-512',digits:'7',period:'45'}).algorithm==='SHA512','Objektform + Normalisierung');
  ok(V.normalizeTotp(V.otpauthUri(u)).period===60,'otpauthUri round-trip');
  ok(V.otpauthUri({secret:'JBSWY3DPEHPK3PXP',algorithm:'SHA1',digits:6,period:30,issuer:'',label:''}).startsWith('otpauth://totp/Alien%20Notes?'),'otpauthUri: Standard-Label „Alien Notes“');
  // sanitizeVault + Settings (neue Defaults: Idle aus, Hintergrund 30 min, Stufe „nie“, FLAG_SECURE an)
  const sv=V.sanitizeVault({version:9,entries:[E({id:'0123456789abcdef'}),E({id:'0123456789abcdef',updated:'2026-05-05T00:00:00.000Z'}),{id:'bad'}],settings:{autolock:99,bgLock:30,clipClear:'60',secure:'0'},meta:{lastBackup:'x'}},now);
  ok(sv.entries.length===1&&sv.entries[0].updated==='2026-05-05T00:00:00.000Z','Dubletten im Vault dedupliziert (neuere gewinnt), ungültige verworfen');
  ok(sv.settings.autolock===0&&sv.settings.bgLock===1800&&sv.settings.clipClear===60&&sv.settings.secure===0,'Settings validiert (99→Default 0, 30 s nicht erlaubt→Default 1800, "60"→60, "0"→FLAG_SECURE aus)');
  ok(sv.meta.lastBackup===null&&sv.version===1,'meta/version bereinigt');
  const d=V.sanitizeSettings(undefined); ok(d.autolock===0&&d.bgLock===1800&&d.clipClear===30&&d.secure===1&&Object.keys(d).length===4,'Defaults: Idle aus, Hintergrund 30 min, Zwischenablage 30 s, FLAG_SECURE an');
  ok(V.sanitizeSettings({bgLock:V.BG_NEVER}).bgLock===V.BG_NEVER&&V.BG_NEVER===-1,'Stufe „nie“ (BG_NEVER=-1) ist erlaubt');
  ok(V.sanitizeSettings({bgLock:-2}).bgLock===1800&&V.sanitizeSettings({secure:2}).secure===1,'unbekannte Werte fallen auf den Default');
  ok(JSON.stringify(V.SETTINGS_ALLOWED.bgLock)==='[0,60,300,1800,-1]'&&JSON.stringify(V.SETTINGS_ALLOWED.autolock)==='[0,1,2,5,15]','Auswahl Hintergrund: sofort / 1 / 5 / 30 min / nie');
  ok(V.emptyVault().settings.autolock===0&&V.emptyVault().totp===null,'emptyVault: Idle aus, keine Hürde');
  let threw=false; try{ V.sanitizeEntries(Array.from({length:V.MAX_ENTRIES+1},()=>E({})),now); }catch(e){ threw=e.message==='toomany'; } ok(threw,'>'+V.MAX_ENTRIES+' Einträge → toomany');
  ok(V.MAX_ENTRIES===5000&&V.MAX_FILE_BYTES===20*1024*1024&&V.MAX_READ_BYTES===40*1024*1024,'MAX_ENTRIES 5.000, Datei ≤ 20 MB (Schreiben), Lesen bis 40 MB');
}

console.log('\n[5] Merge (LWW, Tombstones, Kommutativität, Idempotenz)');
{
  const id1='1111111111111111', id2='2222222222222222', id3='3333333333333333', id4='4444444444444444';
  const A=[E({id:id1,title:'lokal-alt',updated:'2026-01-01T00:00:00.000Z'}), E({id:id2,title:'lokal-neu',updated:'2026-03-01T00:00:00.000Z'}), E({id:id3,title:'nur-lokal'})];
  const B=[E({id:id1,title:'fremd-neu',updated:'2026-02-01T00:00:00.000Z'}), E({id:id2,title:'fremd-alt',updated:'2026-02-01T00:00:00.000Z'}), E({id:id4,title:'nur-fremd'})];
  const m=V.mergeEntries(A,B); const by=id=>m.entries.find(e=>e.id===id);
  ok(by(id1).title==='fremd-neu','neuere fremde Änderung gewinnt');
  ok(by(id2).title==='lokal-neu','neuere lokale Änderung bleibt');
  ok(by(id3)&&by(id4)&&m.entries.length===4,'nur-lokal + nur-fremd beide da');
  ok(m.added===1&&m.updated===1&&m.deleted===0,'Zähler: 1 neu, 1 aktualisiert, 0 gelöscht');
  const mBA=V.mergeEntries(B,A); ok(JSON.stringify(m.entries.map(V.canon).sort())===JSON.stringify(mBA.entries.map(V.canon).sort()),'A⊕B == B⊕A');
  const m2=V.mergeEntries(m.entries,B); ok(m2.added===0&&m2.updated===0&&m2.deleted===0&&m2.entries.length===4,'Re-Import idempotent');
  const tsN=V.tombstone(A[0],'2026-04-01T00:00:00.000Z'); const m3=V.mergeEntries([E({id:id1,title:'edit',updated:'2026-03-15T00:00:00.000Z'})],[tsN]);
  ok(m3.entries[0].deleted&&m3.deleted===1,'neuerer Tombstone schlägt ältere Änderung');
  const m4=V.mergeEntries([E({id:id1,title:'edit',updated:'2026-05-01T00:00:00.000Z'})],[tsN]); ok(!m4.entries[0].deleted&&m4.entries[0].title==='edit','neuere Änderung schlägt älteren Tombstone');
  const p1=E({id:id1,title:'aaa',updated:'2026-06-01T00:00:00.000Z'}), p2=E({id:id1,title:'bbb',updated:'2026-06-01T00:00:00.000Z'});
  ok(V.mergeEntries([p1],[p2]).entries[0].title===V.mergeEntries([p2],[p1]).entries[0].title,'Gleichstand: beide Seiten gleiches Ergebnis');
  const tsE=V.tombstone(p1,'2026-06-01T00:00:00.000Z'); ok(V.mergeEntries([p2],[tsE]).entries[0].deleted&&V.mergeEntries([tsE],[p2]).entries[0].deleted,'Gleichstand: Tombstone gewinnt beidseitig');
  const m5=V.mergeEntries([E({id:id1,title:'gut',updated:'2026-01-01T00:00:00.000Z'})],[V.sanitizeEntry(E({id:id1,title:'böse',updated:'kaputt'}))]); ok(m5.entries[0].title==='gut','Eintrag ohne gültiges updated gewinnt nie');
  const m6=V.mergeEntries([],[E({id:id1,title:'v1',updated:'2026-01-01T00:00:00.000Z'}),E({id:id1,title:'v2',updated:'2026-02-01T00:00:00.000Z'})]); ok(m6.entries.length===1&&m6.entries[0].title==='v2'&&m6.added===1,'Dubletten innerhalb der Importdatei dedupliziert');
  const old=V.tombstone(A[0],'2024-01-01T00:00:00.000Z'), fresh=V.tombstone(A[1],new Date().toISOString());
  const pg=V.purgeTombstones([old,fresh,A[2]]); ok(pg.length===2&&!pg.find(e=>e.id===id1),'Tombstone >365 Tage gepurgt, frischer bleibt');
}

console.log('\n[6] TOTP RFC-6238-Testvektoren');
{
  const seed=(n)=>{ let s=''; while(s.length<n) s+='12345678901234567890'; return s.slice(0,n); };
  const vec=[[59,'94287082','SHA1',20],[1111111109,'07081804','SHA1',20],[1234567890,'89005924','SHA1',20],[2000000000,'69279037','SHA1',20],[20000000000,'65353130','SHA1',20],
             [59,'46119246','SHA256',32],[1111111109,'68084774','SHA256',32],[20000000000,'77737706','SHA256',32],
             [59,'90693936','SHA512',64],[1111111109,'25091201','SHA512',64],[20000000000,'47863826','SHA512',64]];
  for(const [t,exp,alg,len] of vec){ const totp={secret:V.base32Encode(new TextEncoder().encode(seed(len))),algorithm:alg,digits:8,period:30}; const got=await V.totpCode(totp,t*1000); ok(got===exp,`T=${t} ${alg} → ${got}`); }
  const six=await V.totpCode({secret:V.base32Encode(new TextEncoder().encode(seed(20))),algorithm:'SHA1',digits:6,period:30},59000); ok(six==='287082','6 Stellen = letzte 6 der 8');
  ok(V.totpRemaining({period:30},59000)===1,'Restlaufzeit bei T=59 → 1 s');
}

console.log('\n[7] Passphrase: Würfelwörter, Zufall, Stärke-Schätzung');
{
  const w=V.genWords(6,'-',false,false); ok(w.pw.split('-').length===6&&w.pw.split('-').every(x=>words.includes(x))&&w.bits===78,'6 EFF-Wörter, 78 Bit: '+w.pw);
  const w2=V.genWords(4,' ',true,true); ok(w2.pw.split(' ').length===4&&/[A-Z]/.test(w2.pw)&&/\d/.test(w2.pw),'Großschreibung + Ziffer: '+w2.pw);
  const cnt=new Array(10).fill(0); for(let i=0;i<100000;i++) cnt[V.randInt(10)]++; const chi=cnt.reduce((s,c)=>s+Math.pow(c-10000,2)/10000,0); ok(chi<27.9,'randInt gleichverteilt (χ²='+chi.toFixed(1)+' < 27.9 bei 9 df, p=0.001)');
  ok(V.passStrength('kurz')===0&&V.passStrength('zwoelf-zeichen')>=1&&V.passStrength('korrekt-pferd-batterie-heftklammer')===3,'Passphrase-Meter Stufen');
  for(const [pw,why] of [['Sommer2024Sommer','common'],['passwort12345!','common'],['ichliebedich12345','common'],['aaaaaaaaaaaaaaaaaaaaaaaa','repeat'],
      ['qwertz123456','keyboard'],['123456789012','digits'],['P4ssw0rt2024!','common'],['abababababab','variety'],['0987654321abcd','seq']]){
    const c=V.passCheck(pw); ok(c.weak&&c.level===0&&c.why.includes(why),'vorhersagbar: '+pw+' → '+c.why.join(',')); }
  { const c=V.passCheck('Hund-Katze-Maus-2024'); ok(c.level===1&&!c.weak&&c.why.includes('year'),'Wörter-Bonus greift nicht bei billigen Wörtern: Stufe '+c.level); }
  ok(!V.passCheck('kurz123').weak&&V.passCheck('kurz123').level===0,'kurz ohne Muster: nicht „vorhersagbar“ (dafür gibt es „kurz“)');
  ok(V.passCheck('Xk9#mP2$vL7qR4!nT8wZ').level>=2&&!V.passCheck('Xk9#mP2$vL7qR4!nT8wZ').weak,'Zufallspasswort bleibt stark');
  ok(V.passCheck('a'.repeat(1000)).weak&&V.passCheck('Xk9#mP2$vL7qR4!n'.repeat(60)).level===3,'lange Eingaben: Analyse auf 64 Zeichen, Rest zählt voll');
  for(const g of ['t8pBj1+6Tqqq',']An&U_A$1927','8sDfg(N..M@l','MYe-bv7654,U']){ const c=V.passCheck(g); ok(!c.weak&&c.level===1,'12 Zeichen zufällig mit einem einzelnen Muster ('+g+'): nicht vorhersagbar, Stufe 1'); }
  { let bad=0; for(let i=0;i<300;i++){ const x=V.genWords(6,'-',false,false).pw; if(V.passCheck(x).weak||V.passCheck(x).level!==3) bad++; }
    ok(bad===0,'6 Würfelwörter (300×): nie vorhersagbar, immer sehr stark'); }
}

console.log('\n[8] Audit-Fixes (Alien Pass): Tombstone-Cap, Live-Cap, canon() verschachtelt');
{
  const now=Date.now(); const T=(i,ageDays)=>({id:(1e15+i).toString(16).padStart(16,'0').slice(-16),type:'text',cat:'',title:'',body:'',items:[],fav:false,pinned:false,md:false,created:new Date(now-ageDays*86400000).toISOString(),updated:new Date(now-ageDays*86400000).toISOString(),deleted:new Date(now-ageDays*86400000).toISOString()});
  const L=(i)=>E({id:(2e15+i).toString(16).padStart(16,'0').slice(-16),title:'L'+i});
  const flood=[...Array.from({length:9990},(_,i)=>T(i,i%300)), ...Array.from({length:10},(_,i)=>L(i))];
  let d=null, threw=false; try{ d=V.sanitizeEntries(flood,now); }catch(e){ threw=true; }
  ok(!threw&&d&&V.liveCount(d)===10,'Tombstone-Flut: Unlock wirft nicht, 10 Live-Einträge bleiben');
  ok(d.filter(e=>e.deleted).length===V.MAX_TOMBSTONES,'Tombstones auf MAX_TOMBSTONES ('+V.MAX_TOMBSTONES+') gekappt');
  const keptAges=d.filter(e=>e.deleted).map(e=>Math.round((now-Date.parse(e.deleted))/86400000)); ok(Math.max(...keptAges)<=Math.min(...flood.filter(e=>e.deleted).map(e=>Math.round((now-Date.parse(e.deleted))/86400000)).sort((a,b)=>b-a).slice(0,9990-V.MAX_TOMBSTONES)),'älteste Tombstones weichen zuerst');
  d=V.sanitizeEntries([...Array.from({length:V.MAX_ENTRIES},(_,i)=>L(i)),...Array.from({length:500},(_,i)=>T(i,1))],now); ok(V.liveCount(d)===V.MAX_ENTRIES,V.MAX_ENTRIES+' live + 500 Tombstones: ok');
  threw=false; try{ V.sanitizeEntries(Array.from({length:V.MAX_ENTRIES+1},(_,i)=>L(i)),now); }catch(e){ threw=e.message==='toomany'; } ok(threw,(V.MAX_ENTRIES+1)+' live → toomany');
  threw=false; try{ V.sanitizeEntries(Array.from({length:V.MAX_ENTRIES*4+1},(_,i)=>T(i,1)),now); }catch(e){ threw=e.message==='toomany'; } ok(threw,'Liste > 4×MAX_ENTRIES → toomany vor jeder Arbeit');
  const m=V.mergeEntries([L(1)],[T(5,0),T(6,0)]); ok(m.tombstonesIn===2&&m.added===0,'mergeEntries meldet tombstonesIn=2');
  // canon() verschachtelt: nur-Haken-Unterschied in einer Checkliste bei gleichem updated ist kommutativ
  const A=E({id:'abababababababab',type:'list',updated:'2026-06-01T00:00:00.000Z',items:[{text:'Milch',done:false}]}), B=E({id:'abababababababab',type:'list',updated:'2026-06-01T00:00:00.000Z',items:[{text:'Milch',done:true}]});
  ok(V.canon(A)!==V.canon(B),'canon() unterscheidet verschachtelte items-Objekte');
  ok(V.mergeEntries([A],[B]).entries[0].items[0].done===V.mergeEntries([B],[A]).entries[0].items[0].done,'Merge bei nur-Haken-Unterschied kommutativ');
  ok(V.canon({b:1,a:{d:[1,{z:1,y:2}],c:null}})==='{"a":{"c":null,"d":[1,{"y":2,"z":1}]},"b":1}','canon() sortiert rekursiv, Arrays in Reihenfolge');
}

console.log('\n[9] Notizen-Modell: Typen text/list, Checklisten-Zeilen, Markdown-Schalter, Pin, Kategorie');
{
  const now=Date.now();
  const n=V.sanitizeEntry(E({type:'text',cat:'  Privat ',body:'Zeile 1\nZeile 2',items:[{text:'weg',done:true}],md:true,pinned:true}),now);
  ok(n.type==='text'&&n.cat==='Privat'&&n.body==='Zeile 1\nZeile 2'&&n.items.length===0&&n.md===true&&n.pinned===true,'Notiz: body, md, pinned tragen; items geleert; Kategorie getrimmt');
  const l=V.sanitizeEntry(E({type:'list',body:'weg',md:true,items:[{text:' Milch ',done:true},{text:'Brot',done:'ja'},{text:'',done:true},'x',null,{done:true},{text:'Eier'}]}),now);
  ok(l.type==='list'&&l.body===''&&l.md===false,'Checkliste: body geleert, md immer false (nichts zu rendern)');
  ok(l.items.length===3&&l.items[0].text==='Milch'&&l.items[0].done===true&&l.items[1].text==='Brot'&&l.items[1].done===false&&l.items[2].text==='Eier'&&l.items[2].done===false,'items: getrimmt, done nur echtes true, leere/kaputte Zeilen fallen weg, Reihenfolge bleibt');
  ok(l.items.every(i=>Object.keys(i).length===2),'jede Zeile hat genau {text,done}');
  const NUL=String.fromCharCode(0), RLO=String.fromCharCode(0x202e);
  ok(V.sanitizeItems([{text:'A'+NUL+'\n\nB '+RLO+'C'}])[0].text==='A B C','Checklisten-Zeile läuft durch line(): Steuer-/Bidi-Zeichen raus, einzeilig');
  ok(V.sanitizeItems([{text:'x'.repeat(600)}])[0].text.length===V.CAPS.item&&V.CAPS.item===500,'Zeile auf 500 Zeichen gekappt');
  ok(V.sanitizeItems(Array.from({length:V.ITEMS_MAX+50},(_,i)=>({text:'Z'+i}))).length===V.ITEMS_MAX&&V.ITEMS_MAX===200,'höchstens 200 Zeilen');
  ok(V.sanitizeItems('nope').length===0&&V.sanitizeItems(null).length===0&&V.sanitizeItems({}).length===0,'kaputte items → [] (nie null)');
  const u=V.sanitizeEntry(E({type:'bogus',cat:'a'.repeat(100),body:'b'}),now);
  ok(u.type==='text'&&u.body==='b'&&u.cat.length===40,'unbekannter Typ → text; cat auf 40 gekappt');
  // „Keine Vorschau“ (v1.1 Punkt 6): 13. Feld hide, nur echtes true, für beide Typen, Tombstone false, Signatur-relevant im Editor
  ok(V.sanitizeEntry(E({type:'text',body:'x',hide:true}),now).hide===true&&V.sanitizeEntry(E({type:'list',items:[{text:'a'}],hide:true}),now).hide===true&&V.sanitizeEntry(E({type:'text',body:'x',hide:'ja'}),now).hide===false&&V.sanitizeEntry(E({type:'text',body:'x'}),now).hide===false,'hide: nur echtes true, beide Typen, Vorgabe false');
  ok(V.tombFrom(V.sanitizeEntry(E({type:'text',body:'x',hide:true}),now)).hide===false&&V.isWiped(V.tombFrom(V.sanitizeEntry(E({type:'text',body:'x',hide:true,deleted:'2026-01-03T00:00:00.000Z'}),now))),'tombFrom: hide false, gewipt');
  ok(V.dupKey(V.sanitizeEntry(E({type:'text',body:'x',hide:true}),now))===V.dupKey(V.sanitizeEntry(E({type:'text',body:'x'}),now)),'dupKey ignoriert hide (wie fav/pinned/md)');
  { const j=V.bodyJson({entries:[V.sanitizeEntry(E({type:'text',body:'x',title:'hide'}),now),V.sanitizeEntry(E({type:'text',body:'x',hide:true}),now)],settings:{hide:false}});
    ok(!j.includes('"hide":false')&&j.includes('"hide":true')&&j.includes('"title":"hide"')&&(j.match(/"hide"/g)||[]).length===2,'Datei-JSON: hide nur wenn wahr (bestehende Notizen bleiben byteidentisch), Werte „hide“ unberührt');
    const back=V.sanitizeVault(JSON.parse(j),now); ok(back.entries[0].hide===false&&back.entries[1].hide===true&&Object.keys(back.entries[0]).length===FIELDS,'gelesen: fehlt = false, '+FIELDS+' Felder'); }
  ok(JSON.stringify(V.ENTRY_TYPES)==='["text","list"]'&&V.entryType('list')==='list'&&V.entryType('login')==='text','ENTRY_TYPES = text|list, alles andere → text');
  // Tombstone: für JEDEN Typ dieselbe Feldmenge wie sanitizeEntry (Muster Alien Pass Test [10])
  for(const type of ['text','list']){
    const x=V.sanitizeEntry(E({type,body:'b',items:[{text:'a'}],cat:'c',fav:true,pinned:true,md:true,deleted:'2026-02-01T00:00:00.000Z',updated:'2026-02-01T00:00:00.000Z'}),now), w=V.tombFrom(x);
    ok(Object.keys(w).length===FIELDS&&Object.keys(w).sort().join()===Object.keys(x).sort().join()&&w.type==='text'&&w.body===''&&w.items.length===0&&!w.fav&&!w.pinned&&!w.md,
       'tombFrom() zu Typ '+type+': dieselben '+FIELDS+' Felder, restlos leer, Typ text'); }
  // Merge behält Pin/Markdown-Zustand des Gewinners
  const p=V.mergeEntries([E({id:'5555555555555555',pinned:false,updated:'2026-01-01T00:00:00.000Z'})],[E({id:'5555555555555555',pinned:true,md:true,updated:'2026-02-01T00:00:00.000Z'})]).entries[0];
  ok(p.pinned===true&&p.md===true&&V.mergeEntries([],[p]).entries[0].pinned===true,'Merge: pinned/md reisen mit dem neueren Stand');
}

console.log('\n[10] Dubletten-Schlüssel, Textsäuberung, Merge-Kommutativität (Audit run-2)');
{
  const NUL=String.fromCharCode(0), ZW=String.fromCharCode(0x200b), RLO=String.fromCharCode(0x202e);
  const base={id:'0123456789abcdef',type:'text',title:'Einkauf',body:'Milch\nBrot',items:[],cat:'Privat',fav:false,pinned:false,md:false,created:'2026-01-01T00:00:00.000Z',updated:'2026-01-02T00:00:00.000Z',deleted:null};
  const a=V.sanitizeEntry(base);
  ok(V.dupKey(a)===V.dupKey(V.sanitizeEntry(Object.assign({},base,{id:'fedcba9876543210',fav:true,pinned:true,md:true,updated:'2026-05-01T00:00:00.000Z'}))),'gleicher Inhalt, andere id/fav/pinned/md/Zeit → Dublette (Re-Import bleibt erkannt)');
  ok(V.dupKey(a)!==V.dupKey(V.sanitizeEntry(Object.assign({},base,{body:'Milch\nBrot\nEier'}))),'anderer body → keine Dublette');
  ok(V.dupKey(a)!==V.dupKey(V.sanitizeEntry(Object.assign({},base,{cat:'Arbeit'}))),'andere Kategorie → keine Dublette (Konzept: cat gehört zum Inhalt)');
  ok(V.dupKey(a)!==V.dupKey(V.sanitizeEntry(Object.assign({},base,{type:'list',items:[{text:'Milch'},{text:'Brot'}]}))),'Notiz und Checkliste mit gleichem Titel sind keine Dubletten');
  const c1=V.sanitizeEntry(Object.assign({},base,{type:'list',items:[{text:'Milch',done:false}]})), c2=V.sanitizeEntry(Object.assign({},base,{type:'list',items:[{text:'Milch',done:true}]}));
  ok(V.dupKey(c1)!==V.dupKey(c2),'Checklisten, die sich nur im Haken unterscheiden, sind keine Dubletten');
  ok(V.dupKey(c1)!==V.dupKey(V.sanitizeEntry(Object.assign({},base,{type:'list',items:[{text:'Brot'},{text:'Milch'}]}))),'Reihenfolge der Zeilen zählt');
  ok(!V.dupKey(a).includes('"id"')&&!V.dupKey(a).includes('updated')&&!V.dupKey(a).includes('pinned'),'dupKey enthält weder id noch Zeit noch pinned');
  const cleaned=V.line('  '+NUL+'Bank'+ZW+' '+RLO+'X\n\nY  ',40); ok(cleaned==='Bank X Y','line(): Steuer-/Nullbreiten-/Bidi-Zeichen raus, Whitespace kollabiert: '+JSON.stringify(cleaned));
  const t=V.sanitizeEntry(Object.assign({},base,{title:'Harmlos\n\nOK = Abbrechen',cat:NUL})); ok(t.title==='Harmlos OK = Abbrechen'&&t.cat==='','Titel ohne Zeilenumbrüche, NUL-Kategorie wird leer');
  const b=V.sanitizeEntry(Object.assign({},base,{body:'A'+NUL+'B'})); ok(b.body==='A'+NUL+'B','body bleibt roh (Renderer nutzt textContent) — wie notes in Alien Pass');
  const L1=V.sanitizeEntry(Object.assign({},base,{title:'ALT',updated:'2026-01-02T00:00:00.000Z'})), L2=V.sanitizeEntry(Object.assign({},base,{title:'NEU',updated:'2026-02-02T00:00:00.000Z'})), I=V.sanitizeEntry(Object.assign({},base,{title:'MITTE',updated:'2026-01-15T00:00:00.000Z'}));
  const m1=V.mergeEntries([L1,L2],[I]).entries[0].title, m2=V.mergeEntries([L2,L1],[I]).entries[0].title; ok(m1==='NEU'&&m2==='NEU','mergeEntries dedupliziert local per winner() (Reihenfolge egal)');
}

console.log('\n[11] Fingerabdruck-Slot (Rolle bio, Blob-Format, Schlüssel-Länge, wrapTag für die PIN-Pforte)');
{
  const kdf=Object.assign({},KDF_TEST,{salt:V.rand(16)});
  const kek=await V.deriveKek(V.passBytes('pp-bio-test-passphrase'),kdf);
  const dekX=await V.newDek(); const wrap=await V.wrapDek(dekX,kek,kdf);
  const secret=V.rand(32); const bk=await V.bioKey(secret);
  const blob=await V.wrapDek(dekX,bk,kdf,'bio');
  ok(blob.ct.length===48&&blob.iv.length===12,'bio-Wrap hat dieselbe Groesse wie der Passphrase-Wrap');
  const raw=V.serializeBioBlob(blob, wrap.ct); const back=V.parseBioBlob(raw);
  ok(back&&back.w===V.bufToB64(wrap.ct),'Blob trägt den Passphrase-Wrap (w) — Bindung an den Slot der Datei (run-3 #3)');
  ok(V.parseBioBlob(JSON.stringify({iv:V.bufToB64(blob.iv),ct:V.bufToB64(blob.ct)}))===null,'Blob ohne w → null');
  let badW=false; try{ V.serializeBioBlob(blob, V.rand(47)); badW=true; }catch(e){ ok(e.message==='bioblob','serializeBioBlob verlangt 48-Byte-Wrap'); } ok(!badW,'falsche Wrap-Länge wirft');
  ok(back&&V.bufToB64(back.ct)===V.bufToB64(blob.ct)&&V.bufToB64(back.iv)===V.bufToB64(blob.iv),'serializeBioBlob/parseBioBlob Roundtrip');
  ok(raw.length<512&&!raw.includes(V.bufToB64(secret)),'Blob enthaelt den Zufallsschluessel nicht');
  const dek=await V.unwrapDek(back,bk,kdf,false,'bio'); const body=await V.encryptBody(V.emptyVault(),dek,kdf);
  const dek2=await V.unwrapDek(wrap,kek,kdf,false); const v=await V.decryptBody(body,dek2,kdf); ok(v&&v.version===1,'per bio ausgepackter DEK == Passphrase-DEK (Body wechselseitig lesbar)');
  let crossed=false; try{ await V.unwrapDek(back,bk,kdf,false,'wrap'); crossed=true; }catch(_){ } ok(!crossed,'Rolle bio ist nicht als Passphrase-Slot nutzbar (AAD trennt)');
  let crossed2=false; try{ await V.unwrapDek(wrap,bk,kdf,false,'bio'); crossed2=true; }catch(_){ } ok(!crossed2,'Passphrase-Wrap ist mit dem bio-Schluessel nicht auspackbar');
  const kdf2=Object.assign({},kdf,{salt:V.rand(16)}); let other=false; try{ await V.unwrapDek(back,bk,kdf2,false,'bio'); other=true; }catch(_){ } ok(!other,'bio-Blob ist an den Datei-Header (Salt) gebunden — fremder/neuer Tresor scheitert');
  ok(V.parseBioBlob('{"iv":"AAAA","ct":"AAAA"}')===null&&V.parseBioBlob('nope')===null&&V.parseBioBlob(null)===null&&V.parseBioBlob(JSON.stringify({iv:V.bufToB64(blob.iv),ct:V.bufToB64(blob.ct),w:V.bufToB64(wrap.ct),x:1}))!==null,'parseBioBlob: falsche Laengen/Formate → null, Fremdfelder ignoriert');
  ok(V.parseBioBlob('{'+'"a":1,'.repeat(200)+'}')===null,'parseBioBlob: Uebergroesse → null');
  let bad=false; try{ await V.bioKey(V.rand(16)); bad=true; }catch(e){ ok(e.message==='biokey','bioKey verlangt genau 32 Byte'); } ok(!bad,'bioKey(16 Byte) wirft');
  const raw2=V.serializeBioBlob(blob, wrap.ct, wrap.iv); const back2=V.parseBioBlob(raw2);
  ok(back2&&back2.wi===V.bufToB64(wrap.iv)&&back2.w===V.bufToB64(wrap.ct),'Blob trägt auch die Wrap-IV (wi)');
  ok(back&&back.wi===null&&V.bioWrapOk(back,wrap),'Blob ohne wi gilt weiter: bioWrapOk prüft nur den Ciphertext');
  ok(V.bioWrapOk(back2,wrap),'bioWrapOk: unveränderter Wrap passt');
  { const iv2=new Uint8Array(wrap.iv); iv2[0]^=1; ok(!V.bioWrapOk(back2,{iv:iv2,ct:wrap.ct}),'bioWrapOk: gekippte IV → Mismatch'); ok(V.bioWrapOk(back,{iv:iv2,ct:wrap.ct}),'alter Blob ohne wi kann die IV nicht prüfen (dokumentierter Übergang)'); }
  { const ct2=new Uint8Array(wrap.ct); ct2[5]^=1; ok(!V.bioWrapOk(back2,{iv:wrap.iv,ct:ct2})&&!V.bioWrapOk(back,{iv:wrap.iv,ct:ct2}),'bioWrapOk: gekippter Ciphertext → Mismatch, alt und neu'); }
  ok(V.parseBioBlob(JSON.stringify({iv:V.bufToB64(blob.iv),ct:V.bufToB64(blob.ct),w:V.bufToB64(wrap.ct),wi:'AAAA'}))===null,'parseBioBlob: wi mit falscher Länge → null');
  let badWi=false; try{ V.serializeBioBlob(blob, wrap.ct, V.rand(11)); badWi=true; }catch(e){ ok(e.message==='bioblob','serializeBioBlob verlangt 12-Byte-IV'); } ok(!badWi,'falsche IV-Länge wirft');
  const tag=V.wrapTag(kdf,wrap);
  ok(typeof tag==='string'&&tag.startsWith('AINV1|')&&tag.includes(V.bufToB64(wrap.iv))&&tag.includes(V.bufToB64(wrap.ct))&&tag.includes(V.bufToB64(kdf.salt))&&tag.includes('|'+kdf.m+'|'+kdf.t+'|'+kdf.p+'|'),'wrapTag bindet Magic, Salz, m/t/p, IV und Ciphertext');
  { const iv2=new Uint8Array(wrap.iv); iv2[11]^=1; ok(V.wrapTag(kdf,{iv:iv2,ct:wrap.ct})!==tag,'wrapTag: IV verändert → anderes Tag'); }
  ok(V.wrapTag(Object.assign({},kdf,{t:kdf.t+1}),wrap)!==tag,'wrapTag: Header (t) verändert → anderes Tag (Audit run-8 #10)');
  ok(V.wrapTag(Object.assign({},kdf,{salt:V.rand(16)}),wrap)!==tag,'wrapTag: Salz verändert → anderes Tag');
  ok(V.wrapTag(kdf,{iv:new Uint8Array(wrap.iv),ct:new Uint8Array(wrap.ct)})===tag,'wrapTag: gleiche Bytes → gleiches Tag (deterministisch)');
  const bk2=await V.bioKey(V.rand(32)); ok(bk2.extractable===false&&bk2.usages.join()==='wrapKey,unwrapKey','bio-Schluessel nicht extrahierbar, nur wrap/unwrap');
  const dekW=await V.unwrapDek(wrap,kek,kdf,false); let noWrap=false; try{ await V.wrapDek(dekW,bk,kdf,'bio'); noWrap=true; }catch(_){ } ok(!noWrap,'nicht extrahierbarer Sitzungs-DEK laesst sich NICHT erneut verpacken (Aktivieren braucht die Passphrase)');
}

console.log('\n[12] Papierkorb (sanitizeEntry behält Inhalt, tombFrom/isWiped, wipeTrash, winner, Konvergenz)');
{
  const DAY=86400000, now=Date.now();
  const iso=d=>new Date(now-d*DAY).toISOString(), tsOf=v=>Date.parse(v)||0;
  const del=(o,d)=>V.sanitizeEntry(E(Object.assign({deleted:iso(d), updated:iso(d)},o)), now);

  const t1=del({type:'text', title:'Einkauf', body:'geheim', cat:'Privat', md:true, pinned:true},1);
  ok(t1.deleted&&t1.title==='Einkauf'&&t1.body==='geheim'&&t1.cat==='Privat'&&t1.md===true&&t1.pinned===true&&Object.keys(t1).length===FIELDS,
     'gelöschte Notiz behält Titel/Text/Kategorie/md/pinned, '+FIELDS+' Felder');
  const t1b=del({type:'list', items:[{text:' Milch ',done:true},{text:'Brot'}]},1);
  ok(t1b.type==='list'&&t1b.items.length===2&&t1b.items[0].text==='Milch'&&t1b.items[0].done===true,'gelöschte Checkliste behält Typ und normalisierte Zeilen');
  const fut=V.sanitizeEntry(E({deleted:new Date(now+400*DAY).toISOString(), updated:'2026-01-02T00:00:00.000Z'}), now);
  ok(Date.parse(fut.deleted)<=now+120000,'Zukunfts-deleted auf now+2min geklemmt (fremde Datei kann die Frist nicht verschieben): '+fut.deleted);
  const t1d=V.sanitizeEntry(Object.assign(E({deleted:iso(1)}),{fremdfeld:'weg', __proto__:{polluted:1}}), now);
  ok(!Object.prototype.hasOwnProperty.call(t1d,'fremdfeld')&&Object.keys(t1d).length===FIELDS,'Fremdfeld auch am gelöschten Eintrag verworfen, '+FIELDS+' Felder');
  ok(del({body:'n'.repeat(200000)},1).body.length===V.CAPS.body,'Caps greifen auch am gelöschten Eintrag (body gekürzt)');

  const w1=V.tombFrom(t1);
  ok(w1.created===t1.created&&w1.updated===t1.updated&&w1.deleted===t1.deleted&&w1.title===''&&w1.body===''&&w1.items.length===0&&Object.keys(w1).length===FIELDS,
     'tombFrom() übernimmt created/updated/deleted, leert den Rest, '+FIELDS+' Felder');
  ok(V.isWiped(w1)&&!V.isWiped(t1)&&!V.isWiped(V.sanitizeEntry(E({title:'',body:''}))),
     'isWiped: gewipt ja, Papierkorb nein, lebender Leer-Eintrag nein (deleted fehlt)');
  { const wx=V.tombFrom(del({type:'list', items:[{text:'x'}]},1));
    ok(V.canon(wx)===V.canon(V.sanitizeEntry(wx, now))&&V.isWiped(wx),'tombFrom() ist sanitizer-stabil und gilt als gewipt'); }
  for(const type of ['text','list']){
    const x=del({type, body:'b', items:[{text:'a'}], cat:'c', md:true, pinned:true, fav:true},1), wx=V.tombFrom(x);
    const leer=Object.assign({}, wx, {type:'text'});
    ok(wx.type==='text'&&wx.body===''&&wx.items.length===0&&wx.cat===''&&!wx.md&&!wx.pinned&&!wx.fav&&V.canon(wx)===V.canon(leer),
       'tombFrom() normalisiert Typ '+type+' restlos auf die leere text-Gestalt'); }
  const tb=V.tombstone(t1,'2026-03-01T00:00:00.000Z');
  ok(tb.created===t1.created&&tb.updated==='2026-03-01T00:00:00.000Z'&&tb.deleted==='2026-03-01T00:00:00.000Z'&&V.isWiped(tb)&&Object.keys(tb).length===FIELDS,
     'tombstone(): created erhalten, updated=deleted=jetzt, gewipt, '+FIELDS+' Felder');
  // Der Fall, der die Abkürzung "bei Gleichstand gewinnt der KLEINERE canon()" verbietet: inhaltslose Checkliste
  const empt=V.sanitizeEntry({id:'0123456789abcdef', type:'list', title:'', deleted:iso(1), updated:iso(1)}, now);
  ok(!V.isWiped(empt)&&V.canon(V.tombFrom(empt))>V.canon(empt)&&V.winner(V.tombFrom(empt),empt).type==='text',
     'inhaltslose Checkliste: gewipte Gestalt hat den GRÖSSEREN canon() — winner() braucht isWiped, nicht den Stringvergleich');

  const fresh=del({title:'frisch'},V.TRASH_DAYS-1), old=del({title:'alt'},V.TRASH_DAYS+1), alive=V.sanitizeEntry(E({title:'lebt'}));
  const inp=[fresh,old,alive], out=V.wipeTrash(inp, now);
  ok(out.find(e=>e.id===fresh.id)===fresh,'frischer Papierkorb-Eintrag überlebt IDENTISCH (kein neues Objekt)');
  const oldOut=out.find(e=>e.id===old.id);
  ok(V.isWiped(oldOut)&&oldOut.updated===old.updated&&oldOut.deleted===old.deleted,'abgelaufener Eintrag wird gewipt, updated und deleted bleiben unverändert');
  ok(out.find(e=>e.id===alive.id)===alive,'lebender Eintrag bleibt unangetastet');
  ok(inp[1]===old&&old.title==='alt','wipeTrash mutiert das Eingabe-Array nicht');
  ok(V.canon(V.wipeTrash(out,now))===V.canon(out)&&V.wipeTrash(V.wipeTrash(inp,now),now).length===3,'wipeTrash ist idempotent');
  { const onlyLive=[alive]; ok(V.wipeTrash(onlyLive,now)===onlyLive,"ohne Papierkorb gibt wipeTrash dasselbe Array zurück"); }
  ok(V.TRASH_DAYS<V.TOMBSTONE_DAYS,`TRASH_DAYS (${V.TRASH_DAYS}) < TOMBSTONE_DAYS (${V.TOMBSTONE_DAYS}) — sonst droppt purgeTombstones Inhalt`);
  ok(V.TRASH_DAYS===30&&V.MAX_TRASH===200&&V.TOMBSTONE_DAYS===365&&V.MAX_TOMBSTONES===2000,'Grenzen wie Alien Pass: 30 Tage/200, 365 Tage/2000');
  { const many=[]; for(let i=0;i<V.MAX_TRASH+50;i++) many.push(del({title:'T'+i}, 1+i/1000));
    const capped=V.wipeTrash(many, now), kept=capped.filter(e=>!V.isWiped(e));
    ok(kept.length===V.MAX_TRASH&&capped.length===many.length,`MAX_TRASH: genau ${V.MAX_TRASH} behalten Inhalt, keiner entfernt (${kept.length}/${capped.length})`);
    ok(kept.every(e=>tsOf(e.deleted)>=Math.max(...capped.filter(x=>V.isWiped(x)).map(x=>tsOf(x.deleted)))),'über dem Deckel weichen die ÄLTESTEN Löschungen'); }

  const A=del({title:'Konto'},5), B=V.tombFrom(A);
  ok(V.winner(A,B)===B&&V.winner(B,A)===B,'Gleichstand, beide gelöscht: die gewipte Gestalt gewinnt beidseitig');
  const restored=Object.assign({},A,{deleted:null, updated:new Date(now).toISOString()});
  ok(V.mergeEntries([B],[restored]).entries[0].deleted===null&&V.mergeEntries([restored],[B]).entries[0].deleted===null,'Wiederherstellen (neueres updated) schlägt die Löschmarke beidseitig');
  const mi=V.mergeEntries([B],[A]);
  ok(V.isWiped(mi.entries[0])&&mi.added===0&&mi.updated===0&&mi.deleted===0,'Re-Import eines inhaltsvollen Stands über eine gewipte Löschmarke ist idempotent (0/0/0)');
  { const setA=[alive,fresh,old,V.tombstone(del({},2),iso(2))], setB=[V.tombFrom(fresh),alive,old];
    const ab=V.sanitizeEntries(V.mergeEntries(setA,setB).entries, now), ba=V.sanitizeEntries(V.mergeEntries(setB,setA).entries, now);
    ok(JSON.stringify(ab.map(V.canon).sort())===JSON.stringify(ba.map(V.canon).sort()),'Pipeline kommutativ über live / Papierkorb / abgelaufen / Löschmarke');
    const abc=V.sanitizeEntries(V.mergeEntries(V.mergeEntries(setA,setB).entries,[alive]).entries, now);
    const a_bc=V.sanitizeEntries(V.mergeEntries(setA,V.mergeEntries(setB,[alive]).entries).entries, now);
    ok(JSON.stringify(abc.map(V.canon).sort())===JSON.stringify(a_bc.map(V.canon).sort()),'Pipeline assoziativ'); }
  { const bDev=del({title:'Sparkasse'},V.TRASH_DAYS-1), aDev=V.tombFrom(bDev);
    const r1=V.sanitizeEntries(V.mergeEntries([aDev],[bDev]).entries, now), r2=V.sanitizeEntries(V.mergeEntries([bDev],[aDev]).entries, now);
    ok(V.isWiped(r1[0])&&V.isWiped(r2[0])&&V.canon(r1[0])===V.canon(r2[0]),'Zwei-Geräte-Konvergenz: beide Richtungen enden gewipt');
    ok(V.canon(V.sanitizeEntries(V.mergeEntries(r1,r2).entries, now)[0])===V.canon(r1[0]),'zweite Sync-Runde ändert nichts mehr'); }

  { const mix=[]; for(let i=0;i<150;i++) mix.push(del({title:'P'+i},1)); for(let i=0;i<10;i++) mix.push(V.sanitizeEntry(E({title:'L'+i})));
    const s=V.sanitizeEntries(mix, now);
    ok(V.liveCount(s)===10&&s.filter(e=>!V.isWiped(e)&&e.deleted).length===150,'Papierkorb zählt nicht gegen MAX_ENTRIES (10 live, 150 im Papierkorb)'); }
  { const gone=del({title:'uralt'},V.TOMBSTONE_DAYS+1);
    ok(V.isWiped(V.wipeTrash([gone],now)[0]),'über TOMBSTONE_DAYS: wipeTrash leert ihn ZUERST');
    const s=V.sanitizeEntries([gone,alive], now);
    ok(!s.find(e=>e.id===gone.id),'… und purgeTombstones dropt ihn danach — nie inhaltsvoll gedroppt'); }
  { const dek=await V.newDek(); const kdf={m:8192,t:1,p:1,salt:V.rand(16)};
    const body=await V.encryptBody({version:1,entries:[t1,t1b],settings:{},totp:null,meta:{}},dek,kdf);
    const back=V.sanitizeVault(await V.decryptBody(body,dek,kdf), now).entries;
    const b1=back.find(e=>e.id===t1.id), b2=back.find(e=>e.id===t1b.id);
    ok(b1.title==='Einkauf'&&b1.body==='geheim'&&b1.deleted===t1.deleted&&b2.items.length===2,'Papierkorb-Einträge überleben encryptBody/decryptBody/sanitizeVault mit Inhalt'); }
}

console.log('\n[13] Verdrängung durch fremde Dateien (shapeIncoming, purgeTombstones-Anzahlzweig — Audit run-5)');
{
  const DAY=86400000, now=Date.now();
  const iso=d=>new Date(now-d*DAY).toISOString();
  const hid=(p,i)=>(p+i.toString(16).padStart(10,'0')).padEnd(16,'0').slice(0,16);
  const mk=(o)=>V.sanitizeEntry(Object.assign({type:'text',title:'T',body:'b',created:iso(100),updated:iso(3)},o), now);
  const pipe=l=>V.purgeTombstones(V.wipeTrash(l, now), now);

  { const abgelaufen=mk({id:hid('a',1), title:'Alt', body:'GEHEIM', deleted:iso(V.TRASH_DAYS+1), updated:iso(V.TRASH_DAYS+1)});
    const out=V.sanitizeEntries([abgelaufen], now);
    ok(out.length===1&&V.isWiped(out[0]),'sanitizeEntries leert einen abgelaufenen Papierkorb-Eintrag SELBST (Entsperr-Pfad, ohne nachfolgenden persist)'); }
  { const viele=[]; for(let i=0;i<V.MAX_TRASH+50;i++) viele.push(mk({id:hid('b',i), title:'P'+i, body:'x', deleted:iso(1+i/1000), updated:iso(1+i/1000)}));
    const out=V.sanitizeEntries(viele, now);
    ok(out.filter(e=>!V.isWiped(e)).length===V.MAX_TRASH,'sanitizeEntries kappt den Papierkorb SELBST auf MAX_TRASH'); }

  { const eigen=[]; for(let i=0;i<5;i++) eigen.push(mk({id:hid('c',i), title:'Eigen'+i, body:'GEHEIM'+i, deleted:iso(3), updated:iso(3)}));
    const fremd=[]; for(let i=0;i<V.MAX_TRASH;i++) fremd.push({id:hid('f',i), type:'list', title:'', items:[], created:iso(1), updated:new Date(now+400*DAY).toISOString(), deleted:new Date(now+400*DAY).toISOString()});
    const inc=V.shapeIncoming(eigen, V.sanitizeEntries(fremd, now));
    ok(inc.every(e=>V.isWiped(e)),'shapeIncoming: eingehende Papierkorb-Einträge kommen nur als Löschmarke an (Inhalt ist gerätelokal)');
    const res=pipe(V.mergeEntries(eigen, inc).entries);
    ok(res.filter(e=>e.deleted&&!V.isWiped(e)).length===5,'Angriff 1 abgewehrt: alle 5 eigenen Papierkorb-Einträge behalten ihren Inhalt'); }

  { const eigen=[mk({id:hid('d',1), title:'Live'})];
    for(let i=0;i<3;i++) eigen.push(V.tombstone({id:hid('e',i), created:iso(100)}, iso(5)));
    const fremd=[]; for(let i=0;i<V.MAX_TOMBSTONES;i++) fremd.push({id:hid('f',i), type:'text', title:'', created:iso(1), updated:new Date(now+400*DAY).toISOString(), deleted:new Date(now+400*DAY).toISOString()});
    const nachAngriff=pipe(V.mergeEntries(eigen, V.shapeIncoming(eigen, V.sanitizeEntries(fremd, now))).entries);
    ok(nachAngriff.filter(e=>e.id.startsWith('e')).length===3,'Angriff 2 abgewehrt: alle 3 eigenen Löschmarken überleben den Import');
    const backup=[]; for(let i=0;i<3;i++) backup.push(mk({id:hid('e',i), title:'Endgueltig'+i, body:'SEED'+i, updated:iso(20)}));
    const final=pipe(V.mergeEntries(nachAngriff, V.shapeIncoming(nachAngriff, V.sanitizeEntries(backup, now))).entries);
    ok(final.filter(e=>!e.deleted&&e.id.startsWith('e')).length===0,'… und das eigene ältere Backup belebt danach NICHTS wieder'); }

  { const A=[mk({id:hid('d',7), title:'Sparkasse', body:'GEHEIM', deleted:iso(2), updated:iso(2)})];
    const aufB=V.shapeIncoming([], V.sanitizeEntries(A, now));
    ok(aufB.length===1&&V.isWiped(aufB[0]),'Zweitgerät bekommt nur die Löschmarke, nie den Inhalt');
    const zurueck=pipe(V.mergeEntries(A, V.shapeIncoming(A, V.sanitizeEntries(aufB, now))).entries);
    const behalten=zurueck.filter(e=>e.deleted&&!V.isWiped(e));
    ok(behalten.length===1&&behalten[0].body==='GEHEIM','die zurückkehrende Marke verdrängt den EIGENEN Papierkorb-Eintrag nicht'); }

  { const A=[V.tombstone({id:hid('d',9), created:iso(50)}, iso(1))];
    const B=[mk({id:hid('d',9), title:'Alt', body:'alt', updated:iso(30)})];
    const res=pipe(V.mergeEntries(B, V.shapeIncoming(B, V.sanitizeEntries(A, now))).entries);
    ok(!!res[0].deleted,'eine Löschung propagiert weiterhin vollständig (nur der Inhalt bleibt lokal)'); }
  { const A=[mk({id:hid('d',11), title:'Neu', body:'neu', updated:iso(1)})];
    const B=[V.tombstone({id:hid('d',11), created:iso(50)}, iso(20))];
    const res=pipe(V.mergeEntries(B, V.shapeIncoming(B, V.sanitizeEntries(A, now))).entries);
    ok(!res[0].deleted&&res[0].body==='neu','eine neuere Änderung schlägt weiterhin eine ältere Löschmarke');
    ok(V.mergeEntries(B, V.shapeIncoming(B, V.sanitizeEntries(A, now))).added===1,'… und wird als „neu“ gezählt'); }

  { const l=[mk({id:hid('c',9), title:'Papierkorb', body:'GEHEIM', deleted:iso(1), updated:iso(1)})];
    for(let i=0;i<V.MAX_TOMBSTONES+50;i++) l.push(V.tombstone({id:hid('f',i), created:iso(2)}, iso(0.5)));
    const out=V.purgeTombstones(l, now);
    const drin=out.find(e=>e.id===hid('c',9));
    ok(drin&&!V.isWiped(drin)&&drin.body==='GEHEIM','purgeTombstones verwirft im Anzahlzweig keinen Papierkorb-Eintrag mit Inhalt');
    ok(out.filter(e=>e.deleted&&V.isWiped(e)).length===V.MAX_TOMBSTONES,'… und kappt die gewipten Marken weiterhin auf MAX_TOMBSTONES'); }

  { const loc=[mk({id:hid('c',11), title:'X', body:'GEHEIM', deleted:iso(1), updated:iso(1)})];
    const inc=[V.tombFrom(loc[0])];
    const m=V.mergeEntries(loc, inc);
    ok(m.wiped===1&&m.added===0&&m.updated===0&&m.deleted===0,'Merge meldet eine gelöscht→gelöscht-Ersetzung als wiped (Audit run-5 #4)'); }

  { const live=[mk({id:hid('d',13), title:'Lebt'})], inc0=V.sanitizeEntries(live, now);
    const out=V.shapeIncoming([], inc0);
    ok(out.length===1&&out[0]===inc0[0],'shapeIncoming reicht lebende Einträge unverändert durch (identisch)'); }
}

console.log('\n[14] Markdown-Zerlegung (mdParse/mdInline), Kopiertext, Zeilen ↔ Einträge');
{
  const P=V.mdParse;
  const h=P('# Titel\n## Zwei\n### Drei\n#### Vier'); ok(h.length===4&&h[0].type==='h'&&h[0].level===1&&h[1].level===2&&h[2].level===3&&h[3].type==='p','Überschriften # bis ### — vier Rauten bleiben Absatz');
  ok(h[0].inline.length===1&&h[0].inline[0].t==='text'&&h[0].inline[0].s==='Titel','Überschrift trägt Inline-Text');
  const p=P('Zeile 1\nZeile 2\n\nAbsatz 2'); ok(p.length===2&&p[0].type==='p'&&p[0].inline[0].s==='Zeile 1\nZeile 2'&&p[1].inline[0].s==='Absatz 2','Absätze: Zeilenumbrüche bleiben, Leerzeile trennt');
  const i=V.mdInline('a **fett** b *kursiv* c `code` d _unter_ e'); ok(i.map(x=>x.t).join()==='text,b,text,i,text,code,text,i,text'&&i[1].s==='fett'&&i[3].s==='kursiv'&&i[5].s==='code'&&i[7].s==='unter','Inline: fett, kursiv (* und _), Code');
  ok(V.mdInline('2 * 3 * 4')[0].t==='text'&&V.mdInline('2 * 3 * 4').length===1,'Sternchen mit Leerzeichen sind kein Kursiv');
  ok(V.mdInline('snake_case_name').length===1&&V.mdInline('snake_case_name')[0].t==='text','Unterstriche mitten im Wort sind kein Kursiv');
  const l=P('- eins\n- zwei\n1. drei\n2) vier\n* fünf'); ok(l.length===3&&l[0].type==='list'&&!l[0].ordered&&l[0].items.length===2&&l[1].ordered&&l[1].items.length===2&&!l[2].ordered,'Listen: ungeordnet / geordnet / wieder ungeordnet getrennt');
  const c=P('- [ ] offen\n- [x] erledigt\n- [X] auch\n- ohne'); ok(c[0].items.map(x=>x.check).join()==='false,true,true,'&&c[0].items[3].check===null,'Kästchen: offen/erledigt/ohne');
  const f=P('```\ncode **nicht fett**\n\n# keine Überschrift\n```\ndanach'); ok(f.length===2&&f[0].type==='code'&&f[0].text==='code **nicht fett**\n\n# keine Überschrift'&&f[1].type==='p','Zaun-Code roh, Absatz danach');
  const ind=P('    eingerückt\n\ttab\nnormal'); ok(ind.length===2&&ind[0].type==='code'&&ind[0].text==='eingerückt\ntab'&&ind[1].type==='p','Eingerückter Code (4 Leerzeichen / Tab)');
  const r=P('a\n---\nb\n***\n___'); ok(r.length===5&&r[1].type==='hr'&&r[3].type==='hr'&&r[4].type==='hr'&&r.filter(x=>x.type==='hr').length===3,'Trennlinien --- *** ___');
  const u=P('Siehe https://example.com/x und <b>kein HTML</b>'); ok(u[0].inline.length===1&&u[0].inline[0].s==='Siehe https://example.com/x und <b>kein HTML</b>','URL und HTML bleiben Text (kein Link, kein Markup)');
  ok(P('').length===0&&P(null).length===0&&P('\n\n').length===0,'leer → keine Blöcke');
  ok(P('a\r\nb\rc')[0].inline[0].s==='a\nb\nc','CRLF/CR normalisiert');
  { const big='- x\n'.repeat(5000); const t0=Date.now(); const out=P(big); ok(out.length===1&&out[0].items.length===5000&&Date.now()-t0<2000,'5.000 Listenzeilen zügig zerlegt'); }
  ok(P('#NoSpace').length===1&&P('#NoSpace')[0].type==='p','Raute ohne Leerzeichen ist keine Überschrift');
  { const hh=P('## Titel ##\n### a #\n# a#\n# a # b\n   # x\n    # code\n# Titel   '); ok(hh[0].inline[0].s==='Titel'&&hh[1].inline[0].s==='a'&&hh[2].inline[0].s==='a#'&&hh[3].inline[0].s==='a # b'&&hh[4].type==='h'&&hh[4].inline[0].s==='x'&&hh[5].type==='code'&&hh[6].inline[0].s==='Titel','Überschriften: schließende # nur nach Leerraum abgeschnitten, Einrückung ≤ 3, Leerraum am Ende weg'); }
  // Audit run-1 #5: die alte Überschriften-Regex war kubisch bei langem Leerraum vor einem Zeichen — jetzt linear
  { const t0=Date.now(); const hb=P('# a'+' '.repeat(100000)+'x'); const t1=Date.now()-t0; ok(hb.length===1&&hb[0].type==='h'&&t1<200,'ReDoS-Wächter: 100.000 Leerzeichen in einer Überschrift in '+t1+' ms (< 200)');
    const t2=Date.now(); P('# a'+'\t'.repeat(100000)+'x\n'+'# '+'#'.repeat(100000)+'\n'+' #'.repeat(50000)); ok(Date.now()-t2<300,'ReDoS-Wächter: Tabs, Rauten, Raute-Ketten linear');
    // v1.9 (Release-Audit B-4): \u2028/\u2029 am Zeilenende — „.“ passt nicht darauf, vorher ~3 s für 100.000 Leerzeichen
    const t3=Date.now(); const u=P('# '+' '.repeat(100000)+'\u2028\n- '+' '.repeat(100000)+'a\u2029\n1. '+'\t'.repeat(100000)+'b\u2028'); const t4=Date.now()-t3;
    ok(t4<300&&u.length===3&&u[0].type==='h'&&u[1].type==='list'&&u[2].type==='list'&&u[2].ordered,`ReDoS-Wächter: Überschrift/Liste mit \\u2028/\\u2029 am Zeilenende linear (${t4} ms)`); }
  // Kopiertext
  ok(V.noteText({type:'text',title:'T',body:'a\nb'})==='T\n\na\nb'&&V.noteText({type:'text',title:'',body:'nur'})==='nur','noteText: Titel + Leerzeile + Text, ohne Titel nur Text');
  ok(V.noteText({type:'text',title:'a',body:'a\nb'})==='a\nb'&&V.noteText({type:'text',title:'Erste Zeile',body:'\n  Erste Zeile \nb'})==='\n  Erste Zeile \nb','noteText: Titel aus der ersten Zeile steht nicht doppelt (Faktencheck help.l8)');
  ok(V.noteText({type:'list',title:'Einkauf',items:[{text:'Milch',done:true},{text:'Brot',done:false}]})==='Einkauf\n\n- [x] Milch\n- [ ] Brot','noteText: Checkliste als - [x]-Zeilen');
  // Text ↔ Checkliste
  const li=V.linesToItems('Milch\n- [x] Brot\n\n* [ ] Eier\n1. nicht nummeriert weg? \n   ');
  ok(li.length===4&&li[0].text==='Milch'&&!li[0].done&&li[1].text==='Brot'&&li[1].done&&li[2].text==='Eier'&&!li[2].done&&li[3].text==='1. nicht nummeriert weg?','linesToItems: Zeilen → Einträge, Kästchen-Marker verstanden, leere Zeilen weg');
  ok(V.linesToItems('x\n'.repeat(300)).length===V.ITEMS_MAX,'linesToItems kappt auf ITEMS_MAX');
  ok(V.itemsToBody([{text:'a',done:true},{text:'b',done:false}])==='- [x] a\n- [ ] b','itemsToBody: Einträge → Zeilen');
  ok(V.canon(V.linesToItems(V.itemsToBody(li)))===V.canon(li),'Zeilen ↔ Einträge ist ein Roundtrip');
}

console.log('\n[15] Standard-Notes-Import (snImport: Typen, Tags, Papierkorb, Super → Markdown, Grenzen, Abwehr)');
{ const NOW=Date.parse('2026-09-25T12:00:00Z'), NOWISO='2026-09-25T12:00:00.000Z'; const raw=readFileSync('test-data/sn-sample.json','utf8');
  const r=V.snImport(raw,{now:NOW}); const s=r.stats, by=t=>r.entries.find(e=>e.title===t);
  ok(r.entries.length===9&&s.notes===7&&s.lists===1&&s.trashed===1&&s.tags===2,'Beispiel-Backup: 7 Notizen, 1 Checkliste, 1 im Papierkorb, 2 Tags');
  ok(s.skipped.auth===1&&s.skipped.sheet===1&&s.skipped.other===2&&s.skipped.files===0&&s.skipped.encrypted===0&&s.skipped.deleted===0&&s.skipped.empty===0,'übersprungen: 1 Authenticator, 1 Tabelle, 2 sonstige (ItemsKey, Component)');
  ok(s.lost.tables===1&&s.lost.images===1&&s.lost.files===1&&s.lost.embeds===0&&s.pinned===1&&s.archived===1&&s.fav===0,'gezählt: 1 Tabelle, 1 Bild, 1 Datei, 1 angeheftet, 1 archiviert');
  ok(r.entries.every(e=>Object.keys(e).length===FIELDS&&V.canon(V.sanitizeEntry(e,NOW))===V.canon(e)),'alle Einträge: '+FIELDS+' Felder, sanitizer-stabil');
  const out=JSON.stringify(r); ok(!/JBSWY3DPEHPK3PXP|token-vault|Authenticator|standard-sheets|Tabelle"/.test(out)&&!/"cells"/.test(out),'Authenticator-Geheimnis und Tabellen-JSON kommen nirgends an');
  ok(by('Plain').md===false&&by('Markdown').md===true&&by('Code').md===false&&by('Code').body.includes('\n')&&by('Super').md===true,'md: Markdown und Super an, Klartext/Code aus');
  ok(by('Rich Text').body==='Überschrift\nfett kursiv\n- eins','Rich Text → Klartext ohne Tags, Blöcke als Zeilen');
  const sb=by('Super').body; const need=['# Einkauf Werkstatt','**fett**','*kursiv*','`code`','- Punkt A','1. Erstens','2. Zweitens','- [ ] Offen','- [x] Erledigt','```javascript\nlet x = 1\n```','> Ein erfundenes Zitat.','Siehe Beispiel (https://example.org)','| Kopf 1 | Kopf 2 |\n| a | b |','[Bild: Beispielbild]','[Datei]','---'];
  ok(need.every(x=>sb.includes(x)),'Super → Markdown-Untermenge: Überschrift, Inline-Formate, drei Listenarten, Zaun, Zitat, Link als Text, Tabelle als Zeilen, Platzhalter, Linie'+(need.filter(x=>!sb.includes(x)).length?' FEHLT: '+need.filter(x=>!sb.includes(x)).join(' | '):''));
  const P=V.mdParse(sb); ok(P[0].type==='h'&&P[0].level===1&&P.find(b=>b.type==='code'&&b.text==='let x = 1')&&P.find(b=>b.type==='list'&&b.items.some(i=>i.check===true))&&P[P.length-1].type==='hr','das erzeugte Markdown zerlegt unser mdParse wie erwartet');
  const cl=by('Checkliste'); ok(cl.type==='list'&&cl.items.length===3&&cl.items[1].text==='Reifen prüfen'&&cl.items[1].done&&!cl.items[0].done&&cl.body==='','Task-Editor („- [x] …“-Zeilen) → Checkliste mit Haken');
  ok(by('Plain').cat==='Projekte'&&by('Super').cat==='Projekte'&&by('Checkliste').cat==='Projekte/Werkstatt'&&by('Code').cat==='','Kategorie: erster Tag, verschachtelt „Eltern/Kind“, ohne Tag leer');
  ok(by('Angeheftet').pinned===true&&by('Plain').pinned===false&&by('Archiviert').deleted===null,'pinned aus appData; archiviert bleibt normale Notiz');
  const tr=by('Im Papierkorb'); ok(tr.deleted===NOWISO&&tr.updated==='2026-01-09T10:00:00.000Z'&&tr.created==='2026-01-09T10:00:00.000Z'&&tr.body==='Weg damit','Papierkorb: Inhalt bleibt, Löschdatum = Importzeit (frische Frist), updated/created aus der Datei');
  ok(by('Plain').updated==='2026-01-01T10:00:00.000Z'&&by('Plain').id==='8000000000000001'&&/^[0-9a-f]{16}$/.test(by('Super').id),'Datum aus client_updated_at, ID = hintere 16 Hex der UUID');
  const r0=V.snImport(raw,{now:NOW,trashBudget:0}); ok(r0.entries.length===8&&r0.stats.trashed===0&&r0.stats.trashOver===1&&!r0.entries.some(e=>e.deleted),'Papierkorb-Budget 0: Papierkorb-Notiz zurückgehalten und gezählt');
  ok(V.snId('00000000-0000-4000-8000-0000000000a1')==='80000000000000a1'&&V.snId('kein-uuid')===V.snId('kein-uuid')&&V.snId('kein-uuid')!==V.snId('kein-uuid2')&&/^[0-9a-f]{16}$/.test(V.snId('kein-uuid'))&&V.snId('')!==V.snId('x'),'snId: deterministisch, 16 Hex, Fremdformat gehasht');
  // Re-Import: gleiche IDs → der Merge legt nichts doppelt an
  const m=V.mergeEntries(r.entries, V.snImport(raw,{now:NOW+1000}).entries); ok(m.added===0&&m.updated===0&&m.entries.length===9,'zweiter Import derselben Datei: Merge fügt nichts hinzu');
  // Fehlerfälle
  const th=(fn,code,msg)=>{ try{ fn(); ok(false,msg+' (kein Fehler)'); }catch(e){ ok(e&&e.message===code,msg+' → '+(e&&e.message)); } };
  th(()=>V.snImport('{kein json'),'snjson','kaputtes JSON'); th(()=>V.snImport('[1,2]'),'snformat','Array statt Objekt'); th(()=>V.snImport('{"items":"x"}'),'snformat','items kein Array');
  th(()=>V.snImport('{"items":[],"keyParams":{"version":"004"}}'),'snencrypted','keyParams = verschlüsseltes Backup'); th(()=>V.snImport('{"items":[],"auth_params":{}}'),'snencrypted','auth_params = verschlüsseltes Backup');
  ok(V.snImport('{"version":"004","items":[]}',{now:NOW}).entries.length===0,'leeres Backup: keine Einträge, kein Fehler');
  // Einzelfälle: verschlüsseltes Item, gelöscht, Datei, leer, starred, unbekannter Typ, Notiz→Tag-Richtung, Punkt-Ordner, Kreis, Überlänge
  const N=(uuid,c,extra)=>Object.assign({uuid,content_type:'Note',content:Object.assign({title:'',text:'',references:[]},c),created_at:'2026-02-01T00:00:00.000Z',updated_at:'2026-02-02T00:00:00.000Z'},extra||{});
  const items=[
    {uuid:'e1',content_type:'Note',content:'004:abc:def'}, {uuid:'e2',content_type:'Note',content:{title:'x'},deleted:true}, {uuid:'e3',content_type:'Note',content:null},
    {uuid:'f1',content_type:'SN|File',content:{name:'a.pdf'}}, N('n0',{title:'',text:'   \n  '}), N('n1',{title:'Stern',text:'a',starred:true,noteType:'unknown',editorIdentifier:'org.standardnotes.fancy-markdown-editor'}),
    N('n2',{title:'Fremd',text:'roh',noteType:'was-auch-immer',editorIdentifier:'com.example.editor'}), N('n3',{title:'Zu Tag',text:'b',references:[{uuid:'t1',content_type:'Tag'}]}),
    N('n4',{title:'Ohne Titel',text:'',noteType:'super'}), N('n5',{title:'',text:'  erste Zeile  \nzweite',noteType:'plain-text',appData:{'org.standardnotes.sn':{client_updated_at:'Thu Jan 01 2026 10:00:00 GMT+0000 (UTC)'}}},{created_at:'2025-12-01T00:00:00.000Z'}),
    N('n6',{title:'Kaputt',text:'kein json',noteType:'super'}), N('n7',{title:'Lang',text:'x'.repeat(150000),noteType:'plain-text'}), N('n8',{title:'Liste lang',text:Array.from({length:300},(_,i)=>'- [ ] '+i).join('\n')+'\n- [ ] '+'y'.repeat(600),noteType:'task'}),
    N('n9',{title:'Datum kaputt',text:'d',appData:{'org.standardnotes.sn':{client_updated_at:'irgendwann',pinned:'true'}}}), N('na',{title:'Zyklus',text:'z',references:[{uuid:'c1',content_type:'Tag'}]}),
    N('nb',{title:'Punkt',text:'p',references:[{uuid:'t2',content_type:'Tag'}]}), N('nc',{title:'Langer Pfad',text:'q',references:[{uuid:'t3',content_type:'Tag'}]}),
    {uuid:'t1',content_type:'Tag',content:{title:'Arbeit',references:[]}}, {uuid:'t2',content_type:'Tag',content:{title:'Arbeit.Projekt.X',references:[]}},
    {uuid:'c1',content_type:'Tag',content:{title:'A',references:[{uuid:'c2',content_type:'Tag',reference_type:'TagToParentTag'}]}}, {uuid:'c2',content_type:'Tag',content:{title:'B',references:[{uuid:'c1',content_type:'Tag',reference_type:'TagToParentTag'}]}},
    {uuid:'t3',content_type:'Tag',content:{title:'Blatt',references:[{uuid:'t4',content_type:'Tag',reference_type:'TagToParentTag'}]}}, {uuid:'t4',content_type:'Tag',content:{title:'E'.repeat(45),references:[]}},
    {uuid:'x1',content_type:'SN|SmartTag',content:{title:'Alle'}}, 42, null, 'string'
  ];
  const q=V.snImport(JSON.stringify({version:'004',items}),{now:NOW}); const qs=q.stats, qb=t=>q.entries.find(e=>e.title===t);
  ok(qs.skipped.encrypted===1&&qs.skipped.deleted===2&&qs.skipped.files===1&&qs.skipped.empty===1&&qs.skipped.other===4,'gezählt: 1 verschlüsselt, 2 gelöscht, 1 Datei, 1 leer, 4 sonstige (SmartTag + 3 Müll)');
  ok(qb('Stern').fav===true&&qb('Stern').md===true,'starred → Favorit; noteType unknown → Editor-Kennung entscheidet (Markdown)');
  ok(qb('Fremd').type==='text'&&qb('Fremd').body==='roh'&&qb('Fremd').md===false,'unbekannter Typ/Editor → Klartext');
  ok(qb('Zu Tag').cat==='Arbeit','Notiz→Tag-Referenz (Gegenrichtung) wird auch verstanden');
  ok(qb('Ohne Titel')&&qb('Ohne Titel').body===''&&qs.skipped.empty===1,'Super ohne Text, aber mit Titel: bleibt (Titel zählt)');
  ok(qb('erste Zeile')&&qb('erste Zeile').body==='  erste Zeile  \nzweite'&&qb('erste Zeile').updated==='2026-01-01T10:00:00.000Z','leerer Titel → erste Zeile; client_updated_at im Textformat gelesen');
  ok(qb('Kaputt').body==='kein json'&&qb('Kaputt').md===false,'Super mit kaputtem JSON → Text so wie er ist');
  ok(qb('Lang').body.length===V.CAPS.body&&qs.capped.body===1,'150.000 Zeichen → auf CAPS.body gekürzt und gezählt');
  ok(qb('Liste lang').items.length===V.ITEMS_MAX&&qs.capped.items===1&&qs.capped.item===1,'300 Zeilen → ITEMS_MAX, überlange Zeile gezählt');
  ok(qb('Datum kaputt').updated==='2026-02-02T00:00:00.000Z'&&qb('Datum kaputt').pinned===false,'unlesbares client_updated_at → updated_at; pinned nur bei echtem true');
  ok(qb('Zyklus').cat==='B/A'||qb('Zyklus').cat==='A','Tag-Kreis A↔B endet (Pfad „'+qb('Zyklus').cat+'“)');
  ok(qb('Punkt').cat==='Arbeit/Projekt/X','Altform „a.b.c“ im Tag-Titel → Pfad');
  ok(qb('Langer Pfad').cat==='Blatt','Pfad über 40 Zeichen → nur das Blatt');
  ok(!Object.prototype.hasOwnProperty.call(Object.prototype,'pinned')&&!('polluted' in {}),'keine Prototyp-Verschmutzung');
  // Abwehr: Titel/HTML/Super-Müll bleiben Text, Prototype-Schlüssel wirkungslos, ReDoS/Stack-Wächter
  const evil=JSON.stringify({version:'004',items:[N('v1',{title:'<img src=x onerror=alert(1)>',text:'<script>alert(1)</script>&lt;b&gt;&amp;&#65;&#x42;&bogus;',noteType:'rich-text'}),
    N('v2',{title:'Proto',text:'{"root":{"type":"root","children":[{"type":"paragraph","children":[{"type":"text","text":"ok","format":1}]},{"type":"paragraph","__proto__":{"polluted":1},"children":[{"type":"text","text":"x"}]}]}}',noteType:'super',appData:{'org.standardnotes.sn':{'__proto__':{polluted:1},pinned:true}}}),
    N('v3',{title:'Tief',text:'{"root":{"type":"root","children":['+'{"type":"paragraph","children":['.repeat(5000)+'{"type":"text","text":"tief"}'+']}'.repeat(5000)+']}}',noteType:'super'})]});
  const ev=V.snImport(evil,{now:NOW}); const e1=ev.entries.find(e=>e.title.startsWith('<img')); ok(e1&&e1.title==='<img src=x onerror=alert(1)>'&&e1.body==='alert(1)<b>&AB&bogus;','XSS-Titel bleibt Text; HTML → Text, Entities dekodiert, Unbekanntes bleibt');
  ok(ev.entries.find(e=>e.title==='Proto').body==='**ok**\n\nx'&&!('polluted' in {})&&ev.entries.find(e=>e.title==='Proto').pinned===true,'Super mit __proto__-Schlüsseln: Text kommt an, nichts verschmutzt');
  { const tf=ev.entries.find(e=>e.title==='Tief'); ok(tf&&((ev.stats.lost.deep||0)>0||tf.body.startsWith('{"root"')),'5.000-fach verschachtelter Super-Baum: Tiefenwächter (oder Rohtext), kein Stack-Überlauf ('+(ev.stats.lost.deep||0)+' abgeschnitten)'); }
  { const t0=Date.now(); V.htmlToText('<'.repeat(100000)+'&'.repeat(100000)+'<p'.repeat(50000)); V.htmlToText('&#'.repeat(100000)); const t1=Date.now()-t0; ok(t1<400,'ReDoS-Wächter htmlToText: 100.000 spitze Klammern/Ampersands in '+t1+' ms'); }
  { const t0=Date.now(); V.htmlToText(' '.repeat(1000000)+'x'); V.htmlToText('\t'.repeat(1000000)+'x\n'); const t1=Date.now()-t0; ok(t1<400,'ReDoS-Wächter htmlToText: 1 Mio Leerzeichen/Tabs ohne Zeilenumbruch in '+t1+' ms (Audit run-2: Eingabe auf 2×CAPS.body gedeckelt)'); }
  // 2FA-Geheimnisse in jedem Pfad verworfen (Audit run-2 Hardening): editorIdentifier schlägt noteType, Legacy-Zuordnung über SN|Component.associatedItemIds, pinned auch aus content
  { const legacy=JSON.stringify({version:'004',items:[
      {uuid:'00000000-0000-4000-8000-0000000000c1',content_type:'SN|Component',content:{package_info:{identifier:'org.standardnotes.token-vault'},associatedItemIds:['00000000-0000-4000-8000-0000000000a1']}},
      {uuid:'00000000-0000-4000-8000-0000000000c2',content_type:'SN|Component',content:{identifier:'org.standardnotes.standard-sheets',associatedItemIds:['00000000-0000-4000-8000-0000000000a2']}},
      N('00000000-0000-4000-8000-0000000000a1',{title:'Legacy-Vault',text:'[{"secret":"GEHEIMNIS-A"}]'}),
      N('00000000-0000-4000-8000-0000000000a2',{title:'Legacy-Sheet',text:'{"rows":[]}'}),
      N('00000000-0000-4000-8000-0000000000a3',{title:'Widerspruch',text:'[{"secret":"GEHEIMNIS-B"}]',noteType:'markdown',editorIdentifier:'org.standardnotes.token-vault'}),
      N('00000000-0000-4000-8000-0000000000a4',{title:'Angeheftet im content',text:'x',pinned:true}),
      N('00000000-0000-4000-8000-0000000000a5',{title:'Normal',text:'y'})]});
    const r=V.snImport(legacy,{now:NOW}); const all=JSON.stringify(r.entries);
    ok(r.stats.skipped.auth===2&&r.stats.skipped.sheet===1&&!all.includes('GEHEIMNIS'),'Authenticator über Component-Zuordnung UND über editorIdentifier trotz noteType verworfen, Sheet über Component: '+r.stats.skipped.auth+'/'+r.stats.skipped.sheet+', kein Geheimnis im Ergebnis');
    ok(r.entries.length===2&&r.entries.find(e=>e.title==='Angeheftet im content').pinned===true&&r.entries.find(e=>e.title==='Normal').pinned===false,'pinned aus content.pinned gelesen (nicht nur appData), Normal bleibt normal'); }
  { const t0=Date.now(); V.snImport(JSON.stringify({version:'004',items:Array.from({length:3000},(_,i)=>N('u'+i,{title:'N'+i,text:'t'.repeat(200),noteType:'markdown'}))}),{now:NOW}); const t1=Date.now()-t0; ok(t1<3000,'3.000 Notizen in '+t1+' ms'); }
}

console.log('\n[16] ZIP-Inhaltsverzeichnis (zipEntries/zipSlice/zipFindSn) für das Standard-Notes-ZIP');
{ const SN=V.ZIP_NAME_SN, txt=readFileSync('test-data/sn-sample.json','utf8'); const u8=b=>new Uint8Array(b.buffer,b.byteOffset,b.byteLength);
  const th=(fn,code,msg)=>{ try{ fn(); ok(false,msg+' (kein Fehler)'); }catch(e){ ok(e&&e.message===code,msg+' → '+(e&&e.message)); } };
  const z1=mkZip([{name:'Items/Note/Plain-0000.txt',data:'Köder',method:8},{name:SN,data:txt,method:8},{name:'Items/Tag/x.txt',data:'{}',method:0}]);
  const es=V.zipEntries(u8(z1)); ok(es.length===3&&es[1].name===SN&&es[1].method===8&&es[1].usize===Buffer.byteLength(txt)&&!es[1].encrypted&&!es[1].zip64,'Inhaltsverzeichnis: 3 Einträge, Backup-Datei mit deflate und Größe');
  const e=V.zipFindSn(u8(z1)); const part=V.zipSlice(u8(z1),e,20*1024*1024); ok(part.deflated&&Buffer.from(inflateRawSync(Buffer.from(part.data))).toString('utf8')===txt,'zipSlice liefert genau die deflate-Bytes des Backup-Eintrags (entpackt = Original)');
  const z0=mkZip([{name:'sub/ordner/'+SN,data:txt,method:0}]); const p0=V.zipSlice(u8(z0),V.zipFindSn(u8(z0)),20*1024*1024); ok(!p0.deflated&&Buffer.from(p0.data).toString('utf8')===txt,'gespeicherter Eintrag in einem Unterordner: gefunden, Bytes 1:1');
  ok(V.snImport(Buffer.from(p0.data).toString('utf8'),{now:Date.now()}).entries.length===9,'… und daraus importiert das Beispiel wie aus der .txt');
  th(()=>V.zipFindSn(u8(mkZip([{name:'Items/Note/a.txt',data:'x'},{name:'Standard Notes Backup and Import File.txt.bak',data:'x'}]))),'zipnosn','ohne die Backup-Datei (ähnlicher Name zählt nicht)');
  th(()=>V.zipEntries(u8(Buffer.from('PK\x03\x04 kein zip'))),'zipbad','Müll mit PK-Magic'); th(()=>V.zipEntries(u8(z1.subarray(0,z1.length-30))),'zipbad','abgeschnittenes Archiv');
  th(()=>V.zipSlice(u8(z1),Object.assign({},e,{encrypted:true}),1e9),'zipenc','verschlüsselter Eintrag'); th(()=>V.zipSlice(u8(z1),Object.assign({},e,{zip64:true}),1e9),'zip64','ZIP64-Eintrag');
  th(()=>V.zipSlice(u8(z1),Object.assign({},e,{method:12}),1e9),'zipmethod','fremde Methode (bzip2)'); th(()=>V.zipSlice(u8(z1),e,100),'toolarge','angegebene Größe über dem Deckel');
  const zb=mkZip([{name:SN,data:txt,method:8,usize:5}]); ok(V.zipSlice(u8(zb),V.zipFindSn(u8(zb)),1e9).usize===5,'gelogene Größe im Verzeichnis: der Deckel greift zusätzlich beim Entpacken (zipInflate zählt)');
  const zs=mkZip([{name:SN,data:txt,method:0,usize:0}]); th(()=>V.zipSlice(u8(zs),V.zipFindSn(u8(zs)),100),'toolarge','gespeicherter Eintrag mit gelogener usize=0: csize zählt (Audit run-2 Hardening)');
  ok(V.zipSlice(u8(zs),V.zipFindSn(u8(zs)),1e9).data.length===Buffer.byteLength(txt),'… und unter dem Deckel kommen die csize-Bytes an');
  th(()=>V.zipFindSn(u8(mkZip([{name:'Items/Note/'+SN,data:'x'},{name:'x/Items/'+SN,data:'x'}]))),'zipnosn','gleichnamiger Köder unter Items/ zählt nicht (Audit run-2 Hardening)');
  ok(V.zipFindSn(u8(mkZip([{name:'Items/Note/'+SN,data:'x'},{name:'Backup/'+SN,data:txt}]))).name==='Backup/'+SN,'… der echte Eintrag außerhalb von Items/ wird gefunden');
  th(()=>V.zipSlice(u8(mkZip([{name:SN,data:txt,method:8,lho:999999}])),V.zipFindSn(u8(mkZip([{name:SN,data:txt,method:8,lho:999999}]))),1e9),'zipbad','lokaler Kopf außerhalb der Datei');
  const zm=mkZip([{name:SN,data:txt,method:8,csize:99999999}]); th(()=>V.zipSlice(u8(zm),V.zipFindSn(u8(zm)),1e9),'zipbad','csize über das Dateiende hinaus');
  th(()=>V.zipEntries('kein Uint8Array'),'zipbad','falscher Typ');
  { const t0=Date.now(); const many=mkZip(Array.from({length:3000},(_,i)=>({name:'Items/Note/n'+i+'.txt',data:'x'})).concat([{name:SN,data:'{"items":[]}'}])); const f=V.zipFindSn(u8(many)); ok(f.name===SN&&Date.now()-t0<1500,'3.001 Einträge in '+(Date.now()-t0)+' ms'); }
}

console.log('\n[17] Kategorie umbenennen (renameCatEntries): lebend + Papierkorb mit Inhalt, nie gewipte Marken, updated=jetzt, neues Array');
{ const NOW='2026-09-25T12:00:00.000Z', mk=(id,cat,extra)=>V.sanitizeEntry(Object.assign({id,type:'text',cat,title:'t'+id,body:'b',created:'2026-01-01T00:00:00.000Z',updated:'2026-01-02T00:00:00.000Z'},extra||{}),Date.parse(NOW));
  const wiped=V.tombFrom(mk('0000000000000004','Alt',{deleted:'2026-01-03T00:00:00.000Z'}));   // gewipte Marke (cat '' per Definition): darf nie Inhalt bekommen
  const list=[mk('0000000000000001','Alt'),mk('0000000000000002','Neu'),mk('0000000000000003','Alt',{deleted:'2026-01-03T00:00:00.000Z'}),wiped,mk('0000000000000005','')];
  const r=V.renameCatEntries(list,'Alt','Neu',NOW);
  ok(r.n===2&&r.entries!==list&&r.entries[0].cat==='Neu'&&r.entries[0].updated===NOW&&r.entries[2].cat==='Neu'&&r.entries[2].updated===NOW&&r.entries[2].deleted===list[2].deleted,'2 Treffer (lebend + Papierkorb), cat und updated gesetzt, deleted bleibt, neues Array');
  ok(r.entries[1]===list[1]&&r.entries[3]===list[3]&&r.entries[4]===list[4]&&list[0].cat==='Alt','Unbeteiligte, gewipte Marke und Eingabe unverändert (keine Mutation)');
  const r0=V.renameCatEntries(list,'Alt','Alt',NOW); ok(r0.n===0&&r0.entries===list,'gleicher Name: nichts');
  const r1=V.renameCatEntries(list,'Gibtsnicht','X',NOW); ok(r1.n===0&&r1.entries===list,'unbekannte Kategorie: nichts');
  const rw=V.renameCatEntries(list,'','Neu',NOW); ok(rw.n===1&&rw.entries[3]===list[3]&&V.isWiped(rw.entries[3])&&rw.entries[4].cat==='Neu','„ohne Kategorie“ umbenennen: die gewipte Marke bleibt gewipt, nur der lebende Eintrag zieht um');
  const r2=V.renameCatEntries(list,'Alt','',NOW); ok(r2.n===2&&r2.entries[0].cat===''&&Object.keys(r2.entries[0]).length===FIELDS&&V.canon(V.sanitizeEntry(r2.entries[0],Date.parse(NOW)))===V.canon(r2.entries[0]),'leer = ohne Kategorie, Eintrag bleibt sanitizer-stabil ('+FIELDS+' Felder)');
}

console.log('\n[18] Mehrfachauswahl (bulkEdit): Papierkorb, Rückgängig, Kategorie, Favorit — nur Getroffene, nie gewipte Marken, updated=jetzt, neues Array');
{ const NOW='2026-09-25T12:00:00.000Z', mk=(id,extra)=>V.sanitizeEntry(Object.assign({id,type:'text',cat:'A',title:'t'+id,body:'b',created:'2026-01-01T00:00:00.000Z',updated:'2026-01-02T00:00:00.000Z'},extra||{}),Date.parse(NOW));
  const list=[mk('0000000000000001'),mk('0000000000000002',{fav:true}),mk('0000000000000003',{deleted:'2026-01-03T00:00:00.000Z'}),V.tombFrom(mk('0000000000000004',{deleted:'2026-01-03T00:00:00.000Z'})),mk('0000000000000005')];
  const ids=new Set(['0000000000000001','0000000000000002','0000000000000003','0000000000000004','fremd']);
  const d=V.bulkEdit(list,ids,{deleted:true},NOW); ok(d.n===2&&d.entries!==list&&d.entries[0].deleted===NOW&&d.entries[0].updated===NOW&&d.entries[1].deleted===NOW&&d.entries[2]===list[2]&&d.entries[3]===list[3]&&d.entries[4]===list[4],'Papierkorb: nur die 2 lebenden Getroffenen, schon Gelöschtes/Gewiptes/Fremdes unberührt');
  const u=V.bulkEdit(d.entries,ids,{deleted:null},NOW); ok(u.n===3&&u.entries[0].deleted===null&&u.entries[1].deleted===null&&u.entries[2].deleted===null&&u.entries[3]===list[3]&&V.isWiped(u.entries[3]),'Rückgängig: alle 3 Papierkorb-Einträge mit Inhalt zurück, gewipte Marke bleibt gewipt');
  const c=V.bulkEdit(list,ids,{cat:'  Neu  '},NOW); ok(c.n===2&&c.entries[0].cat==='Neu'&&c.entries[1].cat==='Neu'&&c.entries[2]===list[2]&&list[0].cat==='A','Kategorie: nur lebende, über line() getrimmt, Eingabe nicht mutiert');
  const f=V.bulkEdit(list,ids,{fav:true},NOW); ok(f.n===2&&f.entries[0].fav===true&&f.entries[1].fav===true&&f.entries[0].updated===NOW,'Favorit setzen (auch beim schon markierten: zählt, updated)');
  const g=V.bulkEdit(list,ids,{fav:'ja'},NOW); ok(g.entries[1].fav===false,'fav nur echtes true');
  const z=V.bulkEdit(list,new Set(),{deleted:true},NOW); ok(z.n===0&&z.entries===list,'leere Auswahl: nichts');
  ok(d.entries.every(e=>Object.keys(e).length===FIELDS&&V.canon(V.sanitizeEntry(e,Date.parse(NOW)))===V.canon(e)),'Ergebnisse sanitizer-stabil ('+FIELDS+' Felder)');
}

console.log('\n[19] Standard-Notes-Fuzz: zufällige Backups durch snImport — jeder Eintrag sanitizer-stabil, geklemmt, sichtbar, ohne Steuerzeichen, Geheimnisse nie im Ergebnis');
{ // Deterministisch (LCG-Seed wie Alien Pass [26]), damit ein Fehlschlag reproduzierbar bleibt. Alphabet: Steuerzeichen, NUL, BOM, Nullbreite, Bidi,
  // HTML-Splitter, Entities, Markdown-/Task-Präfixe, Punkte (Tag-Altform), Emoji, Zeitstempel kaputt/Zukunft/Textform. Geheime Notizen (Authenticator,
  // Tabelle — über noteType, editorIdentifier oder SN|Component) tragen einen Marker, der nirgends im Ergebnis stehen darf.
  let seed=20260928; const rnd=()=>{ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; }; const pick=a=>a[Math.floor(rnd()*a.length)];
  const NUL=String.fromCharCode(0), NOW=Date.parse('2026-09-28T12:00:00Z'), NOWISO=new Date(NOW).toISOString(), maxT=NOW+120000;
  const A=['a','b','Ä',' ','\t','\n','\r','\r\n',NUL,'\u0007','\u001b','\u007f','\u0085','﻿','​','‎','‮','⁠','🙂','.','/','#','- ','- [x] ','- [ ] ','* ','1. ','> ','```','**','`',
    '<','>','</p>','<br>','<li>','<td>','&amp;','&#0;','&#x110000;','&#55296;','&lt;','&','"','\\','x'.repeat(300),' '.repeat(50)];
  const fld=(n)=>{ let s=''; const k=Math.floor(rnd()*(n||8)); for(let i=0;i<k;i++) s+=pick(A); return s; };
  const D=['2026-01-01T10:00:00.000Z','2026-01-01T10:00:00Z','Thu Jan 01 2026 10:00:00 GMT+0000 (UTC)','2099-01-01T00:00:00.000Z','1969-12-31T23:59:59.000Z','2020-13-45T99:99:99Z','',
    'irgendwann','0','99999999999999','+275760-09-13T00:00:00.000Z',null,42,{}];
  const UU=['00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a2','AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE','kurz','','x'.repeat(40),'n1','n2',null,7];
  const TU=['t1','t2','t3','00000000-0000-4000-8000-0000000000b1',''];
  const LT=['root','paragraph','heading','quote','list','listitem','code','code-highlight','horizontalrule','table','tablerow','tablecell','text','linebreak','tab','link','autolink','hashtag',
    'unencrypted-image','inline-file','snfile','snbubble','youtube','tweet','collapsible-container','collapsible-title','collapsible-content','mark','overflow','unbekannt'];
  const lex=d=>{ const n={type:pick(LT)}; if(rnd()<0.6) n.text=fld(6); if(rnd()<0.3) n.format=Math.floor(rnd()*32); if(rnd()<0.2) n.url=pick(['https://x.org',fld(3),5]);
    if(rnd()<0.2) n.listType=pick(['number','bullet','check','x']); if(rnd()<0.2) n.checked=pick([true,false,'true']); if(rnd()<0.1) n.start=pick([0,3,-1,1.5,'2']);
    if(rnd()<0.1) n.tag=pick(['h1','h2','h6','hx',3]); if(rnd()<0.1) n.language=fld(3); if(rnd()<0.1) n.alt=fld(3);
    if(d<4&&rnd()<0.7){ n.children=[]; const k=Math.floor(rnd()*4); for(let i=0;i<k;i++) n.children.push(rnd()<0.05?pick([null,3,'s',[]]):lex(d+1)); } return n; };
  const KINDS=['plain-text','markdown','code','rich-text','super','task','authentication','spreadsheet','was-auch-immer',undefined];
  const EDS=Object.keys({'com.standardnotes.plain-text':1,'com.standardnotes.super-editor':1,'org.standardnotes.token-vault':1,'org.standardnotes.standard-sheets':1,'org.standardnotes.code-editor':1,
    'org.standardnotes.plus-editor':1,'org.standardnotes.simple-markdown-editor':1,'org.standardnotes.simple-task-editor':1}).concat(['com.example.editor',undefined]);
  const SECRET_ED=['org.standardnotes.token-vault','org.standardnotes.standard-sheets'];
  const txt=kind=>{ const r=rnd(); if(kind==='super'&&r<0.7){ const t=JSON.stringify({root:lex(0)}); return rnd()<0.1?t.slice(0,Math.floor(rnd()*t.length)):t; }
    if(kind==='task'&&r<0.7){ let s=''; const k=Math.floor(rnd()*6); for(let i=0;i<k;i++) s+=pick(['- [ ] ','- [x] ','* ','','  '])+fld(4)+pick(['\n','\r\n','\r']); return s; }
    return fld(12); };
  let files=0, notes=0, secrets=0, errs=0, err=null; const t0=Date.now();
  for(let f=0;f<20000&&!err;f++){
    const items=[], secretUuids=[]; const n=Math.floor(rnd()*10);
    for(let i=0;i<n;i++){ const r=rnd();
      if(r<0.6){ const kind=pick(KINDS), ed=pick(EDS), uuid=pick(UU); let secret=kind==='authentication'||kind==='spreadsheet'||SECRET_ED.includes(ed);
        if(!secret&&rnd()<0.05&&typeof uuid==='string'){ secret=true; items.push({uuid:'c'+i,content_type:'SN|Component',content:rnd()<0.5?{identifier:pick(SECRET_ED),associatedItemIds:[uuid]}:{package_info:{identifier:pick(SECRET_ED)},associatedItemIds:[uuid,5]}}); }
        const c={title:rnd()<0.8?fld(6):pick([null,5,{}]), text:secret?'GEHEIMNIS'+fld(3)+'MARKE':txt(kind), references:[]};
        if(kind!==undefined) c.noteType=kind; if(ed!==undefined) c.editorIdentifier=ed;
        if(rnd()<0.3) c.references.push({uuid:pick(TU),content_type:'Tag'}); if(rnd()<0.05) c.references.push(null,{uuid:5});
        if(rnd()<0.15) c.trashed=pick([true,'true',1]); if(rnd()<0.15) c.starred=pick([true,'ja']); if(rnd()<0.1) c.pinned=true; if(rnd()<0.05) c.archived=true;
        if(rnd()<0.4) c.appData={'org.standardnotes.sn':{client_updated_at:pick(D),pinned:pick([true,false,'true']),archived:rnd()<0.1}};
        const it={uuid,content_type:'Note',content:c}; if(rnd()<0.8) it.created_at=pick(D); if(rnd()<0.8) it.updated_at=pick(D);
        if(rnd()<0.03) it.deleted=true; if(rnd()<0.03) it.content=pick(['004:abc:def',null]);
        if(secret){ secrets++; if(typeof it.content==='object'&&it.content) secretUuids.push(uuid); }
        items.push(it); }
      else if(r<0.85){ const refs=[]; const k=Math.floor(rnd()*3); for(let j=0;j<k;j++) refs.push(rnd()<0.5?{uuid:pick(UU),content_type:'Note'}:{uuid:pick(TU),content_type:'Tag',reference_type:'TagToParentTag'});
        items.push({uuid:pick(TU),content_type:'Tag',content:{title:rnd()<0.9?fld(5)+pick(['','.',NUL+'.'])+fld(3):7,references:refs}}); }
      else items.push(pick([null,42,'string',[],{content_type:'SN|File',uuid:'f',content:{}},{content_type:'SN|SmartTag',content:{title:'Alle'}},{uuid:'u',content_type:'Note'}]));
    }
    let raw=JSON.stringify(rnd()<0.05?{version:'004',items,keyParams:{}}:{version:'004',items}); if(rnd()<0.03) raw=raw.slice(0,Math.floor(rnd()*raw.length));
    const budget=pick([undefined,0,1,200]);
    try{ let r; try{ r=V.snImport(raw,{now:NOW,trashBudget:budget}); }catch(x){ if(['snjson','snformat','snencrypted'].includes(x&&x.message)){ errs++; continue; } throw x; }
      files++; const out=JSON.stringify(r.entries), s=r.stats;
      if(out.includes('GEHEIMNIS')||out.includes('MARKE')) throw new Error('Geheimnis im Ergebnis');
      if(s.notes+s.lists+s.trashed!==r.entries.length) throw new Error('Statistik passt nicht: '+JSON.stringify(s));
      if(budget!=null&&s.trashed>budget) throw new Error('Papierkorb über Budget');
      if(JSON.stringify(V.snImport(raw,{now:NOW,trashBudget:budget}))!==JSON.stringify(r)) throw new Error('nicht deterministisch');
      for(const e of r.entries){ notes++;
        if(Object.keys(e).length!==FIELDS||V.canon(V.sanitizeEntry(e,NOW))!==V.canon(e)) throw new Error('nicht sanitizer-stabil: '+JSON.stringify(e).slice(0,160));
        if(!/^[0-9a-f]{16}$/.test(e.id)||!V.ENTRY_TYPES.includes(e.type)||(e.md&&e.type!=='text')) throw new Error('ID/Typ/md: '+JSON.stringify(e).slice(0,160));
        if(Date.parse(e.updated)>maxT||Date.parse(e.created)>maxT||Date.parse(e.updated)<Date.parse(e.created)||(e.deleted!==null&&e.deleted!==NOWISO)) throw new Error('Zeitstempel: '+e.created+' / '+e.updated+' / '+e.deleted);
        if(e.title.length>V.CAPS.title||e.body.length>V.CAPS.body||e.cat.length>V.CAPS.cat||e.items.length>V.ITEMS_MAX) throw new Error('Cap verletzt');
        if(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/.test(e.title+e.cat+e.items.map(x=>x.text).join(''))) throw new Error('Steuerzeichen in Titel/Kategorie/Zeile: '+JSON.stringify(e.title+'|'+e.cat));
        if(!e.title&&(e.type==='text'?!V.line(e.body,V.CAPS.body):!e.items.length)) throw new Error('unsichtbarer Eintrag: '+JSON.stringify(e).slice(0,160)); }
      const m=V.mergeEntries([],r.entries); if(new Set(m.entries.map(e=>e.id)).size!==m.entries.length) throw new Error('Merge lässt doppelte IDs stehen'); }
    catch(x){ err=x.message+' | '+(process.env.FUZZ_FULL?raw:raw.slice(0,300)); }
  }
  ok(!err,'20000 zufällige Backups ('+files+' gelesen, '+errs+' mit Fehlercode abgewiesen, '+notes+' Einträge, '+secrets+' Geheimnisse) ohne Wurf: sanitizer-stabil, geklemmt, sichtbar, ohne Steuerzeichen, deterministisch'+(err?' — '+err:''));
  ok(notes>20000&&secrets>15000&&errs>1000&&Date.now()-t0<15000,'Fuzz erreicht genug Einträge, Geheimnisse und Fehlerfälle in unter 15 s ('+(Date.now()-t0)+' ms)');
  // Fund des Fuzz-Laufs (28.09.2026): Text nur aus Steuer-/Nullbreitenzeichen (Rich-Text „BOM + DEL“: htmlToText trimmt das BOM, DEL bleibt) überlebte den
  // trim()-Guard und kam als Notiz ohne Titel und ohne sichtbaren Text an — jetzt „leer“ übersprungen; ein unsichtbarer Vorlauf vor dem Text frisst den Titel nicht mehr
  { const NUL=String.fromCharCode(0), one=(text,noteType,title)=>V.snImport(JSON.stringify({version:'004',items:[{uuid:'00000000-0000-4000-8000-0000000000a2',content_type:'Note',content:{title:title||'',text,noteType,references:[]}}]}),{now:NOW});
    const a=one('\uFEFF\u007f','rich-text'), b=one('\u200b\n'+NUL+'\u202e','plain-text'), c=one('\u200b'.repeat(250)+'Text dahinter','plain-text'), d=one('\u200b','plain-text','Titel');
    ok(a.entries.length===0&&a.stats.skipped.empty===1&&b.entries.length===0&&b.stats.skipped.empty===1,'Rich-Text/Klartext nur aus unsichtbaren Zeichen → übersprungen („leer“), keine unsichtbare Notiz');
    ok(c.entries.length===1&&c.entries[0].title==='Text dahinter','250 Nullbreiten vor dem Text: Titel kommt trotzdem aus der ersten sichtbaren Zeile');
    ok(d.entries.length===1&&d.entries[0].title==='Titel','unsichtbarer Text MIT Titel bleibt (Titel zählt)');
    // Release-Audit v1.6 C-1: das TITELFELD kürzte vor dem Entfernen — 200 Nullbreiten + „Wichtig“ verlor den Titel (leer → übersprungen bzw. Titel aus dem Text)
    const e=one('','plain-text','\u200b'.repeat(200)+'Wichtig'), f=one('Inhalt','plain-text','\u200b'.repeat(200)+'Wichtig');
    ok(e.entries.length===1&&e.entries[0].title==='Wichtig'&&f.entries.length===1&&f.entries[0].title==='Wichtig','Titelfeld mit 200 Nullbreiten vor dem Titel: Titel bleibt erhalten');
    // C-4: eine „leer“ übersprungene Notiz zählt nicht als gekürzt
    const g=one('\u200b'.repeat(100001),'plain-text');
    ok(g.entries.length===0&&g.stats.skipped.empty===1&&g.stats.capped.body===0,'übersprungene leere Notiz über 100.000 Zeichen zählt nicht als „gekürzt“'); }
}

console.log('\n[20] v1.9: Mehrzeiliges in einen Checklisten-Punkt (splitItemPaste) — feste Fälle + Fuzz');
{ const S=(h,t,ta,room,cap,cd)=>V.splitItemPaste(h,t,ta,room===undefined?199:room,cap===undefined?V.CAPS.item:cap,cd), J=x=>JSON.stringify(x);
  let r=S('Einkauf','Milch\nBrot\n- [x] Eier','');
  ok(r.first==='EinkaufMilch'&&r.firstDone===null&&J(r.rows)===J([{text:'Brot',done:false},{text:'Eier',done:true}])&&r.caret===4&&!r.cut,'Vorschau der Entscheidung: „Einkauf|“ + Milch/Brot/- [x] Eier → EinkaufMilch, Brot, ☑ Eier, Cursor hinter „Eier“');
  r=S('','- [x] Milch\n- [ ] Brot','');
  ok(r.first==='Milch'&&r.firstDone===true&&J(r.rows)===J([{text:'Brot',done:false}]),'leerer Punkt: Marker der ersten Zeile setzt dessen Haken');
  r=S('','- [x] Milch\nBrot','rest',199,500,false);
  ok(r.first==='Milch'&&r.firstDone===true&&J(r.rows)===J([{text:'Brotrest',done:false}])&&r.caret===4,'Cursor ganz vorn: erste Zeile ist nur Eingefügtes (Marker-Haken), der vorhandene Rest hängt am letzten und behält seinen Haken');
  r=S('Milch','X\nY','Brot',199,500,true);
  ok(r.first==='MilchX'&&r.firstDone===null&&J(r.rows)===J([{text:'YBrot',done:true}]),'B-2: abgehakter Punkt mittendrin — beide Teile des vorhandenen Texts behalten den Haken (wie Enter)');
  r=S('','- [ ] neu1\n- [ ] neu2','MilchBrot',199,500,true);
  ok(r.first==='neu1'&&r.firstDone===false&&J(r.rows)===J([{text:'neu2MilchBrot',done:true}]),'B-2: ganz vorn in abgehakten Punkt — Marker der ersten Zeile gilt, der vorhandene Text behält seinen Haken');
  r=S('Buy',' milk\nbread','');
  ok(r.first==='Buy milk'&&r.rows[0].text==='bread','B-3: an vorhandenen Text wird die erste Zeile roh angehängt (Leerzeichen bleibt, wie beim einzeiligen Einfügen)');
  r=S('Termin in',' + 3 Tage\nDanach','');
  ok(r.first==='Termin in + 3 Tage','B-3: kein Marker-Abstreifen mitten im Punkt');
  { const t0=Date.now(); r=S('','\n'.repeat(1000000)+'x\n'+'\n'.repeat(1000000)+'y',''); const t1=Date.now()-t0;
    ok(t1<300&&r.first==='x'&&r.rows.length===1&&r.rows[0].text==='y',`C-1: 2 Mio Leerzeilen vor und zwischen zwei Zeilen linear (${t1} ms; vorher quadratisch, 1 MB ≈ 20–50 s)`); }
  { const t0=Date.now(); r=S('',('zeile\n').repeat(2000000),''); const t1=Date.now()-t0; ok(t1<400&&r.rows.length===199&&r.cut,`C-1: 2 Mio Zeilen, nur 199 passen: liest nur so weit wie nötig (${t1} ms)`); }
  r=S('','\u200b\n'.repeat(150)+'a\n'.repeat(100),'');
  ok(r.first==='a'&&r.rows.length===99&&!r.cut,'C-6: Zeilen nur aus Nullbreiten-Zeichen belegen keine Plätze (vorher 149 unsichtbare Punkte, 50 echte Zeilen verloren)');
  r=S('','x\n\u200b\u0007\ny','\u200b',199,500,true);
  ok(r.first==='x'&&J(r.rows.map(x=>x.text))===J(['y\u200b'])&&r.rows[0].done===false,'C-6: unsichtbarer Rest zählt nicht als vorhandener Text (kein Haken übernommen)');
  r=S('','- [x]\nfoo','rest',199,500,false);
  ok(r.first==='foorest'&&r.rows.length===0,'R2c-5: Marker-Zeile ohne Text vor leerem Punkt zählt als Leerzeile (vorher blieb ein leerer Punkt stehen)');
  r=S('x'.repeat(499),'🙂\ny','');
  ok(r.first==='x'.repeat(499)&&!/[\uD800-\uDBFF]$/.test(r.first),'Kürzung schneidet kein Surrogat-Paar durch');
  r=S('Ein','x\ny','kauf');
  ok(r.first==='Einx'&&J(r.rows)===J([{text:'ykauf',done:false}])&&r.caret===1,'mittendrin: Text hinter dem Cursor wandert an den letzten neuen Punkt');
  r=S('a','\n\nb\n\n','c');
  ok(r.first==='a'&&r.rows.length===1&&r.rows[0].text==='bc','Leerzeilen fallen weg');
  r=S('','\n\n- [x] Q\nR','');
  ok(r.first==='Q'&&r.firstDone===true&&r.rows.length===1&&r.rows[0].text==='R','vor leerem Punkt: führende Leerzeilen weg, erste echte Zeile kommt in den Punkt');
  r=S('a','b\r\nc\rd','');
  ok(r.first==='ab'&&J(r.rows.map(x=>x.text))===J(['c','d']),'\\r\\n und einzelnes \\r trennen ebenfalls');
  r=S('a','b\nc\nd','Z',1);
  ok(r.first==='ab'&&r.rows.length===1&&r.rows[0].text==='cZ'&&r.cut,'Grenze ITEMS_MAX: nur so viele neue Punkte wie Platz, cut gesetzt, Rest hinter dem Cursor bleibt');
  r=S('a','b\nc','Z',0);
  ok(r.first==='abZ'&&r.rows.length===0&&r.cut&&r.caret===2,'kein Platz mehr: erste Zeile in den Punkt, Rest hinter dem Cursor bleibt dort');
  r=S('x'.repeat(498),'yyyy\nzzzz','');
  ok(r.first==='x'.repeat(498)+'yy'&&r.rows[0].text==='zzzz','Länge: der Punkt wird auf CAPS.item gekappt, nur am Eingefügten');
  r=S('kopf','z'.repeat(600)+'\n'+'w'.repeat(600),'schwanz');
  ok(r.first.length===V.CAPS.item&&r.first.startsWith('kopf')&&r.rows[0].text.length===V.CAPS.item&&r.rows[0].text.endsWith('schwanz'),'Länge: lange Zeilen gekappt, Kopf und Schwanz bleiben ganz');
  ok(V.lineToItem('  - [X] a').text==='a'&&V.lineToItem('  - [X] a').done&&V.lineToItem('[ ] b').text==='b'&&!V.lineToItem('[ ] b').done,'lineToItem: Marker wie linesToItems');
  { const t0=Date.now(); for(const sep of ['\u2028','\u2029','\r']) V.lineToItem(' '.repeat(200000)+'a'+sep+'b'); const t1=Date.now(); V.linesToItems(('\t'.repeat(30000)+'- [x] z\u2028y\n').repeat(3)); const t2=Date.now();
    ok(t1-t0<300&&t2-t1<300,`ReDoS-Wächter (Node): 200 000 Leerzeichen vor \\u2028/\\u2029/\\r linear (${t1-t0} ms), linesToItems ebenso (${t2-t1} ms)`);
    const u=V.lineToItem('- [x] a\u2028b'); ok(u.text==='a\u2028b'&&u.done,'Zeile mit \\u2028: Marker trotzdem verstanden (vorher Rohtext samt „- [x]“)'); }
  // Fuzz: deterministisch (LCG). Invarianten: kein Umbruch in einem Punkt, Kopf/Schwanz bleiben, Platz und Länge gedeckelt, Cursor vor dem Schwanz,
  // und Einfügen in einen LEEREN Punkt ergibt nach dem Speichern genau das, was „Text → Checkliste“ (linesToItems) aus demselben Text macht.
  let seed=20261009; const rnd=()=>{ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; }; const pick=a=>a[Math.floor(rnd()*a.length)];
  const A=['a','b','Ä',' ','\t','\n','\n','\r\n','\r','\u0000','\u0007','\u0085','\ufeff','\u200b','🙂','- ','- [x] ','- [ ] ','[X] ','* ','+ ','1. ','x'.repeat(120),' '.repeat(30)];
  const fld=n=>{ let s=''; const k=Math.floor(rnd()*n); for(let i=0;i<k;i++) s+=pick(A); return s; };
  const noNl=s=>s.replace(/[\r\n]/g,'');
  let bad=[], eq=0, eqN=0;
  for(let i=0;i<8000;i++){
    const cap=pick([500,500,500,40,8,2]), room=pick([0,1,2,5,199,1000]);
    let head=noNl(fld(4)), tail=noNl(fld(3)); if(head.length+tail.length>cap){ head=head.slice(0,Math.floor(cap/2)); tail=tail.slice(0,cap-head.length); }
    const text=fld(10), cd=rnd()<0.5, r=V.splitItemPaste(head,text,tail,room,cap,cd), all=[r.first,...r.rows.map(x=>x.text)];
    const vis=x=>!!V.line(x,cap);   // Modell: „sichtbar“ wie nach dem Speichern (C-6)
    const ls=text.split(/\r\n|\r|\n/); if(!vis(head)) while(ls.length>1&&!vis(V.lineToItem(ls[0]).text)) ls.shift();   // Modell: führende Leerzeilen vor leerem Punkt fallen weg
    const nonEmpty=ls.slice(1).map(V.lineToItem).filter(x=>vis(x.text.trim())).length;
    const why=[];
    if(all.some(x=>/[\r\n]/.test(x))) why.push('Umbruch im Punkt');
    if(!r.first.startsWith(head)) why.push('Kopf verloren');
    if(r.rows.length?!r.rows[r.rows.length-1].text.endsWith(tail):!r.first.endsWith(tail)) why.push('Schwanz verloren');
    if(r.rows.length>room) why.push('mehr Punkte als Platz');
    if(r.cut!==(nonEmpty>room)) why.push('cut falsch');
    if(all.some(x=>x.length>cap)) why.push('länger als cap');
    if(r.rows.some(x=>!x.text||typeof x.done!=='boolean')) why.push('leerer neuer Punkt');
    const lastTxt=r.rows.length?r.rows[r.rows.length-1].text:r.first; if(lastTxt.slice(r.caret)!==tail||r.caret<0) why.push('Cursor');
    if(r.firstDone!==null&&(vis(head)||(vis(tail)&&!r.rows.length))) why.push('Haken überschrieben');
    if(vis(tail)&&r.rows.length&&r.rows[r.rows.length-1].done!==cd) why.push('Haken folgt dem Rest nicht');
    if(vis(head)&&!r.rows.length&&!r.cut&&head.length+tail.length+text.length<=cap&&r.first!==head+text+tail&&!/[\r\n]/.test(text)) why.push('roh angehängt');
    const lone=x=>/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(x); if(!lone(head)&&!lone(tail)&&all.some(lone)) why.push('Surrogat zerschnitten');   // Alphabet hat nur ganze Paare (Kopf/Schwanz kürzt der Generator selbst)
    if(!head&&!tail&&cap===500&&room===1000&&!/\r(?!\n)/.test(text)){ eqN++;
      const got=V.sanitizeItems([{text:r.first,done:r.firstDone===true},...r.rows]), want=V.linesToItems(text);
      if(V.canon(got)===V.canon(want)) eq++; else why.push('≠ linesToItems'); }
    if(why.length) bad.push({i,why,head,text,tail,room,cap,r});
  }
  ok(!bad.length,'Fuzz 8000 Fälle: Invarianten halten'+(bad.length?' — erster Fund: '+JSON.stringify(bad[0]).slice(0,process.env.FUZZ_FULL?1e6:600):''));
  ok(eqN>40&&eq===eqN,`Fuzz: Einfügen in einen leeren Punkt = „Text → Checkliste“ (${eq}/${eqN})`);
}

console.log(`\n${pass} ok, ${fail} Fehler`); process.exit(fail?1:0);
