'use strict';
// Prüfprogramm für die echte Hülle (Alien Notes, aus Alien Pass übernommen): lädt main.js wie die App und prüft von innen (keine Fernsteuerung
// von außen — die Hülle verweigert --remote-debugging-*, und die Fuses sperren --inspect). Aufruf über verify-desktop.mjs.
// Gibt je Prüfung eine Zeile "R <json>" aus, nie Notizen- oder Zwischenablage-Inhalte.
const {app,BrowserWindow,Menu,session,clipboard,ClipboardItem,shell}=require('electron');
const path=require('path'); const fs=require('fs'); const net=require('net'); const dgram=require('dgram');
require('./main.js');
const opened=[]; shell.openExternal=async u=>{ opened.push(u); };   // nie wirklich den Browser öffnen, nur mitschreiben

const STEP=process.env.AP_STEP, PP=process.env.AP_PP||'';
const KDE_HINT='electron application/osclipboard;format="x-kde-passwordManagerHint"';
const R=(name,ok,info)=>console.log('R '+JSON.stringify({name,ok:!!ok,info:info===undefined?null:info}));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let win=null;
const js=code=>win.webContents.executeJavaScript(code,true);
async function until(code,ms=40000){ const t0=Date.now(); while(Date.now()-t0<ms){ try{ if(await js(code)) return true; }catch(_){} await sleep(100); } return false; }
const visible=id=>`(()=>{const n=document.getElementById(${JSON.stringify(id)});return !!n&&!n.classList.contains('hidden');})()`;
const fill=(id,v)=>js(`(()=>{const n=document.getElementById(${JSON.stringify(id)});n.value=${JSON.stringify(v)};n.dispatchEvent(new Event('input',{bubbles:true}));})()`);
const click=sel=>js(`document.querySelector(${JSON.stringify(sel)}).click()`);
// Wiederherstellen und WARTEN, bis das Fenster den Fokus wieder hat (KDE gibt ihn nach restore() erst verzögert, teils mit blur/focus-Pendeln):
// ein spätes blur leerte sonst die gerade getippte Test-PIN (Gate-Hygiene) — Flake 25.09.2026, nur in der echten Hülle.
async function restoreFocused(){ win.restore(); for(let i=0;i<30&&!win.isFocused();i++) await sleep(100); if(!win.isFocused()){ win.focus(); for(let i=0;i<30&&!win.isFocused();i++) await sleep(100); } await sleep(300); return win.isFocused()&&!win.isMinimized(); }   // Rückgabe als info (Release-Audit v1.8 C-8)
const prim=()=>clipboard.selection.readText();
// KDE gibt einem frischen Testfenster den Fokus teils nur kurz und dann dem vorher aktiven Fenster zurück — vor fokusabhängigen Schritten nachholen
async function ensureFocus(){ if(!win.isFocused()){ win.focus(); for(let i=0;i<30&&!win.isFocused();i++) await sleep(100); await sleep(200); } return win.isFocused(); }
const DATA=path.join(process.env.XDG_DATA_HOME,'alien-notes'), VAULT=path.join(DATA,'notes.ainv');

