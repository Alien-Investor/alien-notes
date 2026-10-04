'use strict';
// Alien Notes Desktop — Hauptprozess.
// Lädt ausschließlich die gebündelte App über app://aliennotes/ — kein Netz, keine Navigation, keine fremden Fenster; nur die Links in LINKS gehen an den System-Browser.
// Im Flatpak nimmt zusätzlich das System das Netz weg (keine --share=network); diese Datei ist die zweite Schicht.
const {app,BrowserWindow,protocol,session,ipcMain,clipboard,ClipboardItem,Menu,powerMonitor,dialog,shell}=require('electron');
const path=require('path'); const fs=require('fs'); const crypto=require('crypto');
const {writeFull,writeAtomic}=require('./atomic.js');

const ORIGIN='app://aliennotes';
const ENTRY=ORIGIN+'/index.html';
const WWW=path.join(__dirname,'www');
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'};
const KDE_HINT='electron application/osclipboard;format="x-kde-passwordManagerHint"';   // Klipper übernimmt so markierte Einträge nicht
// Kopieren: ganze Notiz (CAPS.body 100.000 + Titel) bzw. Checkliste (200 × 500) muss passen — mit 20.000 scheiterte „Notiz kopieren“ bei langen Notizen (Release-Audit v1.7 B-M1)
const CLIP_MAX=128*1024;
// Markierung wird nur gehasht: eigene, großzügige Grenze — eine abgewiesene Meldung ließ die markierte Notiz nach dem Sperren in PRIMARY liegen (B-M1)
const SEL_MAX=16*1024*1024;
const FILE_MAX=20*1024*1024;   // wie MAX_FILE_BYTES in app.js
// Notizen als eigene Datei statt im Browser-Speicher. Im Flatpak liegt XDG_DATA_HOME unter ~/.var/app/<id>/data.
const DATA_DIR=path.join(process.env.XDG_DATA_HOME||path.join(app.getPath('home'),'.local','share'),'alien-notes');
const VAULT_FILE=path.join(DATA_DIR,'notes.ainv');
// Links der Oberfläche, die im System-Browser aufgehen dürfen (OpenURI-Portal, kein Flatpak-Recht nötig). Exakter Vergleich, keine Präfixe.
const LINKS=new Set(['https://alien-investor.org/spenden.html','https://alien-investor.org/en/spenden.html']);
function linkOk(u){
  if(typeof u!=='string') return false;
  try{ return LINKS.has(new URL(u).href); }catch(_){ return false; }
}
// Weiter geht der geprüfte href (nicht der Rohstring) und höchstens ein Link je Sekunde — sonst könnte eine Schleife im Renderer Hunderte Browser-Tabs öffnen (Release-Audit v1.6 A-B1/B2)
// Monotone Uhr: mit Date.now() bliebe der Knopf nach einem Zurückstellen der Systemuhr bis zum alten Stand tot (Alien Pass Release-Audit v1.18 A-2)
let lastOut=-Infinity;
function openOutside(u){ const t=performance.now(); if(!linkOk(u)||t-lastOut<1000) return; lastOut=t; shell.openExternal(new URL(u).href).catch(()=>{}); }

// Fernsteuerung verweigern: die Fuses sperren nur --inspect (Node), nicht Chromiums DevTools-Protokoll
for(const s of ['remote-debugging-port','remote-debugging-pipe','remote-debugging-address','remote-allow-origins'])
  if(app.commandLine.hasSwitch(s)){ console.error('Alien Notes: --'+s+' wird nicht unterstützt.'); app.exit(1); process.exit(1); }

// Vor app.ready: Schema anmelden, Hintergrund-Netzdienste von Chromium aus, Namensauflösung ins Leere
protocol.registerSchemesAsPrivileged([{scheme:'app',privileges:{standard:true,secure:true}}]);
for(const s of ['disable-background-networking','disable-component-update','disable-domain-reliability','no-pings','disable-breakpad'])
  app.commandLine.appendSwitch(s);
