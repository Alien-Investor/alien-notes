// Roundtrip-/Format-Test (Node, kein Browser). Evaluiert die Sentinel-Region aus app.js
// (=== VAULT-FORMAT BEGIN/END ===) DIREKT — keine Nachbildung, damit Lese- und Schreibpfad
// garantiert derselbe Code sind. Prüft Schlüsselhierarchie, AAD, Grenzen, Merge, Sanitizer, Papierkorb, TOTP.
// Aus Alien Pass v1.8 übernommen und auf das Notizen-Modell (text/list, 13 Felder, Magic AINV1) angepasst.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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
    encryptBody,decryptBody,serializeFile,parseFile,kdfOk,KDF_DEFAULT,KDF_BOUNDS,MAX_ENTRIES,MAX_FILE_BYTES,emptyVault,sanitizeEntry,sanitizeEntries,sanitizeVault,sanitizeSettings,
    SETTINGS_DEFAULT,SETTINGS_ALLOWED,BG_NEVER,normalizeTotp,otpauthUri,sanitizeItems,ITEMS_MAX,ENTRY_TYPES,CAPS,mergeEntries,winner,canon,purgeTombstones,tombstone,
    totpCode,totpRemaining,genWords,passStrength,passCheck,MAX_TOMBSTONES,liveCount,tombFrom,isWiped,wipeTrash,shapeIncoming,TRASH_DAYS,MAX_TRASH,TOMBSTONE_DAYS,ts,
    dupKey,entryType,line,bioKey,parseBioBlob,serializeBioBlob,bioWrapOk,wrapTag,mdParse,mdInline,noteText,linesToItems,itemsToBody};`)();

let pass=0, fail=0; const ok=(c,m)=>{ if(c){pass++;console.log('  ✓',m);} else {fail++;console.log('  ✗ FEHLER:',m);} };
const throwsWith=async(fn,code,m)=>{ try{ await fn(); ok(false,m+' (kein Fehler)'); }catch(e){ ok(e&&e.message===code,m+' → '+(e&&e.message)); } };
const KDF_TEST={m:8192,t:1,p:1};   // klein für schnelle Tests; Format identisch
const FIELDS=12;                   // Whitelist-Felder eines Eintrags: id,type,cat,title,body,items,fav,pinned,md,created,updated,deleted

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
  await throwsWith(()=>Promise.resolve(V.parseFile('x'.repeat(21*1024*1024))),'toolarge','Übergröße vor JSON.parse abgelehnt');
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
  ok(V.MAX_ENTRIES===5000&&V.MAX_FILE_BYTES===20*1024*1024,'MAX_ENTRIES 5.000, Datei ≤ 20 MB');
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
    const t2=Date.now(); P('# a'+'\t'.repeat(100000)+'x\n'+'# '+'#'.repeat(100000)+'\n'+' #'.repeat(50000)); ok(Date.now()-t2<300,'ReDoS-Wächter: Tabs, Rauten, Raute-Ketten linear'); }
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

console.log(`\n${pass} ok, ${fail} Fehler`); process.exit(fail?1:0);