async function fresh(){
  R('lädt nur app://aliennotes/index.html', win.webContents.getURL()==='app://aliennotes/index.html', win.webContents.getURL());
  R('kein Node im Renderer', await js(`typeof require==='undefined'&&typeof process==='undefined'&&typeof module==='undefined'`));
  const keys=await js(`Object.keys(window.AlienDesktop).sort().join(',')`);
  R('Brücke hat genau clip, onBackground, onLock, saveBackup, store', keys==='clip,onBackground,onLock,saveBackup,store', keys);
  R('fetch nach außen scheitert', await js(`fetch('https://example.org/').then(()=>false,()=>true)`));
  R('window.open verweigert', await js(`window.open('https://example.org/')===null`));
  await js(`location.href='https://example.org/'`).catch(()=>{}); await sleep(600);
  R('Navigation verweigert', win.webContents.getURL()==='app://aliennotes/index.html', win.webContents.getURL());
  // Links: nur die feste Liste (Spendenseite DE/EN) geht an den System-Browser, alles andere verpufft (v1.6, Vorlage BTC Steuertool)
  // openOutside lässt höchstens einen Link je Sekunde durch → vor jedem erwarteten Öffnen 1,1 s Abstand
  const tryOpen=async(u,how)=>{ await sleep(1100); opened.length=0;
    if(how==='open') await js(`window.open(${JSON.stringify(u)})`); else await js(`location.href=${JSON.stringify(u)}`).catch(()=>{});
    await sleep(300); return opened.slice(); };
  const onApp=()=>win.webContents.getURL()==='app://aliennotes/index.html';
  for(const u of ['https://alien-investor.org/spenden.html','https://alien-investor.org/en/spenden.html'])
    { const o=await tryOpen(u,'open'); R('Link extern geöffnet: '+u, o.length===1&&o[0]===u, o); }
  { const o=await tryOpen('https://alien-investor.org/en/spenden.html','nav');
    R('Link per Navigation extern, Seite bleibt', o.length===1&&o[0]==='https://alien-investor.org/en/spenden.html'&&onApp(), o); }
  { await sleep(1100); R('window.open auf Listen-Link liefert trotzdem kein Fenster (deny)', await js(`window.open('https://alien-investor.org/spenden.html')===null`)&&BrowserWindow.getAllWindows().length===1, BrowserWindow.getAllWindows().length); }
  { const o=await tryOpen('HTTPS://ALIEN-INVESTOR.ORG:443/spenden.html','open');
    R('nicht-kanonische Schreibweise geht als kanonischer href hinaus', o.length===1&&o[0]==='https://alien-investor.org/spenden.html', o); }
  for(const [l,want] of [['de','https://alien-investor.org/spenden.html'],['en','https://alien-investor.org/en/spenden.html']]){
    await sleep(1100); opened.length=0; await js(`setLang(${JSON.stringify(l)}); document.getElementById('donate-link').click()`); await sleep(300);
    R('Spenden-Blitz extern geöffnet ('+l+')', opened.length===1&&opened[0]===want&&onApp(), opened.slice()); }
  await js(`setLang('de')`);
  { await sleep(1100); opened.length=0; await js(`for(let i=0;i<20;i++) window.open('https://alien-investor.org/spenden.html')`); await sleep(400);
    R('Fensterflut gedrosselt (20 × window.open → 1)', opened.length===1&&BrowserWindow.getAllWindows().length===1, {n:opened.length,win:BrowserWindow.getAllWindows().length}); }
  for(const u of ['https://example.org/','https://alien-investor.org/anderes.html','https://alien-investor.org/spenden.html/../x','http://alien-investor.org/spenden.html','https://alien-investor.org.evil.com/spenden.html','file:///etc/passwd','javascript:alert(1)',
      'https://alien-investor.org/spenden.html?ref=x','https://alien-investor.org/spenden.html#x','https://user:pw@alien-investor.org/spenden.html','https://alien-investor.org:8443/spenden.html','https://www.alien-investor.org/spenden.html','https://alien-investor.org/spenden.html/',
      'https://evilalien-investor.org/spenden.html','https://alien-investor.org/spenden.htmlx','https://evil.example/alien-investor.org/spenden.html','https://evil.example/?u=https://alien-investor.org/spenden.html'])   // Suffix-/Teilstring-Vergleich (Alien Pass Release-Audit v1.18 C M4)
    for(const how of (u.startsWith('javascript:')?['open']:['open','nav']))   // javascript: per location.href liefe IM Renderer (alert blockiert), ist keine Navigation
      { const o=await tryOpen(u,how); R('Link verweigert ('+how+'): '+u, o.length===0&&onApp(), {o,url:win.webContents.getURL()}); }
  // Handler direkt, ohne Chromium dazwischen (das kanonisiert URLs schon vorher; did-start-navigation taugt nicht als Zähler, es feuert in Electron 44 auch für abgebrochene Navigationen): preventDefault, deny und der geprüfte href (Alien Pass Release-Audit v1.18 C M1–M3)
  { const h={}; let woh=null; const fake={on:(n,f)=>{ h[n]=f; },setWindowOpenHandler:f=>{ woh=f; },setWebRTCIPHandlingPolicy:()=>{}};
    try{ app.emit('web-contents-created',{},fake); }catch(e){ R('Handler direkt: Ausnahme',false,String(e)); }
    await sleep(1100); opened.length=0; let pd=0;
    if(h['will-navigate']) h['will-navigate']({preventDefault:()=>pd++},' HTTPS://ALIEN-INVESTOR.ORG:443/en/../spenden.html\t');
    R('will-navigate (direkt): preventDefault + kanonischer href', pd===1&&opened.length===1&&opened[0]==='https://alien-investor.org/spenden.html', {pd,opened:opened.slice()});
    await sleep(1100); opened.length=0; pd=0;
    if(h['will-navigate']) h['will-navigate']({preventDefault:()=>pd++},'https://example.org/');
    R('will-navigate (direkt): fremde Adresse → preventDefault, nichts geöffnet', pd===1&&opened.length===0, {pd,opened:opened.slice()});
    await sleep(1100); opened.length=0; const r=woh?woh({url:'https://alien-investor.org/en/spenden.html'}):null;
    R('setWindowOpenHandler (direkt): deny auch für Listen-Links', !!r&&r.action==='deny'&&opened.length===1, {r,opened:opened.slice()});
    await sleep(1100); opened.length=0; let n=0; for(let i=0;i<3;i++){ if(woh) woh({url:'https://alien-investor.org/spenden.html'}); await sleep(400); n=opened.length; }
    R('Bremse: drei Links im Abstand von 400 ms → 1', n===1, n);
    // Zurückgestellte Systemuhr legt den Link nicht still (monotone Uhr, Alien Pass Release-Audit v1.18 A-2; Release-Audit v1.7 A-1): main.js läuft im selben Realm
    const dn=Date.now; Date.now=()=>dn()-3600e3; await sleep(1100); opened.length=0; if(woh) woh({url:'https://alien-investor.org/spenden.html'}); Date.now=dn;
    R('Bremse übersteht eine zurückgestellte Uhr (1 h)', opened.length===1, opened.slice()); }
  const ses=session.defaultSession;
  const st=async u=>{ try{ return (await ses.fetch(u)).status; }catch(e){ return 'FEHLER'; } };
  R('Protokoll liefert index.html', await st('app://aliennotes/index.html')===200);
  for(const u of ['app://aliennotes/%2e%2e/main.js','app://aliennotes/..%2fpackage.json','app://aliennotes/vendor/../../main.js','app://anders/index.html','app://aliennotes/app.js.map'])
    { const c=await st(u); R('Protokoll verweigert '+u, c===404||c==='FEHLER', c); }
  R('Hauptprozess erreicht kein Netz (webRequest)', await st('https://example.org/')==='FEHLER');
  R('kein Anwendungsmenü', Menu.getApplicationMenu()===null);
  R('Fenster-Icon gesetzt (Taskleiste, Alt+Tab)', fs.existsSync(path.join(__dirname,'icon.png'))&&fs.readFileSync(path.join(__dirname,'main.js'),'utf8').includes("icon:ICON"));
  R('.desktop StartupWMClass = package.json name', (()=>{ try{ const d=fs.readFileSync(path.join(__dirname,'..','..','flatpak','org.alieninvestor.notes.desktop'),'utf8'); return /^StartupWMClass=alien-notes$/m.test(d); }catch(_){ return 'n/a'; } })());

  { const u=dgram.createSocket('udp4'); let udp=0; u.on('message',()=>udp++); await new Promise(r=>u.bind(0,'127.0.0.1',r));
    let tcp=0; const t=net.createServer(c=>{ tcp++; c.destroy(); }); await new Promise(r=>t.listen(0,'127.0.0.1',r));
    const up=u.address().port, tp=t.address().port;
    const cand=await js(`(async()=>{ let n=0; try{ const pc=new RTCPeerConnection({iceServers:[{urls:'stun:127.0.0.1:${up}'},{urls:'turn:127.0.0.1:${tp}?transport=tcp',username:'u',credential:'p'}]});
      pc.onicecandidate=e=>{ if(e.candidate) n++; }; pc.createDataChannel('x'); await pc.setLocalDescription(await pc.createOffer()); await new Promise(r=>setTimeout(r,4000)); pc.close(); }catch(e){ return 'ERR '+e.message; } return n; })()`);
    R('WebRTC: kein UDP nach außen', udp===0, {udp,cand}); R('WebRTC: kein TCP/TURN nach außen', tcp===0, {tcp,cand});
    u.close(); t.close(); }
  const wp=win.webContents.getLastWebPreferences();
  R('Sandbox, Kontext-Isolation, kein Node', wp.sandbox===true&&wp.contextIsolation===true&&wp.nodeIntegration===false, {sandbox:wp.sandbox,contextIsolation:wp.contextIsolation,nodeIntegration:wp.nodeIntegration});
  win.webContents.openDevTools(); await sleep(400);
  R('DevTools lassen sich nicht öffnen', !win.webContents.isDevToolsOpened());
  R('Rechtschreibprüfung aus (lädt sonst aus dem Netz)', ses.isSpellCheckerEnabled()===false);
  R('keine Drosselung im Hintergrund (Sperr-/Lösch-Timer)', win.webContents.getBackgroundThrottling()===false);

  const w2=new BrowserWindow({show:false,webPreferences:{preload:path.join(__dirname,'preload.js'),sandbox:true,contextIsolation:true}});
  await w2.loadURL('data:text/html,<p>fremd</p>');
  const foreign=await w2.webContents.executeJavaScript(`(async()=>{const r=[];
    try{AlienDesktop.store.read();r.push('read-OK')}catch(e){r.push('read-DENIED')}
    try{AlienDesktop.store.write('x');r.push('write-OK')}catch(e){r.push('write-DENIED')}
    try{await AlienDesktop.clip.write({text:'x'});r.push('clip-OK')}catch(e){r.push('clip-DENIED')}
    try{await AlienDesktop.clip.selected('x');r.push('sel-OK')}catch(e){r.push('sel-DENIED')}
    try{await AlienDesktop.saveBackup('a.notes','x');r.push('save-OK')}catch(e){r.push('save-DENIED')}
    return r.join(',');})()`,true);
  R('fremder Frame: alle Brücken-Aufrufe abgewiesen', foreign==='read-DENIED,write-DENIED,clip-DENIED,sel-DENIED,save-DENIED', foreign);
  w2.destroy();

  const M1='an-harness-'+process.pid+'-a', M2='an-harness-'+process.pid+'-b';
  await js(`AlienDesktop.clip.write({text:${JSON.stringify(M1)}})`);
  R('Kopie trägt den KDE-Hinweis', await clipboard.has(KDE_HINT)&&(await clipboard.readText())===M1);
  await sleep(800); const kopieInPrim=(await prim())===M1;   // X11/KDE: Klipper spiegelt die Kopie in PRIMARY (Messung, je nach Klipper-Einstellung)
  await clipboard.selection.writeText(M1);   // Spiegelung deterministisch nachstellen — prüft den PRIMARY-Zweig auch ohne Klipper (Querfund Tresor v3.7 M-1)
  const vorM1=(await prim())===M1;
  await js(`AlienDesktop.clip.clear()`);
  R('eigene Kopie gelöscht', (await clipboard.readText())!==M1);
  R('eigene Kopie auch aus PRIMARY gelöscht (v1.8, Klipper spiegelt hier: '+kopieInPrim+')', vorM1&&(await prim())==='', {vorM1,kopieInPrim});
  await js(`AlienDesktop.clip.write({text:${JSON.stringify(M1)}})`);
  await clipboard.write([new ClipboardItem({'text/plain':new Blob([M2],{type:'text/plain'}),[KDE_HINT]:new Blob(['secret'])})]);
  await js(`AlienDesktop.clip.clear()`);
  R('fremde Kopie bleibt stehen', (await clipboard.readText())===M2);
  await clipboard.clear();

  const M3='an-harness-'+process.pid+'-sel', M4='an-harness-'+process.pid+'-fremd';
  await clipboard.selection.writeText(M3); await js(`AlienDesktop.clip.selected(${JSON.stringify(M3)})`); await js(`AlienDesktop.clip.clear()`);
  R('eigene Markierung aus der Auswahl gelöscht', (await clipboard.selection.readText())!==M3);
  await js(`AlienDesktop.clip.selected(${JSON.stringify(M3)})`); await clipboard.selection.writeText(M4); await js(`AlienDesktop.clip.clear()`);
  R('fremde Markierung bleibt stehen', (await clipboard.selection.readText())===M4);
  await clipboard.selection.clear();
  // Ab hier aus Alien Pass v1.19 (Release-Audit run-10), v1.8
  // Hash-Ring (R2-N2): eine spätere falsche Meldung (Wert eines anderen Feldes, das nicht in PRIMARY liegt) verdrängt die richtige nicht mehr
  { const P='an-harness-'+process.pid+'-ring-p';
    await clipboard.selection.writeText(P); await js(`AlienDesktop.clip.selected(${JSON.stringify(P)})`);
    for(let i=0;i<7;i++) await js(`AlienDesktop.clip.selected(${JSON.stringify('anderes-feld-'+i)})`);
    await js(`AlienDesktop.clip.clear()`);
    R('Hash-Ring: Markierung nach 7 fremden Meldungen trotzdem aus PRIMARY gelöscht', (await prim())==='', {prim:(await prim()).length});
    await clipboard.selection.writeText(P); await js(`AlienDesktop.clip.selected(${JSON.stringify(P)})`);
    for(let i=0;i<8;i++) await js(`AlienDesktop.clip.selected('')`);   // acht leere: würden sie gehasht, wäre P verdrängt (Release-Audit v1.8 C-6)
    await js(`AlienDesktop.clip.clear()`);
    R('Hash-Ring: leere Meldungen verdrängen nichts (8 ×)', (await prim())==='', {prim:(await prim()).length});
    await clipboard.selection.writeText(P); await js(`AlienDesktop.clip.selected(${JSON.stringify(P)})`);
    for(let i=0;i<7;i++) await js(`AlienDesktop.clip.selected(${JSON.stringify('anderes-feld-'+i)})`);
    await js(`AlienDesktop.clip.selected(${JSON.stringify(P)})`); await js(`AlienDesktop.clip.selected('anderes-feld-x')`);   // P erneut gemeldet → nach hinten, die 9. Meldung verdrängt nicht P
    await js(`AlienDesktop.clip.clear()`);
    R('Hash-Ring: erneut gemeldete Markierung rückt nach hinten (P, 7 fremde, P, 1 fremde → P gelöscht)', (await prim())==='', {prim:(await prim()).length});
    await clipboard.selection.writeText(P); await js(`AlienDesktop.clip.selected(${JSON.stringify(P)})`);
    for(let i=0;i<8;i++) await js(`AlienDesktop.clip.selected(${JSON.stringify('anderes-feld-'+i)})`);
    await js(`AlienDesktop.clip.clear()`);
    R('Hash-Ring: Grenze 8 — nach 8 fremden Meldungen ist die erste verdrängt (bleibt stehen)', (await prim())===P, {prim:(await prim()).length});
    await clipboard.clear(); await clipboard.selection.clear(); }
  // Spiegelung Markierung → CLIPBOARD: am 04.10.2026 einmal beobachtet (CLIPBOARD vorher geleert), in den Wiederholungen und in Pass nicht — darum hier
  // nur protokolliert; hart geprüft wird die Abwehr in clearOwned (CLIPBOARD auch gegen den Ring, Pass A-4)
  { const P='an-harness-'+process.pid+'-rueck';
    await clipboard.clear(); await clipboard.selection.writeText(P); await js(`AlienDesktop.clip.selected(${JSON.stringify(P)})`); await sleep(800);
    const gespiegelt=(await clipboard.readText())===P;
    R('Messung: Markierung von Klipper nach CLIPBOARD gespiegelt: '+gespiegelt, true, {gespiegelt});
    await clipboard.writeText(P); await js(`AlienDesktop.clip.clear()`);
    R('Abwehr: steht die Markierung in CLIPBOARD, wird sie dort mitgelöscht', (await clipboard.readText())!==P&&(await prim())==='');
    await clipboard.clear(); await clipboard.selection.clear(); }
  // Hängender Besitzer (Pass A-1/R2-1): das Lesen von CLIPBOARD hängt FÜR IMMER — PRIMARY wird trotzdem gelöscht, die Kette läuft weiter
  { const P='an-harness-'+process.pid+'-haengt-p', N='an-harness-'+process.pid+'-nach-haenger', orig=clipboard.readText;
    clipboard.readText=function(){ return new Promise(()=>{}); };
    try{ await clipboard.selection.writeText(P); await js(`AlienDesktop.clip.selected(${JSON.stringify(P)})`);
      const t0=Date.now(); const r1=await js(`Promise.race([AlienDesktop.clip.clear().then(()=>'ok',()=>'abgelehnt'),new Promise(r=>setTimeout(()=>r('haengt'),6000))])`); const ms=Date.now()-t0;
      R('CLIPBOARD-Lesen hängt dauerhaft: PRIMARY trotzdem gelöscht, Löschen kehrt nach ~2 s zurück', r1==='ok'&&ms>=1800&&ms<4500&&(await prim())==='', {r1,ms,prim:(await prim()).length}); }
    finally{ clipboard.readText=orig; }
    // … und danach: einmaliger Hänger bei einer Kopie — die Hülle fasst selbst nach (kein weiteres clear der App), dann löscht auch das nächste Löschen
    let einmal=true; clipboard.readText=function(...a){ if(einmal){ einmal=false; return new Promise(()=>{}); } return orig.apply(this,a); };
    try{ const M='an-harness-'+process.pid+'-nachfassen';
      await js(`AlienDesktop.clip.write({text:${JSON.stringify(M)}})`); const drin=(await orig.call(clipboard))===M;   // Vorbedingung: Kopie steht
      const t0=Date.now(); await js(`AlienDesktop.clip.clear().catch(()=>'abgelehnt')`); const ms=Date.now()-t0;   // Vorbedingung: das Lesen hing wirklich (~2 s)
      let weg=false; for(let i=0;i<40&&!weg;i++){ await sleep(100); weg=(await orig.call(clipboard))!==M; }
      R('einmaliger Hänger: die Hülle fasst nach und löscht die Kopie ohne neues clear der App', drin&&ms>=1800&&weg, {drin,ms,weg}); }
    finally{ clipboard.readText=orig; }
    await js(`AlienDesktop.clip.write({text:${JSON.stringify(N)}})`); await js(`AlienDesktop.clip.clear().catch(()=>'abgelehnt')`);
    R('nach dem Hänger: Kette läuft, das nächste Löschen löscht', (await clipboard.readText())!==N);
    await clipboard.clear(); await clipboard.selection.clear(); }
  // Spätes Schreiben (Pass R2-2): clipboard.write braucht 2,5 s — die App bekommt eine Ablehnung (setzt keine Frist), die doch noch gelandete Kopie wird gelöscht
  { const M='an-harness-'+process.pid+'-spaet', ow=clipboard.write;
    // Klipper spiegelt erst NACH dem Landen — hier 300 ms danach nachgestellt (Pass N-2)
    clipboard.write=async function(...a){ await sleep(2500); const r=await ow.apply(this,a); setTimeout(()=>{ clipboard.selection.writeText(M); },300); return r; };
    let r='?'; try{ r=await js(`AlienDesktop.clip.write({text:${JSON.stringify(M)}}).then(()=>'ok',()=>'abgelehnt')`); }
    finally{ clipboard.write=ow; }
    await sleep(4000);
    R('spätes Schreiben: App bekommt Ablehnung, die gelandete Kopie ist danach aus CLIPBOARD und PRIMARY weg', r==='abgelehnt'&&(await clipboard.readText())!==M&&(await prim())==='', {r,clip:(await clipboard.readText())===M,prim:(await prim()).length});
    await clipboard.clear(); await clipboard.selection.clear(); }
  // Kappung der offenen Hashes wirft die ÄLTESTEN (Pass N-1): zwei Zyklen mit hängendem PRIMARY-Lesen (je Kopie + 8 Markierungen = 18 Hashes),
  // danach erholt sich der Besitzer — die NEUESTE Kopie muss trotzdem aus PRIMARY verschwinden
  { let vorP2=false; const tK=Date.now(), sr=clipboard.selection.readText, P2='zyklus4-markierung-7';   // die zuletzt gemeldete Markierung — unter X11 liegt immer die letzte in PRIMARY; wirft die Kappung die NEUESTEN, fehlt genau sie
    clipboard.selection.readText=function(){ return new Promise(()=>{}); };
    // 4 × (Kopie + 8 Markierungen) = 36 > 32: die Kappung greift wirklich (Release-Audit v1.8 C-1)
    try{ for(const z of ['zyklus1','zyklus2','zyklus3','zyklus4']){ await js(`AlienDesktop.clip.write({text:${JSON.stringify('an-harness-'+process.pid+'-'+z)}})`);
        for(let i=0;i<8;i++) await js(`AlienDesktop.clip.selected(${JSON.stringify(z+'-markierung-'+i)})`);
        await js(`AlienDesktop.clip.clear().catch(()=>0)`); }
      await clipboard.selection.writeText(P2); vorP2=(await sr.call(clipboard.selection))===P2; }   // liegt schon WÄHREND der Hängephase in PRIMARY (sonst gab ein
    finally{ clipboard.selection.readText=sr; }    // Nachfassen zwischen Erholung und Spiegel die Hashes korrekt frei, und der Test prüfte nichts — 04.10.2026 gemessen)
    let weg=false; for(let i=0;i<50&&!weg;i++){ await sleep(100); weg=(await prim())===''; }
    // Hat die lange Hängephase das Nachfassen schon in den 30-s-Takt gebracht (N-3, gewollt), löscht das nächste Löschen der App (Frist/Sperre) — auch das
    // findet die neueste Kopie nur, wenn die Kappung die ÄLTESTEN geworfen hat
    const perNachfassen=weg; if(!weg){ await js(`AlienDesktop.clip.clear()`); await sleep(200); weg=(await prim())===''; }
    R('Kappung der offenen Hashes (36 > 32) wirft die ältesten: neueste Markierung nach Erholung aus PRIMARY', vorP2&&weg, {vorP2,ms:Date.now()-tK,perNachfassen});
    await clipboard.clear(); await clipboard.selection.clear(); }
  // Abgelehntes Lesen zählt wie Hängen (Pass N-5): einmal lehnt readText ab — die Hülle fasst nach, die Kopie verschwindet ohne neues clear der App
  { const M='an-harness-'+process.pid+'-abgelehnt', orig=clipboard.readText; let einmal=true;
    clipboard.readText=function(...a){ if(einmal){ einmal=false; return Promise.reject(new Error('X11')); } return orig.apply(this,a); };
    try{ await js(`AlienDesktop.clip.write({text:${JSON.stringify(M)}})`); await js(`AlienDesktop.clip.clear().catch(()=>0)`);
      let weg=false; for(let i=0;i<40&&!weg;i++){ await sleep(100); weg=(await orig.call(clipboard))!==M; }
      R('abgelehntes Lesen: die Hülle fasst nach und löscht die Kopie', !einmal&&weg, {weg}); }
    finally{ clipboard.readText=orig; }
    await clipboard.clear(); await clipboard.selection.clear(); }
  // CLIP_MAX 128 Ki (ganze Notiz): eine lange Kopie geht über die Brücke und wird gelöscht, eine über der Grenze wird abgewiesen
  { const L='an-harness-'+process.pid+'-langkopie-'+'z'.repeat(60000);
    const a=await js(`AlienDesktop.clip.write({text:${JSON.stringify(L)}}).then(()=>'ok',()=>'abgewiesen')`); const drin=(await clipboard.readText())===L;
    await js(`AlienDesktop.clip.clear()`);
    R('Kopie mit 60.000 Zeichen über die Brücke und wieder gelöscht', a==='ok'&&drin&&(await clipboard.readText())!==L, {a,drin});
    const genau=await js(`AlienDesktop.clip.write({text:'z'.repeat(128*1024)}).then(()=>'ok',()=>'abgewiesen')`); await js(`AlienDesktop.clip.clear()`);
    const big=await js(`AlienDesktop.clip.write({text:'z'.repeat(128*1024+1)}).then(()=>'ok',()=>'abgewiesen')`);
    R('CLIP_MAX genau 128 Ki angenommen, 128 Ki + 1 abgewiesen', genau==='ok'&&big==='abgewiesen', {genau,big});
    await clipboard.clear(); await clipboard.selection.clear(); }
  // Grenze nur für Markierungen (gehasht): Markierung über 20.000 wird angenommen und gelöscht, über SEL_MAX abgewiesen (v1.7 B-M1)
  { const L='an-harness-'+process.pid+'-lang-'+'y'.repeat(60000);
    await clipboard.selection.writeText(L); const a=await js(`AlienDesktop.clip.selected(${JSON.stringify(L)}).then(()=>'ok',()=>'abgewiesen')`); await js(`AlienDesktop.clip.clear()`);
    R('Markierung mit 60.000 Zeichen gemeldet und gelöscht', a==='ok'&&(await prim())==='', a);
    let big='bad'; try{ big=await js(`AlienDesktop.clip.selected('y'.repeat(16*1024*1024+1)).then(()=>'ok',()=>'abgewiesen')`); }catch(_){}
    R('Markierung über SEL_MAX (16 Mi) abgewiesen', big==='abgewiesen', big);
    await clipboard.clear(); await clipboard.selection.clear(); }
  // Wettlauf (Querfund Tresor v3.7 A-1/R2-1): Kopie während eines laufenden Löschens — ohne Kette nullte das Löschen nach seinen awaits den Hash der neuen Kopie
  { const M6='an-harness-'+process.pid+'-lauf', M7='an-harness-'+process.pid+'-mitten';
    await js(`AlienDesktop.clip.write({text:${JSON.stringify(M6)}})`); await sleep(300);
    await js(`(()=>{ AlienDesktop.clip.clear(); AlienDesktop.clip.write({text:${JSON.stringify(M7)}}); return true; })()`); await sleep(600);
    const drin=(await clipboard.readText())===M7;   // Vorbedingung: die neue Kopie steht (die Kette hat sie NACH dem Löschen geschrieben)
    await clipboard.selection.writeText(M7);   // Klipper-Spiegelung
    await js(`AlienDesktop.clip.clear()`); await sleep(200);
    R('Kopie während eines laufenden Löschens: beim nächsten Löschen aus CLIPBOARD und PRIMARY', drin&&(await clipboard.readText())!==M7&&(await prim())==='', {drin});
    await clipboard.clear(); await clipboard.selection.clear(); }
  // Variante nur mit Markierungen: alte Markierung A wird gerade gelöscht, die neue Meldung X kommt mitten hinein
  { const A='an-harness-'+process.pid+'-alt', X='an-harness-'+process.pid+'-neu';
    await clipboard.selection.writeText(A); await js(`AlienDesktop.clip.selected(${JSON.stringify(A)})`);
    await js(`(()=>{ AlienDesktop.clip.clear(); AlienDesktop.clip.selected(${JSON.stringify(X)}); return true; })()`); await sleep(400);
    await clipboard.selection.writeText(X);   // wie X11 beim Markieren
    const vorX=(await prim())===X;   // Vorbedingung: das erste Löschen ist durch und hat X nicht (zufällig) mitgenommen
    await js(`AlienDesktop.clip.clear()`); await sleep(200);
    R('Markierung während eines laufenden Löschens gemeldet: beim nächsten Löschen aus PRIMARY', vorX&&(await prim())==='', {vorX,prim:(await prim()).length});
    await clipboard.clear(); await clipboard.selection.clear(); }

  // Notizen anlegen über die Oberfläche → Datei statt Browser-Speicher
  R('ohne Datei: Einrichtung', await until(visible('screen-setup'),15000));
  await until(`/ms/.test(document.getElementById('setup-bench').textContent)`,30000);
  await fill('setup-pass1',PP); await fill('setup-pass2',PP); await click('#setup-btn');
  R('Notizen angelegt', await until(visible('screen-app')));
  await click('button[data-action="newEntry"]'); await sleep(200);
  await fill('f-title','Harness Notiz'); await fill('f-body','harness-geheim-5r7t'); await click('button[data-action="doneEditor"]');
  R('Notiz gespeichert', await until(`[...document.querySelectorAll('#entry-list .entry .t')].some(n=>n.textContent==='Harness Notiz')`,10000));
  R('Zweispaltig: Editor steckt in der Listen-Ansicht (html.desk)', await js(`document.documentElement.classList.contains('desk')&&document.getElementById('tab-add').parentElement.id==='tab-list'`));
  let stF=null, stD=null; try{ stF=fs.statSync(VAULT); stD=fs.statSync(DATA); }catch(_){}
  R('Notizen-Datei existiert', !!stF);
  R('Datei 600, Ordner 700', !!stF&&(stF.mode&0o777)===0o600&&(stD.mode&0o777)===0o700, stF&&{file:(stF.mode&0o777).toString(8),dir:(stD.mode&0o777).toString(8)});
  R('keine Temp-Reste', fs.readdirSync(DATA).every(n=>n==='notes.ainv'), fs.readdirSync(DATA));
  R('Datei ist AINV1 und enthält keinen Klartext', (()=>{ const s=fs.readFileSync(VAULT,'utf8'); let j=null; try{ j=JSON.parse(s); }catch(_){} return !!j&&j.magic==='AINV1'&&!s.includes('harness-geheim')&&!s.includes('Harness Notiz'); })());
  R('Notizen nicht im Browser-Speicher', await js(`localStorage.getItem('ai-notes-vault')===null`));

  // wie eine echte Maus-Markierung: der Fokus verlässt ein Eingabefeld (sonst liest selText dessen leere Auswahl und Chromium kopiert selbst — sporadisch, v1.6)
  await js(`(()=>{ if(document.activeElement&&document.activeElement.blur) document.activeElement.blur(); const n=[...document.querySelectorAll('#entry-list .entry .t')].find(x=>x.textContent==='Harness Notiz'); const r=document.createRange(); r.selectNodeContents(n); const g=getSelection(); g.removeAllRanges(); g.addRange(r); document.execCommand('copy'); g.removeAllRanges(); })()`);
  await sleep(400);
  R('Strg+C: Kopie mit KDE-Hinweis', await clipboard.has(KDE_HINT)&&(await clipboard.readText())==='Harness Notiz', {hint:await clipboard.has(KDE_HINT),len:(await clipboard.readText()).length,foc:win.isFocused(),dfoc:await js('document.hasFocus()'),ae:await js(`(document.activeElement&&(document.activeElement.tagName+'#'+document.activeElement.id))`),url:win.webContents.getURL()});
  await clipboard.clear();

  const M5='an-harness-'+process.pid+'-cut';
  await click('button[data-action="newEntry"]'); await sleep(300);
  await js(`(()=>{ const n=document.getElementById('f-body'); n.value='vor '+${JSON.stringify(M5)}; n.focus(); n.setSelectionRange(4,n.value.length); })()`);
  win.webContents.cut(); await sleep(500);
  R('Strg+X: Kopie mit KDE-Hinweis', await clipboard.has(KDE_HINT)&&(await clipboard.readText())===M5);
  R('Strg+X: Text aus dem Feld entfernt', await js(`document.getElementById('f-body').value==='vor '`));
  await js(`AlienDesktop.clip.clear()`); await sleep(200);
  R('Strg+X: Kopie wird wieder gelöscht', (await clipboard.readText())!==M5);
  await clipboard.clear(); await js(`document.getElementById('f-body').value=''; App.doneEditor()`).catch(()=>{}); await sleep(500);
}
async function restart(){
  R('Neustart: Sperrbildschirm statt Einrichtung', await until(visible('screen-lock'),15000)&&!(await js(visible('screen-setup'))));
  // Erst den Fensterfokus abwarten: KDE gibt ihn einem frischen Fenster verzögert, teils mit blur/focus-Pendeln — ein spätes blur leerte die gerade
  // eingesetzte Passphrase (Gate-Hygiene), Entsperren lief dann ins Leere und 30 Prüfungen fielen als Kaskade (04.10.2026, 2 von ~10 Läufen)
  for(let i=0;i<30&&!win.isFocused();i++) await sleep(100);
  if(!win.isFocused()){ win.focus(); for(let i=0;i<30&&!win.isFocused();i++) await sleep(100); }   // KDE verweigert Fokus, solange man in einem anderen Fenster arbeitet
  await sleep(400);
  R('Neustart: Testfenster hat den Fokus (sonst kippen Tab-/Auge-/PRIMARY-Prüfungen als Kaskade — Umgebung, nicht App: während verify-desktop nicht am Desktop arbeiten)', win.isFocused());
  // Gesperrt, Passphrase per Strg+A markiert, Fensterwechsel: das Feld wird geleert UND die Markierung aus PRIMARY gelöscht (Pass B-3, in der echten Hülle — Release-Audit v1.8 C-7)
  { const B='blur-pass-'+process.pid; await fill('lock-pass',B); await js(`document.getElementById('lock-pass').focus(); true`); await sleep(200);
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']}); win.webContents.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['control']}); await sleep(400);
    const inP=(await prim())===B;
    win.webContents.send('bg','blur'); await sleep(600);
    R('gesperrt, Strg+A in der Passphrase, Fensterwechsel: Feld leer und PRIMARY geräumt (B-3)', inP&&(await js(`document.getElementById('lock-pass').value===''`))&&(await prim())==='', {inP,prim:(await prim()).length});
    await clipboard.selection.clear(); }
  const focVorPP=await ensureFocus(); await fill('lock-pass',PP);
  await clipboard.selection.writeText('vorher-'+process.pid);
  await js(`document.getElementById('lock-pass').focus(); true`); await sleep(200);
  if(!(await ensureFocus())||!(await js(`document.getElementById('lock-pass').value.length`))){ await ensureFocus(); await fill('lock-pass',PP); await js(`document.getElementById('lock-pass').focus(); true`); await sleep(200); }   // Fokus kurz verloren → blur leerte das Feld
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']}); win.webContents.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['control']});
  await sleep(500);
  R('Sperrbildschirm: Strg+A im maskierten Feld legt die Passphrase in PRIMARY (Chromium) — darum muss die App sie melden', (await clipboard.selection.readText())===PP);
  let vorKlick={len:await js(`document.getElementById('lock-pass').value.length`),foc:win.isFocused(),focVorPP};
  if(!vorKlick.len){ await ensureFocus(); await fill('lock-pass',PP); vorKlick.nachgefuellt=true; }   // Umgebung (Fokus weg → blur leerte das Feld), nicht Gegenstand dieser Prüfung
  await click('#unlock-btn');
  R('entsperrt mit der Passphrase', await until(visible('screen-app')), vorKlick);
  R('Notiz aus der Datei da', await until(`[...document.querySelectorAll('#entry-list .entry .t')].some(n=>n.textContent==='Harness Notiz')`,10000));
  { const t0=Date.now(); let weg=false; while(Date.now()-t0<5000&&!(weg=(await prim())!==PP)) await sleep(100);   // unter Last kann das Löschen nach Argon2 dauern (Pass R2-5)
    R('Sperrbildschirm: markierte Passphrase nach dem Entsperren aus der Auswahl', weg, {ms:Date.now()-t0}); }
  await clipboard.selection.clear();
  // PIN in der echten Hülle: einrichten, Hintergrund-Sperre, per PIN öffnen — nichts davon auf der Platte
  await js(`App.tab('settings')`); await sleep(200);
  R('PIN-Karte in der Hülle sichtbar', await js(`(()=>{const n=document.getElementById('pin-card');return !!n&&getComputedStyle(n).display!=='none';})()`));
  await fill('pin-new','246810'); await fill('pin-rep','246810'); await fill('pin-pass',PP); await click('#pin-btn-on');
  R('PIN eingerichtet', await until(visible('pin-on'),40000));
  await js(`App.setBgLock('0')`); await sleep(600);
  const h0=fs.readFileSync(VAULT,'utf8');   // nach der Einstellung lesen: die Datei darf sich durch PIN-Einrichtung + Sperre nicht mehr ändern
  win.minimize(); R('Hintergrund-Sperre', await until(visible('screen-lock'),5000)); await restoreFocused(); await sleep(400);
  R('PIN-Block auf dem Sperrbildschirm', await js(visible('pin-box')));
  R('Notizen-Datei durch PIN-Einrichtung und Sperre unverändert (nichts auf der Platte)', fs.readFileSync(VAULT,'utf8')===h0&&fs.readdirSync(DATA).every(n=>n==='notes.ainv'));
  await fill('lock-pin','246810'); await click('#pin-btn');
  R('per PIN entsperrt', await until(visible('screen-app'),40000));
  await js(`App.setBgLock('1800')`); await sleep(400);
  // Auge beim Tippen (v1.6, aus Alien Pass v1.17): Chromium setzt beim type-Wechsel die Auswahl auf 0 — echte Tasten und echter Mausklick aufs Auge
  const key=c=>{ win.webContents.sendInputEvent({type:'char',keyCode:c}); };
  const press=k=>{ win.webContents.sendInputEvent({type:'keyDown',keyCode:k}); win.webContents.sendInputEvent({type:'keyUp',keyCode:k}); };
  const eye=async()=>{ const r=await js(`(()=>{const b=document.querySelector('[data-showpass="cp1"]').getBoundingClientRect();return {x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2)};})()`);
    win.webContents.sendInputEvent({type:'mouseDown',x:r.x,y:r.y,button:'left',clickCount:1}); win.webContents.sendInputEvent({type:'mouseUp',x:r.x,y:r.y,button:'left',clickCount:1}); await sleep(300); };
  const cur=()=>js(`(()=>{const f=document.getElementById('cp1');return {v:f.value,s:f.selectionStart,e:f.selectionEnd,t:f.type,foc:document.activeElement===f};})()`);
  await js(`App.tab('settings')`); await sleep(300); await ensureFocus();
  await js(`(()=>{const f=document.getElementById('cp1'); f.scrollIntoView({block:'center'}); f.value=''; f.focus(); return true;})()`); await sleep(200);
  for(const c of 'abcdef') key(c); await sleep(200);
  await eye(); key('X'); await sleep(200);
  { const c=await cur(); R('Auge beim Tippen: Cursor bleibt am Ende (aufdecken)', c.v==='abcdefX'&&c.s===7&&c.t==='text'&&c.foc, {s:c.s,t:c.t,foc:c.foc,len:c.v.length}); }
  press('Left'); press('Left'); await sleep(100); await eye(); key('Y'); await sleep(200);
  { const c=await cur(); R('Auge beim Tippen: Cursor mitten im Wort bleibt stehen (verdecken)', c.v==='abcdeYfX'&&c.s===6&&c.t==='password', {s:c.s,t:c.t,v_ok:c.v==='abcdeYfX'}); }
  // Markierte Passphrase + Auge auf → keine Klartext-Markierung, Cursor am Ende (Release-Audit v1.6 B-V1)
  await eye(); await sleep(100);   // wieder verdeckt? (nach dem zweiten Klick ist das Feld maskiert)
  if((await cur()).t!=='password') await eye();
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']}); win.webContents.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['control']}); await sleep(200);
  await eye();
  { const c=await cur(); R('Auge auf bei markierter Passphrase: keine Klartext-Markierung, Cursor am Ende', c.t==='text'&&c.s===c.e&&c.e===c.v.length&&c.foc, {s:c.s,e:c.e,t:c.t,len:c.v.length}); }
  // Fokus-Markierung (v1.7, aus Alien Pass v1.18 B-1): Tab in die gefüllte, maskierte neue Passphrase markiert den ganzen Inhalt, Chromium legt ihn in PRIMARY
  // → muss gemeldet und beim Sperren gelöscht werden. Je Test ein eigener Wert (der Auge-Test oben hat 'abcdeYfX' per Strg+A schon gemeldet).
  // Tab-Reihenfolge: cp-cur, dessen Auge, cp1, dessen Auge — der Fokus startet auf dem Auge von cp-cur.
  const unlock=async()=>{ await ensureFocus(); await fill('lock-pass',PP); await click('#unlock-btn'); await until(visible('screen-app')); await js(`App.tab('settings')`); await sleep(300); };
  const prepTab=async V=>{ await ensureFocus(); if((await cur()).t!=='password') await eye();
    await js(`(()=>{ const p=document.getElementById('cp1'); p.value=${JSON.stringify(V)}; p.dispatchEvent(new Event('input',{bubbles:true})); const b=document.querySelector('[data-showpass="cp-cur"]'); b.scrollIntoView({block:'center'}); b.focus(); return true; })()`); await sleep(150); };
  const realClick=async sel=>{ const r=await js(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}); b.scrollIntoView({block:'center'}); const q=b.getBoundingClientRect(); return {x:Math.round(q.left+q.width/2),y:Math.round(q.top+q.height/2)};})()`);
    win.webContents.sendInputEvent({type:'mouseDown',x:r.x,y:r.y,button:'left',clickCount:1}); win.webContents.sendInputEvent({type:'mouseUp',x:r.x,y:r.y,button:'left',clickCount:1}); await sleep(400); };
  { const V='tab-wert-'+process.pid; await prepTab(V);
    await clipboard.selection.writeText('vorher-tab-'+process.pid);
    press('Tab'); await sleep(500);
    const c=await cur(); R('Tab ins Passwortfeld: Feld maskiert und ganz markiert (Ausgangslage)', c.t==='password'&&c.foc&&c.s===0&&c.e===c.v.length&&c.v===V, {s:c.s,e:c.e,t:c.t,foc:c.foc});
    R('Tab ins Passwortfeld: Chromium legt den Wert in PRIMARY (Messung)', (await clipboard.selection.readText())===V);
    await js(`App.lockNow(); true`); await sleep(600);
    R('Tab ins Passwortfeld: nach dem Sperren nicht mehr in PRIMARY (gemeldet + gelöscht)', (await clipboard.selection.readText())==='');
    await clipboard.selection.clear(); }
  // Wie am Gerät (Alien Pass 03.10.2026): Tab ins Passwortfeld, (Fensterwechsel, zurück,) echte Klicks auf „Einstellungen“ und „Jetzt sperren“.
  // In Notes leert der Fensterwechsel die getippte Passphrase (Gate-Hygiene) — dann gibt es keine Punkte mehr. Die Punkte-Falle (Klick auf einen Knopf, leere Range
  // am Feld, String() = Punkte überschreibt den Hash) zeigt sich hier OHNE Fensterwechsel (gemessen 03.10.2026: Range an div.pw-wrap, 13 Punkte).
  for(const sw of [true,false]){ await unlock(); const V='geraet-'+(sw?'w':'o')+'-'+process.pid; await prepTab(V);
    await clipboard.selection.writeText('vorher-geraet-'+process.pid);
    press('Tab'); await sleep(500);
    const inP=(await clipboard.selection.readText())===V;
    if(sw){ win.blur(); await sleep(400); win.focus(); await sleep(400); }
    await realClick('button.tab[data-tab="settings"]'); await realClick('button[data-action="lockNow"]'); await sleep(500);
    R('Wie am Gerät (Tab, '+(sw?'Fensterwechsel, ':'ohne Fensterwechsel, ')+'Klick Einstellungen + Jetzt sperren): Wert war in PRIMARY und ist danach weg', inP&&(await js(visible('screen-lock')))&&(await clipboard.selection.readText())==='', {inP,prim:(await clipboard.selection.readText()).length});
    await clipboard.selection.clear(); }
  // Markiertes Feld, Fokus per Mausklick woanders (Kästchen), dann Strg+C: Kopie über die Brücke mit KDE-Hinweis, nicht Chromium selbst (Pass-Audit Runde 4)
  { await fill('lock-pass',PP); await click('#unlock-btn'); await until(visible('screen-app'));
    await click('button[data-action="newEntry"]'); await sleep(400);
    const V='kopie-'+process.pid;
    await js(`(()=>{ const u=document.getElementById('f-title'); u.value=${JSON.stringify(V)}; u.focus(); u.select(); return true; })()`); await sleep(200);
    await realClick('#f-fav'); await sleep(100);
    const ae=await js(`document.activeElement&&document.activeElement.id`);
    await clipboard.clear(); win.webContents.copy(); await sleep(500);
    R('Feld markiert, Klick aufs Kästchen, Strg+C: Kopie über die Brücke (KDE-Hinweis, echter Wert)', ae==='f-fav'&&await clipboard.has(KDE_HINT)&&(await clipboard.readText())===V, {ae,hint:await clipboard.has(KDE_HINT),len:(await clipboard.readText()).length});
    await js(`AlienDesktop.clip.clear()`); await sleep(200); await clipboard.clear(); await clipboard.selection.clear();
    await js(`App.doneEditor()`).catch(()=>{}); await sleep(500);   // deterministisch: es bleibt immer genau die Notiz „kopie-PID“ (Release-Audit v1.7 A-3)
    await js(`App.lockNow(); true`); await sleep(600); }
  // Gehaltenes Tab (Pass-Audit Runde 2): keyDown wiederholt sich, der Fokus wandert über cp1 weiter auf dessen Auge, keyup kommt erst auf dem Knopf an
  { await unlock(); const V='halte-tab-'+process.pid; await prepTab(V);
    await clipboard.selection.writeText('vorher-halt-'+process.pid);
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'}); await sleep(120); win.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'}); await sleep(120);
    const ae=await js(`(document.activeElement&&(document.activeElement.className||document.activeElement.id))`);
    win.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'}); await sleep(400);
    R('Tab gehalten: Fokus über cp1 hinaus auf das Auge, Wert in PRIMARY (Messung)', /pw-eye/.test(ae)&&(await clipboard.selection.readText())===V, {ae});
    await js(`App.lockNow(); true`); await sleep(600);
    R('Tab gehalten: nach dem Sperren nicht mehr in PRIMARY', (await clipboard.selection.readText())==='');
    await clipboard.selection.clear(); }
  // Varianten ohne Pause (Pass-Audit Runde 3): zwei Tab-keyDowns direkt hintereinander bzw. Tab + sofort ein Zeichen, je vor dem Loslassen
  for(const [name,seq] of [['zwei Tabs ohne Pause',['Tab','Tab']],['Tab + sofort getippt',['Tab','char']]]){
    await unlock(); const V='schnell-'+seq.join('')+'-'+process.pid; await prepTab(V);
    await clipboard.selection.writeText('vorher-schnell-'+process.pid);
    for(const k of seq) if(k==='char') win.webContents.sendInputEvent({type:'char',keyCode:'x'}); else win.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});
    win.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'}); await sleep(400);
    const inP=(await clipboard.selection.readText())===V;
    await js(`App.lockNow(); true`); await sleep(600);
    R('Schnell ('+name+'): Wert war in PRIMARY und ist nach dem Sperren weg', inP&&(await clipboard.selection.readText())==='', {inP});
    await clipboard.selection.clear(); }
  // Nur der Capture-keydown meldet (Release-Audit v1.7 A-2): Strg+A als keyDown OHNE keyUp (kein keyup-Melder, kein focusin, kein mouseup), dann eine echte Taste
  { await unlock(); const V='keydown-'+process.pid; if((await cur()).t!=='password') await eye();
    await js(`(()=>{ const p=document.getElementById('cp1'); p.value=${JSON.stringify(V)}; p.scrollIntoView({block:'center'}); p.focus(); p.setSelectionRange(p.value.length,p.value.length); return true; })()`); await sleep(200);
    await clipboard.selection.writeText('vorher-keydown-'+process.pid);
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']}); await sleep(300);
    const inP=(await clipboard.selection.readText())===V;
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'X'}); win.webContents.sendInputEvent({type:'char',keyCode:'x'}); win.webContents.sendInputEvent({type:'keyUp',keyCode:'X'}); await sleep(300);
    await js(`App.lockNow(); true`); await sleep(600);
    R('Strg+A ohne Loslassen, dann getippt: Capture-keydown meldet, nach dem Sperren nicht mehr in PRIMARY', inP&&(await clipboard.selection.readText())==='', {inP});
    await clipboard.selection.clear(); }
  // Markieren und SOFORT per Klick sperren (Release-Audit v1.7 B-N2): mouseup meldet, derselbe Klick sperrt — die Frist muss schon vor der IPC-Antwort stehen
  { await unlock(); const V='sofort-'+process.pid; if((await cur()).t!=='password') await eye();
    await js(`(()=>{ const p=document.getElementById('cp1'); p.value=${JSON.stringify(V)}; p.scrollIntoView({block:'center'}); p.focus(); p.setSelectionRange(p.value.length,p.value.length); return true; })()`); await sleep(200);
    await clipboard.selection.writeText('vorher-sofort-'+process.pid);
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']}); await sleep(300);
    const inP=(await clipboard.selection.readText())===V;
    await realClick('button[data-action="lockNow"]'); await sleep(600);
    R('Markiert, dann sofort Klick auf „Jetzt sperren“: beim Sperren aus PRIMARY (nicht erst nach der Frist)', inP&&(await js(visible('screen-lock')))&&(await clipboard.selection.readText())==='', {inP,prim:(await clipboard.selection.readText()).length});
    await clipboard.selection.clear(); }
  // Lange Notiz über der alten Brücken-Grenze 20.000 (Release-Audit v1.7 B-M1): Markierung wird gemeldet und beim Sperren gelöscht, „Notiz kopieren“ geht über die Brücke
  { await unlock(); await click('button[data-action="newEntry"]'); await sleep(400);
    const L='lang-'+process.pid+'-'+'x'.repeat(60000);
    await js(`(()=>{ const n=document.getElementById('f-body'); n.value=${JSON.stringify(L)}; n.dispatchEvent(new Event('input',{bubbles:true})); n.focus(); n.setSelectionRange(0,0); return true; })()`); await sleep(200);
    await clipboard.selection.writeText('vorher-lang-'+process.pid);
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']}); win.webContents.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['control']}); await sleep(500);
    const inP=(await clipboard.selection.readText())===L;
    await clipboard.clear(); await js(`App.copyCurrent(); true`); await sleep(600);
    R('Lange Notiz (60.000 Zeichen): „Notiz kopieren“ über die Brücke (KDE-Hinweis, ganzer Text)', await clipboard.has(KDE_HINT)&&(await clipboard.readText())===L, {hint:await clipboard.has(KDE_HINT),len:(await clipboard.readText()).length});
    await js(`App.lockNow(); true`); await sleep(1000);
    R('Lange Notiz markiert (Strg+A): Wert war in PRIMARY und ist nach dem Sperren weg', inP&&(await clipboard.selection.readText())==='', {inP,prim:(await clipboard.selection.readText()).length});
    R('Lange Notiz: Kopie nach dem Sperren gelöscht', (await clipboard.readText())==='');   // leer, nicht nur „anders“ (Release-Audit v1.7 R2-N3)
    await clipboard.clear(); await clipboard.selection.clear(); }
  // Lange, MEHRZEILIGE Notiz mit Umlauten (Release-Audit v1.8 A-3): spiegelt Klipper sie unverändert in PRIMARY (Hash passt), und ist sie nach dem Sperren dort weg?
  // Geprüft wird auf die Marke, nicht auf Gleichheit — ein verändert gespiegelter Text bliebe sonst unbemerkt liegen
  { await unlock(); await click('button[data-action="newEntry"]'); await sleep(400);
    const MK='langmehr-'+process.pid, L=Array.from({length:1500},(_,i)=>MK+' Zeile '+i+' Grüße äöü ß — „x“').join('\n');
    await js(`(()=>{ const n=document.getElementById('f-body'); n.value=${JSON.stringify(L)}; n.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`); await sleep(300);
    await clipboard.clear(); await clipboard.selection.clear(); await js(`App.copyCurrent(); true`); await sleep(1200);
    const kop=await clipboard.readText(), gesp=await prim();
    R('Messung: lange mehrzeilige Kopie von Klipper in PRIMARY gespiegelt: '+(gesp===kop?'unverändert':(gesp.includes(MK)?'VERÄNDERT':'nein')), true, {kopLen:kop.length,primLen:gesp.length});
    await js(`App.lockNow(); true`); await until(visible('screen-lock'),5000); await sleep(1000);
    R('lange mehrzeilige Kopie: nach dem Sperren weder in CLIPBOARD noch in PRIMARY', kop.includes(MK)&&!(await clipboard.readText()).includes(MK)&&!(await prim()).includes(MK), {kop:kop.includes(MK),clip:(await clipboard.readText()).includes(MK),prim:(await prim()).includes(MK)});
    await clipboard.clear(); await clipboard.selection.clear(); }
  // Wie gemessen (R2-N2, 04.10.2026: 29 von 48 Klickpunkten): Feld mit alter interner Markierung, der eigentliche Wert per Strg+A markiert, dann echter Klick
  // LINKS neben das alte Feld — die leere Range zeigt auf dieses Feld, selText meldet dessen alten Wert; der Wert liegt weiter in PRIMARY und muss beim Sperren weg
  for(const [name,open,alt,ziel] of [['Editor: Titel alt, Notiztext markiert',`App.newEntry(); true`,'f-title','f-body'],['Einstellungen: aktuelle Passphrase alt, neue markiert',`App.tab('settings'); true`,'cp-cur','cp1']]){
    await unlock(); await js(open); await sleep(400); const V='ring-'+ziel+'-'+process.pid;
    await js(`(()=>{ const u=document.getElementById(${JSON.stringify(alt)}); u.value='ring-alt-'+${JSON.stringify(String(process.pid))}; u.scrollIntoView({block:'center'}); u.setSelectionRange(0,u.value.length);
      const z=document.getElementById(${JSON.stringify(ziel)}); z.value=${JSON.stringify(V)}; z.dispatchEvent(new Event('input',{bubbles:true})); z.focus(); return true; })()`); await sleep(200);
    await clipboard.selection.writeText('vorher-ring-'+process.pid);
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']}); win.webContents.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['control']}); await sleep(300);
    const inP=(await prim())===V;
    const r=await js(`(()=>{ const q=document.getElementById(${JSON.stringify(alt)}).getBoundingClientRect(); return {x:Math.round(q.left-6),y:Math.round(q.top+q.height/2)}; })()`);
    win.webContents.sendInputEvent({type:'mouseDown',x:r.x,y:r.y,button:'left',clickCount:1}); win.webContents.sendInputEvent({type:'mouseUp',x:r.x,y:r.y,button:'left',clickCount:1}); await sleep(400);
    const still=(await prim())===V;
    // Vorbedingung (Release-Audit v1.8 C-3): der Klick hat die falsche Meldung wirklich ausgelöst — leere Range zeigt auf das alte, markierte Feld
    const falsch=r.x>=0&&await js(`(()=>{ const g=getSelection(); if(!g||!g.rangeCount) return false; const q=g.getRangeAt(0); if(!q.collapsed) return false;
      const n=q.startContainer&&q.startContainer.childNodes?q.startContainer.childNodes[q.startOffset]:null; return !!n&&n.id===${JSON.stringify(alt)}&&n.selectionStart!==n.selectionEnd; })()`);
    await js(`App.lockNow(); true`); await until(visible('screen-lock'),5000); await sleep(600);
    R('Klick links neben ein Feld mit alter Markierung (R2-N2, '+name+'): Wert war in PRIMARY und ist nach dem Sperren weg', inP&&still&&falsch&&(await prim())==='', {inP,still,falsch,prim:(await prim()).length});
    await clipboard.clear(); await clipboard.selection.clear(); }
  // Entsperrt, Passphrase-Wechsel: neue Passphrase per Strg+A markiert, Fensterwechsel → Feld leer UND PRIMARY geräumt (Release-Audit v1.8 B-1 in der echten Hülle, R2-A5)
  { await unlock(); const V='einst-blur-'+process.pid;
    await js(`(()=>{ const p=document.getElementById('cp1'); p.value=${JSON.stringify(V)}; p.dispatchEvent(new Event('input',{bubbles:true})); p.scrollIntoView({block:'center'}); p.focus(); return true; })()`); await sleep(200);
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']}); win.webContents.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['control']}); await sleep(400);
    const inP=(await prim())===V;
    win.webContents.send('bg','blur'); await sleep(600);
    R('entsperrt, Strg+A in der neuen Passphrase, Fensterwechsel: Feld leer und PRIMARY geräumt (B-1)', inP&&(await js(`document.getElementById('cp1').value===''`))&&(await prim())==='', {inP,prim:(await prim()).length});
    await clipboard.selection.clear(); }
  // Sofort-Sperre als reines Hüllen-Ereignis 'verborgen' OHNE blur, markierter NOTIZTEXT (kein Gate-Feld): nur so trennt der Test R2-N1 (Sofort-Sperre schont nur
  // echte Kopien) von B-1/B-3 — beim echten Minimieren kommt auch blur, und das löscht ein Gate-Feld oder gesperrt ohnehin (Release-Audit v1.8 R2-A2)
  { await unlock(); await js(`App.setBgLock('0')`); await sleep(400); await click('button[data-action="newEntry"]'); await sleep(400); const V='sofort-notiz-'+process.pid;
    await js(`(()=>{ const n=document.getElementById('f-body'); n.value=${JSON.stringify(V)}; n.dispatchEvent(new Event('input',{bubbles:true})); n.focus(); return true; })()`); await sleep(200);
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']}); win.webContents.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['control']}); await sleep(400);
    const inP=(await prim())===V;
    win.webContents.send('bg',true); const locked=await until(visible('screen-lock'),5000); await sleep(600); const pr=await prim(); win.webContents.send('bg',false); await sleep(300);
    R('Sofort-Sperre (Hüllen-Ereignis ohne Fensterwechsel), markierter Notiztext: sofort aus PRIMARY (R2-N1 trennscharf)', inP&&locked&&pr==='', {inP,locked,prim:pr.length});
    await js(`App.setBgLock('1800')`).catch(()=>{}); await clipboard.selection.clear(); }
  // Sofort-Sperre (bgLock=0) beim Minimieren lässt nur eine echte Kopie bis zur Frist stehen, keine bloße Markierung (Release-Audit v1.7 R2-N1; Ende-zu-Ende —
  // trennscharf für R2-N1 ist die Prüfung davor, hier löschen auch blur/B-1/B-3 mit)
  { await unlock(); await js(`App.setBgLock('0')`); await sleep(400); const V='sofortsperre-'+process.pid; await prepTab(V);
    await clipboard.selection.writeText('vorher-sofortsperre-'+process.pid);
    press('Tab'); await sleep(500);
    const inP=(await clipboard.selection.readText())===V;
    win.minimize(); const locked=await until(visible('screen-lock'),5000); await sleep(400); const primMin=await prim(); const fo=await restoreFocused(); await sleep(400);
    R('Sofort-Sperre beim Minimieren: per Tab markierte Passphrase sofort aus PRIMARY (noch minimiert geprüft)', inP&&locked&&primMin==='', {inP,locked,prim:primMin.length,fo});
    await clipboard.selection.clear();
    // Gegenprobe: eine echte Kopie bleibt bei der Sofort-Sperre bis zur Frist stehen (UI-INVARIANTEN „Sofort-Sperre lässt Kopiertes stehen“)
    await unlock(); await click('button[data-action="newEntry"]'); await sleep(400);
    const K='kopie-bleibt-'+process.pid; await js(`(()=>{ const n=document.getElementById('f-body'); n.value=${JSON.stringify(K)}; n.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`); await sleep(200);
    await clipboard.clear(); await js(`App.copyCurrent(); true`); await sleep(500);
    const kop=(await clipboard.readText())===K;
    win.minimize(); const l2=await until(visible('screen-lock'),5000); await sleep(400); const cMin=await clipboard.readText(); const fo2=await restoreFocused(); await sleep(400);
    R('Sofort-Sperre: echte Kopie bleibt bis zur Frist stehen (Gegenprobe, noch minimiert geprüft)', kop&&l2&&cMin===K, {kop,l2,len:cMin.length,fo2});
    await unlock(); await js(`AlienDesktop.clip.clear(); App.setBgLock('1800')`); await sleep(400); await clipboard.clear(); await clipboard.selection.clear(); }
  await unlock();
  await js(`document.getElementById('cp1').value=''; App.tab('list')`).catch(()=>{}); await sleep(300);
}
// Beenden (Querfund Tresor v3.7 M-1 + Pass R2-1): before-quit läuft über die Kette und löscht die eigene Kopie auch aus PRIMARY (Klipper-Spiegelung).
// Variante 'quit': die Kopie ist beim Beenden noch UNTERWEGS (clipboard.write hängt 1 s) — v1.7 beendete dann sofort ohne Löschen (Hash noch frei);
// zweimal app.quit (Pass A-3). Variante 'quithang': zwei Schreibvorgänge hängen für immer VOR dem Löschen — Beenden spätestens nach ~2 s direkt (Pass R2-3).
// Variante 'quitslow' (Pass N-4): das PRIMARY-Lesen beim Beenden braucht 2,3 s — das Kettenglied läuft in seine Frist, der direkte Durchgang
// muss die Hashes des laufenden Glieds mitnehmen und löschen
async function quitSlow(){
  R('Beenden: Sperrbildschirm', await until(visible('screen-lock'),15000));
  const M='an-harness-'+process.pid+'-quitslow';
  await js(`AlienDesktop.clip.write({text:${JSON.stringify(M)}})`); await sleep(300); await clipboard.selection.writeText(M);
  const sr=clipboard.selection.readText; let einmal=true;
  clipboard.selection.readText=function(...a){ if(einmal){ einmal=false; return new Promise(r=>setTimeout(()=>r(sr.apply(clipboard.selection,a)),2300)); } return sr.apply(this,a); };
  const t0=Date.now();
  app.on('will-quit',ev=>{ ev.preventDefault(); const ms=Date.now()-t0; (async()=>{ const c=await clipboard.readText(), p=await sr.call(clipboard.selection);
    R('Beenden mit langsamem PRIMARY-Lesen: direkter Durchgang löscht auch die Hashes des laufenden Glieds', !einmal&&ms>=1900&&c!==M&&p==='', {ms,clip:c===M,prim:p.length,langsam:!einmal});
    try{ await clipboard.clear(); }catch(_){} R('Schritt vollständig',true); app.exit(0); })(); });
  app.quit();
}
// Variante 'quitreject' (Release-Audit Notes v1.8 A-1): das Glied läuft rechtzeitig durch, aber das PRIMARY-Lesen lehnt einmal ab — die Kopie steht
// (Klipper-Spiegel) noch in PRIMARY; vorher galt das als erledigt, es gab keinen direkten Durchgang, und die Kopie überlebte das Beenden
async function quitReject(){
  R('Beenden: Sperrbildschirm', await until(visible('screen-lock'),15000));
  const M='an-harness-'+process.pid+'-quitreject';
  await js(`AlienDesktop.clip.write({text:${JSON.stringify(M)}})`); await sleep(300); await clipboard.selection.writeText(M);
  const vor=(await prim())===M;
  const sr=clipboard.selection.readText; let einmal=true;
  clipboard.selection.readText=function(...a){ if(einmal){ einmal=false; return Promise.reject(new Error('X11')); } return sr.apply(this,a); };
  const t0=Date.now();
  app.on('will-quit',ev=>{ ev.preventDefault(); const ms=Date.now()-t0; (async()=>{ const c=await clipboard.readText(), p=await sr.call(clipboard.selection);
    R('Beenden mit einmal abgelehntem PRIMARY-Lesen: Kopie trotzdem aus CLIPBOARD und PRIMARY gelöscht', vor&&!einmal&&c!==M&&p==='', {vor,abgelehnt:!einmal,ms,clip:c===M,prim:p.length});
    R('Beenden bleibt unter ~5 s', ms<5500, ms);
    try{ await clipboard.clear(); }catch(_){} R('Schritt vollständig',true); app.exit(0); })(); });
  app.quit();
}
// Variante 'quitlate' (Release-Audit v1.8 R2-H2): clip:write hängt 2,5 s — die App bekommt nach 2 s die Ablehnung, gleich danach wird beendet; die Kopie landet
// erst WÄHREND des Beendens (Klipper spiegelt 300 ms danach). Vorher stand sie noch nicht in `pending`, das Beenden war nach 1 ms fertig, der Spiegel blieb
async function quitLate(){
  R('Beenden: Sperrbildschirm', await until(visible('screen-lock'),15000));
  const M='an-harness-'+process.pid+'-quitlate', ow=clipboard.write; let gelandet=0;
  clipboard.write=async function(...a){ await sleep(2500); const r=await ow.apply(this,a); gelandet=Date.now(); setTimeout(()=>{ clipboard.selection.writeText(M); },300); return r; };
  const r=await js(`AlienDesktop.clip.write({text:${JSON.stringify(M)}}).then(()=>'ok',()=>'abgelehnt')`);
  const t0=Date.now();
  // Sofort bei will-quit prüfen, ohne zu warten: in echt endet der Prozess hier — eine Wartezeit im Test ließe die normalen Nachfass-Zeitgeber aufräumen
  // und machte den Test gegen die Hülle ohne R2-H2-Fix grün. Vorbedingung: die Kopie ist bis zum Ende des Beendens gelandet (das Beenden hat auf sie gewartet)
  // Vorbedingung auch: will-quit erst NACH dem nachgestellten Spiegel (Landung + 300 ms) — sonst wäre PRIMARY nur „noch leer“ (Nachprüfung N-1)
  app.on('will-quit',ev=>{ ev.preventDefault(); const ms=Date.now()-t0, gel=gelandet>0&&Date.now()-gelandet>=400; (async()=>{ const c=await clipboard.readText(), p=await prim();
    R('Beenden während ein spätes Schreiben noch unterwegs ist: auf die Kopie und ihren Spiegel gewartet, beide beim Prozessende aus CLIPBOARD und PRIMARY weg', r==='abgelehnt'&&gel&&c!==M&&p==='', {r,gel,nachLandung:gelandet?Date.now()-gelandet:0,ms,clip:c===M,prim:p.length});
    R('Beenden bleibt unter ~5 s', ms<5500, ms);
    clipboard.write=ow; try{ await clipboard.clear(); await clipboard.selection.clear(); }catch(_){} R('Schritt vollständig',true); app.exit(0); })(); });
  app.quit();
}
async function quitStep(hang){
  R('Beenden: Sperrbildschirm', await until(visible('screen-lock'),15000));
  const M='an-harness-'+process.pid+'-quit';
  let drin=false, t0=0;
  if(hang){ await js(`AlienDesktop.clip.write({text:${JSON.stringify(M)}})`); await sleep(300); await clipboard.selection.writeText(M);
    clipboard.write=()=>new Promise(()=>{});
    js(`AlienDesktop.clip.write({text:'haengt-1'}).catch(()=>{}); AlienDesktop.clip.write({text:'haengt-2'}).catch(()=>{}); true`).catch(()=>{}); await sleep(200); }
  else { const ow=clipboard.write; clipboard.write=async function(...a){ drin=true; await sleep(1000); return ow.apply(this,a); };
    js(`AlienDesktop.clip.write({text:${JSON.stringify(M)}})`).catch(()=>{});
    for(let i=0;i<50&&!drin;i++) await sleep(20);
    await clipboard.selection.writeText(M); }   // Klipper-Spiegelung nachstellen
  // quithang: während des Beendens abtasten — der direkte Durchgang an der stehenden Kette vorbei muss nach ~2 s löschen, nicht erst das Kettenglied
  // bei ~3,8 s (seit R2-H2 hält `lateN` das Beenden ohnehin bis zum Deckel offen, die Endprüfung allein trennt den Durchgang nicht mehr — Nachprüfung N-2)
  let leerAb=0; const tast=hang?setInterval(async()=>{ if(leerAb||!t0) return; try{ if((await clipboard.readText())!==M&&(await prim())==='') leerAb=Date.now()-t0; }catch(_){} },50):null;
  app.on('will-quit',ev=>{ ev.preventDefault(); const ms=Date.now()-t0; if(tast) clearInterval(tast); (async()=>{
    if(hang){ const c=await clipboard.readText(), s=await prim();
      R('Beenden hinter einer stehenden Kette: direkter Durchgang löscht nach ~2 s (≤ 2,7 s), nicht erst das Kettenglied', leerAb>0&&leerAb<=2700, {leerAb});
      // ≤ ~5 s statt ~2 s: die beiden nie landenden Schreibvorgänge zählen seit R2-H2 als „spät, noch nicht gelandet“, das Beenden wartet bis zum Deckel `end`
      R('Beenden hinter einer stehenden Kette: direkt gelöscht (CLIPBOARD + PRIMARY), unter dem Deckel ~5 s', ms<5500&&c!==M&&s==='', {ms,clip:c===M,prim:s.length}); }
    else { const c=await clipboard.readText(), s=await prim();
      R('Beenden während die Kopie noch geschrieben wird (zweimal quit): Kopie aus CLIPBOARD und PRIMARY gelöscht, auf das Schreiben gewartet (≥ 0,9 s)', drin&&ms>=900&&c!==M&&s==='', {drin,clip:c===M,prim:s.length,ms}); }
    try{ await clipboard.clear(); }catch(_){} R('Schritt vollständig',true); app.exit(0); })(); });
  t0=Date.now(); app.quit(); if(!hang){ await sleep(50); app.quit(); }
}
async function background(){
  R('Hintergrund: Sperrbildschirm', await until(visible('screen-lock'),15000));
  await fill('lock-pass',PP); await click('#unlock-btn'); R('Hintergrund: entsperrt', await until(visible('screen-app')));
  await js(`App.setAutolock('0')`); await js(`App.setBgLock('0')`); await sleep(600);
  win.minimize(); const locked=await until(visible('screen-lock'),5000);
  R('Minimieren sperrt bei „sofort“ (Inaktivität aus)', locked);
  await restoreFocused(); await sleep(400);
  await fill('lock-pass',PP); await click('#unlock-btn'); await until(visible('screen-app'));
  await js(`App.setBgLock('60')`); await sleep(600);
  win.minimize(); await sleep(1200); await restoreFocused(); await sleep(600);
  R('kurz minimiert bei 1 min: bleibt entsperrt', await js(visible('screen-app')));
  await fill('lock-pass','x'); win.hide(); await sleep(600); win.show(); await sleep(400);
  R('Verstecken leert getippte Eingaben', await js(`document.getElementById('lock-pass').value===''`));
  R('Hülle verdrahtet blur', fs.readFileSync(path.join(__dirname,'main.js'),'utf8').includes("win.on('blur',bg('blur'))"));
  await js(`App.tab('settings')`); await fill('cp-cur','halb-getippt'); win.webContents.send('bg','blur'); await sleep(400);
  R('Fensterwechsel leert getippte Passphrase, sperrt nicht', await js(`document.getElementById('cp-cur').value===''`)&&await js(visible('screen-app')));
  await js(`App.tab('list')`);
  await fill('lock-pass',PP); await click('#unlock-btn'); await until(visible('screen-app'));
  await js(`App.setBgLock('0')`); await sleep(600); await js(`App.lockNow()`); await until(visible('screen-lock'),5000);
  await fill('lock-pass',PP); await click('#unlock-btn'); win.minimize(); await sleep(4000); await restoreFocused(); await sleep(600);
  R('während des Entsperrens minimiert: bleibt gesperrt', await js(visible('screen-lock'))&&!(await js(visible('screen-app'))));
  await fill('lock-pass',PP); await click('#unlock-btn'); await until(visible('screen-app'));
  // Editor-Stand wird vor der Hintergrund-Sperre gesichert (Autosave, Alien Notes)
  await js(`App.setBgLock('60')`); await sleep(400);
  await click('button[data-action="newEntry"]'); await sleep(300); await fill('f-body','hintergrund-gesichert-'+process.pid);
  win.minimize(); await sleep(800); await restoreFocused(); await sleep(800);
  R('Editor-Stand vor dem Minimieren gespeichert', await until(`(()=>{ try{ return true; }catch(_){ return false; } })()`)&&fs.readFileSync(VAULT,'utf8').length>0);
  await js(`App.doneEditor()`); await sleep(600);
  R('Notiz aus dem Hintergrund-Autosave in der Liste', await js(`[...document.querySelectorAll('#entry-list .entry .t')].some(n=>n.textContent.startsWith('hintergrund-gesichert'))`));
  await js(`App.setBgLock('1800')`); await js(`App.setAutolock('0')`); await sleep(600);
}
async function unreadable(){
  R('Lesefehler: keine Einrichtung', await until(visible('screen-lock'),15000)&&!(await js(visible('screen-setup'))));
  R('Lesefehler: Meldung', /nicht lesbar|not readable/.test(await js(`document.getElementById('lock-err').textContent`)));
  await fill('lock-pass',PP); await click('#unlock-btn'); await sleep(800);
  R('Lesefehler: Entsperren bleibt gesperrt', await js(visible('screen-lock'))&&!(await js(visible('screen-app'))));
}

app.on('browser-window-created',(_e,w)=>{ if(win) return; win=w;
  w.webContents.once('did-finish-load',async()=>{
    try{
      await until(`document.readyState==='complete'&&typeof App!=='undefined'`,15000); await js('void (window.confirm=()=>true)');
      if(STEP==='fresh') await fresh(); else if(STEP==='restart') await restart(); else if(STEP==='unreadable') await unreadable();
      else if(STEP==='background') await background();
      else if(STEP==='quit'||STEP==='quithang'){ await quitStep(STEP==='quithang'); return; }   // endet in will-quit (eigene Endmarke)
      else if(STEP==='quitslow'){ await quitSlow(); return; }
      else if(STEP==='quitreject'){ await quitReject(); return; }
      else if(STEP==='quitlate'){ await quitLate(); return; }
      else if(STEP==='hold'){ R('läuft',true); await sleep(Number(process.env.AP_HOLD||8000)); }
      else R('unbekannter Schritt '+STEP,false);   // vertippter Schrittname wäre sonst mit der Endmarke grün (Pass C-9)
      if(STEP!=='hold') R('Schritt vollständig',true);   // verify-desktop verlangt die Endmarke (Release-Audit v1.7 A-4)
    }catch(e){ R('Ausnahme im Prüfprogramm',false,String(e&&e.stack||e)); }
    app.exit(0);
  });
});