app.commandLine.appendSwitch('host-resolver-rules','MAP * ~NOTFOUND');
// WebRTC geht an webRequest, Namensauflösung und CSP vorbei (Audit run-6 #7): kein UDP ohne Proxy, und der Proxy ist tot (s.u.)
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy','disable_non_proxied_udp');
app.enableSandbox();

// Nur eine Instanz: zwei Fenster auf demselben Tresor hießen verlorene Änderungen
if(!app.requestSingleInstanceLock()){ app.quit(); }
else {
  let win=null;
  app.on('second-instance',()=>{ if(win){ if(win.isMinimized()) win.restore(); win.focus(); } });

  // Nur Dateien aus www/, nur bekannte Typen, kein Weg nach außen
  function serve(req){
    let p; try{ const u=new URL(req.url); if(u.host!=='aliennotes') return new Response(null,{status:404}); p=decodeURIComponent(u.pathname); }
    catch(_){ return new Response(null,{status:400}); }
    if(p==='/') p='/index.html';
    const file=path.normalize(path.join(WWW,p));
    const type=TYPES[path.extname(file).toLowerCase()];
    if(!file.startsWith(WWW+path.sep)||!type) return new Response(null,{status:404});
    try{ return new Response(fs.readFileSync(file),{headers:{'content-type':type,'x-content-type-options':'nosniff'}}); }
    catch(_){ return new Response(null,{status:404}); }
  }

  // IPC nur vom obersten Frame der eigenen Seite. Nicht über u.origin prüfen: für eigene Schemata liefert URL dort immer "null".
  function fromApp(e){
    try{ const f=e.senderFrame; if(!f||f.parent) return false; const u=new URL(f.url);
      return u.protocol==='app:'&&u.host==='aliennotes'&&u.pathname==='/index.html'; }
    catch(_){ return false; }
  }
  // Besitz-Hashes mit prozess-zufälligem Salz: der Hash darf nie ein Klartext-Orakel für kurze Texte (PIN) sein (Audit run-8 #3)
  const SALT=crypto.randomBytes(16);
  const sha=t=>crypto.createHash('sha256').update(SALT).update(String(t)).digest('hex');
  let owned=null;      // Hash des zuletzt von uns kopierten Texts — nie der Text selbst
  // Hashes der zuletzt in der App markierten Texte (X11-Auswahl, Mittelklick) — jedes Programm liest sie.
  // Ein RING statt eines einzelnen Hashes (R2-N2, gemessen 04.10.2026 in Notes mit einem Messprogramm im Audit-Ordner run-6: 29 von 48 Klickpunkten): ein Klick links neben/knapp über ein Feld mit
  // alter interner Markierung (Titel, Kategorie, Passphrase-/PIN-Felder) lässt die leere Range auf DIESES Feld zeigen, selText meldet dessen Wert — mit nur
  // einem Hash verdrängte das den des markierten Notiztexts, der noch in PRIMARY lag, und Sperren/Frist ließen ihn liegen. Grenze: 8 Meldungen.
  const SEL_RING=8;
  let ownedSel=[];
  // Jeder einzelne Zugriff auf die Zwischenablage hat eine eigene Frist (Alien Pass Release-Audit v1.19 A-1/R2-1): ein hängender X11-Besitzer (eingefrorenes
  // fremdes Programm) blockiert sonst die Kette — und eine Frist für das ganze Glied verwarf die schon übernommenen Hashes, PRIMARY blieb ungeprüft.
  const LINK_MS=2000, LATE=Symbol('spät');
  // Ablehnung zählt wie Hängen (Pass N-5): sonst galt ein abgelehntes readText als „kein Text“, ein abgelehntes clear als Erfolg — Hashes weg.
  const within=(f,ms)=>Promise.race([Promise.resolve().then(f).catch(()=>LATE),new Promise(r=>setTimeout(()=>r(LATE),ms))]);
  // Alle Hashes, deren Löschen noch nicht BESTÄTIGT ist — liegengeblieben oder gerade in Arbeit. Einfüge-Reihenfolge = Alter: die Kappung wirft die
  // ältesten (Pass N-1), und der direkte Durchgang beim Beenden sieht auch die Hashes eines laufenden Glieds (Pass N-4).
  const pending=new Set(); let retryTimer=null, retryN=0;
  const keep=h=>{ pending.delete(h); pending.add(h); while(pending.size>32) pending.delete(pending.values().next().value); };
  async function clearOwned(mode){
    // mode 'retry' (Nachfassen): nur die liegengebliebenen Hashes — sonst löschte das Nachfassen eine frische Kopie sofort mit (Pass Runde 2, gemessen).
    // Eindeutiger Wert, weil run() das Ergebnis des vorigen Glieds als Argument durchreicht — darum immer run(()=>clearOwned()), nie run(clearOwned).
    // Sonst: Hashes ZUERST übernehmen und freigeben — readText() ist in Electron 44 asynchron; eine Meldung/Kopie, die während der awaits ankommt,
    // gehört zum nächsten Löschen (Querfund Sachwert-Tresor v3.7 A-1).
    if(mode!=='retry'){ for(const h of [owned,...ownedSel]) if(h) keep(h); owned=null; ownedSel=[]; }
    const mine=[...pending]; if(!mine.length) return;
    // CLIPBOARD und PRIMARY unabhängig voneinander, jeder Zugriff mit eigener Frist: ein hängender X11-Besitzer der einen blockiert die andere nicht.
    // PRIMARY gegen Markierungen UND die eigene Kopie: Klipper spiegelt Kopien (Einstellung „Auswahl und Zwischenablage synchronisieren“) auch mit
    // KDE-Hinweis in PRIMARY (Querfund Sachwert-Tresor v3.7 M-1) — sonst bliebe eine kopierte Notiz per Mittelklick abrufbar. CLIPBOARD gegen Kopie UND
    // Markierungen: Abwehr (Pass A-4) — die Spiegelung Markierung → CLIPBOARD trat am 04.10.2026 einmal auf (CLIPBOARD unmittelbar vorher geleert),
    // in den Wiederholungen und in Pass nicht. Gelöscht wird nur, was noch von uns stammt; fremde Kopien bleiben.
    const one=async(buf)=>{ const cur=await within(()=>buf.readText(),LINK_MS); if(cur===LATE) return false;
      if(cur&&mine.includes(sha(cur))) return (await within(()=>buf.clear(),LINK_MS))!==LATE;
      return true; };
    const [okC,okP]=await Promise.all([one(clipboard),one(clipboard.selection)]);
    // Alles bestätigt: einen geplanten Nachfass-Zeitgeber IMMER stoppen — sonst bekäme ein späterer Fehler nach einer langen Hängephase (Nachfassen schon
    // im 30-s-Takt) erst nach bis zu 30 s das nächste Nachfassen statt nach 1 s (Release-Audit Notes v1.8, Runde 1 Nachlauf + R2-H1). Ein Hash, der danach
    // noch in `pending` steht, kam aus einem späten Schreiben und hängt sein eigenes Glied in die Kette, das bei Misserfolg selbst im 1-s-Takt neu plant.
    if(okC&&okP){ for(const h of mine) pending.delete(h); retryN=0; if(retryTimer){ clearTimeout(retryTimer); retryTimer=null; } return; }
    // Nicht fertig: die Hülle fasst selbst nach — erst je 1 s, nach 30 Versuchen alle 30 s weiter, solange etwas offen ist (Pass N-3)
    if(!retryTimer) retryTimer=setTimeout(()=>{ retryTimer=null; run(()=>clearOwned('retry')).catch(()=>{}); },retryN++<30?1000:30000);
  }
  // Alle Zwischenablage-Schritte in EINER Kette, in IPC-Reihenfolge: ein write/selected kann sich nicht mehr in ein laufendes Löschen schieben,
  // und das Beenden wartet das letzte Löschen ab (Querfund Sachwert-Tresor v3.7 R2-1 — clipboard.* ist in Electron 44 asynchron)
  let clipQ=Promise.resolve();
  const run=f=>(clipQ=clipQ.then(f,f));
  let quitting=false, quitDone=false;
  // späte Schreibvorgänge, die noch nicht gelandet sind / bis wann Klippers Spiegel einer gelandeten noch kommen kann (R2-H2; Landung + 3,2 s wie das
  // Nachfassen bei 0/1/3 s, Nachprüfung N-3). Monotone Uhr wie openOutside (v1.7): ein Zurückstellen der Systemuhr verlängert das Beenden nicht (N-5)
  let lateN=0, lateUntil=-Infinity;
  ipcMain.handle('clip:write',async(e,text)=>{
    if(!fromApp(e)) throw new Error('denied');
    if(typeof text!=='string'||!text||text.length>CLIP_MAX) throw new Error('bad');
    if(quitting) throw new Error('quitting');   // landete sonst nach dem letzten Löschen (Pass R2-3)
    return run(async()=>{
      const w=clipboard.write([new ClipboardItem({'text/plain':new Blob([text],{type:'text/plain'}),[KDE_HINT]:new Blob(['secret'])})]);
      const r=await Promise.race([Promise.resolve(w).then(()=>true),new Promise(r=>setTimeout(()=>r(LATE),LINK_MS))]);
      if(r!==LATE){ owned=sha(text); return true; }
      // Zu spät: die App meldet „Manuell kopieren“ und setzt keine Frist — landet die Kopie doch noch, sofort wieder löschen (Pass R2-2).
      // Mehrfach nachfassen (sofort, nach 1 s, nach 3 s): Klipper spiegelt erst NACH dem Landen in PRIMARY (Pass N-2)
      lateN++;
      Promise.resolve(w).then(()=>{ lateN--; lateUntil=performance.now()+3200; const h=sha(text); for(const d of [0,1000,3000]) setTimeout(()=>{ keep(h); run(()=>clearOwned('retry')).catch(()=>{}); },d); },()=>{ lateN--; });
      throw new Error('timeout');
    });
  });
  ipcMain.handle('clip:selected',async(e,text)=>{   // App meldet markierten Text; gemerkt wird nur der Hash
    if(!fromApp(e)) throw new Error('denied');
    if(typeof text!=='string'||text.length>SEL_MAX) throw new Error('bad');
    if(!text) return true;   // leere Meldung verdrängt nichts
    const h=sha(text); return run(()=>{ ownedSel=ownedSel.filter(x=>x!==h); ownedSel.push(h); if(ownedSel.length>SEL_RING) ownedSel.shift(); return true; });
  });
  ipcMain.handle('clip:clear',async e=>{ if(!fromApp(e)) throw new Error('denied'); await run(()=>clearOwned()); return true; });

  // Vollständig + atomar schreiben: desktop/atomic.js (eigenes Modul, damit es einzeln unter ulimit geprüft werden kann)
  // Temp-Reste nach einem Absturz entfernen — sie können nach einem Passphrase-Wechsel einen Alt-Stand halten
  function dropTmp(){ try{ for(const n of fs.readdirSync(DATA_DIR)) if(n.startsWith('.notes.ainv.tmp-')) fs.unlinkSync(path.join(DATA_DIR,n)); }catch(_){} }
  // Synchron (sendSync), damit persist() in app.js keinen zusätzlichen await bekommt — die Persist-Invarianten bleiben gültig.
  // Lesefehler ≠ „keine Notizen“: sonst böte die App „Tresor anlegen“ an und überschriebe den echten.
  ipcMain.on('store:read',e=>{
    if(!fromApp(e)){ e.returnValue={ok:false}; return; }
    // leere Datei ist kaputt, nicht „kein Tresor“
    try{ const sz=fs.statSync(VAULT_FILE).size; if(sz===0||sz>FILE_MAX){ e.returnValue={ok:false}; return; } e.returnValue={ok:true,data:fs.readFileSync(VAULT_FILE,'utf8')}; }
    catch(err){ e.returnValue=err&&err.code==='ENOENT'?{ok:true,data:null}:{ok:false}; }
  });
  ipcMain.on('store:write',(e,s)=>{
    if(!fromApp(e)||typeof s!=='string'||!s||s.length>FILE_MAX){ e.returnValue={ok:false}; return; }
    try{ fs.mkdirSync(DATA_DIR,{recursive:true,mode:0o700}); try{ fs.chmodSync(DATA_DIR,0o700); }catch(_){} writeAtomic(VAULT_FILE,s); e.returnValue={ok:true}; }catch(_){ e.returnValue={ok:false}; }
  });
  ipcMain.on('store:del',e=>{
    if(!fromApp(e)){ e.returnValue={ok:false}; return; }
    dropTmp();
    try{ fs.unlinkSync(VAULT_FILE); e.returnValue={ok:true}; }catch(err){ e.returnValue={ok:!!(err&&err.code==='ENOENT')}; }
  });

  // Backup: Speichern-Dialog (im Flatpak über das Portal). null = abgebrochen → app.js setzt dann keinen Backup-Stempel.
  ipcMain.handle('backup:save',async(e,name,content)=>{
    if(!fromApp(e)) throw new Error('denied');
    if(typeof name!=='string'||!/^[\w.-]{1,80}\.notes$/.test(name)||typeof content!=='string'||!content||content.length>FILE_MAX) throw new Error('bad');
    const r=await dialog.showSaveDialog(win,{defaultPath:name,filters:[{name:'Alien Notes Backup',extensions:['notes']}]});
    if(r.canceled||!r.filePath) return null;
    // Rückfall nur für ein NEUES Ziel (Portal ohne Temp-Datei daneben): ein bestehendes Backup nie direkt überschreiben (Audit run-6 #3)
    try{ writeAtomic(r.filePath,content); }
    catch(err){
      if(fs.existsSync(r.filePath)) throw err;
      const fd=fs.openSync(r.filePath,'wx',0o600);
      try{ writeFull(fd,content); }catch(e2){ fs.closeSync(fd); try{ fs.unlinkSync(r.filePath); }catch(_){} throw e2; }
      fs.closeSync(fd);
    }
    return path.basename(r.filePath);
  });

  // Jede Webansicht: keine Navigation, keine neuen Fenster, keine <webview>. Bekannte Links gehen an den System-Browser.
  app.on('web-contents-created',(_e,wc)=>{
    wc.on('will-navigate',(ev,url)=>{ ev.preventDefault(); openOutside(url); });
    wc.on('will-redirect',ev=>ev.preventDefault());
    wc.on('will-attach-webview',ev=>ev.preventDefault());
    wc.setWindowOpenHandler(({url})=>{ openOutside(url); return {action:'deny'}; });
    wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  });

  app.whenReady().then(async()=>{
    const ses=session.defaultSession;
    dropTmp();
    // Toter Proxy: die App braucht kein Netz (app:// läuft nicht über Proxys). Damit läuft auch WebRTC über TCP/TURN ins Leere.
    await ses.setProxy({proxyRules:'http://127.0.0.1:9'});
    protocol.handle('app',serve);
    ses.setPermissionRequestHandler((_wc,_perm,cb)=>cb(false));
    ses.setPermissionCheckHandler(()=>false);
    ses.setSpellCheckerEnabled(false);   // lädt sonst Wörterbücher aus dem Netz
    ses.on('will-download',ev=>ev.preventDefault());   // Dateien entstehen nur über backup:save, nie über Browser-Downloads
    ses.webRequest.onBeforeRequest((d,cb)=>{
      const u=d.url; cb({cancel:!(u.startsWith(ORIGIN+'/')||u.startsWith('blob:app://aliennotes/')||u.startsWith('data:'))});
    });
    Menu.setApplicationMenu(null);

    // Fenster-Icon setzen: ohne _NET_WM_ICON zeigt die Taskleiste ein Standard-Icon, sobald die Zuordnung zur .desktop-Datei fehlt
    // (die läuft über WM_CLASS = package.json "name", darum StartupWMClass=alien-notes in der .desktop-Datei — Nutzerfund 23.09.2026)
    const ICON=path.join(__dirname,'icon.png');
    win=new BrowserWindow({width:1100,height:800,minWidth:360,minHeight:520,backgroundColor:'#000000',title:'Alien Notes',show:false,
      ...(fs.existsSync(ICON)?{icon:ICON}:{}),
      webPreferences:{preload:path.join(__dirname,'preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,
        devTools:false,spellcheck:false,webviewTag:false,navigateOnDragDrop:false,safeDialogs:true,
        backgroundThrottling:false}});   // Sperr- und Lösch-Timer müssen auch minimiert feuern
    win.once('ready-to-show',()=>win.show());
    // backgroundThrottling:false schaltet die Page Visibility API ab → Fensterzustand selbst melden (Audit run-6 #1)
    const bg=h=>()=>{ if(win) win.webContents.send('bg',h); };
    win.on('minimize',bg(true)); win.on('hide',bg(true)); win.on('restore',bg(false)); win.on('show',bg(false));
    win.on('blur',bg('blur'));   // Fensterwechsel: keine Sperre (feuert auch bei Systemdialogen), die App leert nur getippte Gate-Eingaben (Audit run-8 #9)
    win.on('closed',()=>{ win=null; });
    win.loadURL(ENTRY);

    // Im Flatpak wirkungslos: 'lock-screen' gibt es unter Linux nicht, 'suspend' braucht logind am System-Bus (fehlt im Käfig).
    // Bleibt für den Fall außerhalb des Käfigs. Ein Portal-Weg (Inhibit.CreateMonitor) wurde bewusst verworfen (eigener D-Bus-Client nötig);
    // das Handbuch sagt ehrlich: bei Bildschirmsperre/Ruhezustand sperrt die App nicht, Systemsperre + kurze Inaktivitäts-Sperre nutzen.
    const lockApp=()=>{ if(win) win.webContents.send('lock'); };
    powerMonitor.on('suspend',lockApp);
    powerMonitor.on('lock-screen',lockApp);
  });

  // Beim Beenden die eigene Kopie aus der Zwischenablage nehmen (CLIPBOARD und PRIMARY). Höchstens LINK_MS auf die Kette warten (ein noch laufendes
  // Schreiben/Löschen), steht sie länger, direkt an ihr vorbei löschen (Pass R2-3) — zusammen höchstens etwa 5 s (Deckel `end`). Ein zweites app.quit() während des
  // Wartens wird abgefangen (quitDone, Pass A-3); clip:write ist ab hier abgewiesen.
  // Lief das Glied durch, hat aber nicht alles bestätigt (einmal abgelehntes Lesen/Löschen), fasst das Beenden direkt nach, solange `pending` nicht leer ist
  // und Zeit bleibt — das Nachfassen per Zeitgeber käme nach dem Beenden nicht mehr, und Klippers Spiegel in PRIMARY überlebte es (Release-Audit Notes v1.8 A-1).
  app.on('before-quit',ev=>{ if(quitDone) return; ev.preventDefault(); if(quitting) return; quitting=true;
    const cap=(p,ms)=>Promise.race([Promise.resolve(p).then(()=>true,()=>true),new Promise(r=>setTimeout(()=>r(false),ms))]);
    const end=performance.now()+5000;
    (async()=>{
      if(!(await cap(run(()=>clearOwned()),LINK_MS))) await cap(clearOwned(),LINK_MS+500);
      // … und auch, solange ein spätes Schreiben noch nicht gelandet ist oder sein Spiegel noch kommen kann (R2-H2: es stand noch nicht in `pending`)
      while((pending.size||lateN||performance.now()<lateUntil)&&performance.now()<end-300){
        if(pending.size) await cap(clearOwned('retry'),Math.min(LINK_MS+500,end-performance.now()));
        if(pending.size||lateN||performance.now()<lateUntil) await new Promise(r=>setTimeout(r,150)); }
    })().catch(()=>{}).finally(()=>{ quitDone=true; app.quit(); }); });
  app.on('window-all-closed',()=>app.quit());
}
