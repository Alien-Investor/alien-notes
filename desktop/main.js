'use strict';
// Alien Notes Desktop — Hauptprozess.
// Lädt ausschließlich die gebündelte App über app://aliennotes/ — kein Netz, keine Navigation, keine fremden Fenster.
// Im Flatpak nimmt zusätzlich das System das Netz weg (keine --share=network); diese Datei ist die zweite Schicht.
const {app,BrowserWindow,protocol,session,ipcMain,clipboard,ClipboardItem,Menu,powerMonitor,dialog}=require('electron');
const path=require('path'); const fs=require('fs'); const crypto=require('crypto');
const {writeFull,writeAtomic}=require('./atomic.js');

const ORIGIN='app://aliennotes';
const ENTRY=ORIGIN+'/index.html';
const WWW=path.join(__dirname,'www');
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'};
const KDE_HINT='electron application/osclipboard;format="x-kde-passwordManagerHint"';   // Klipper übernimmt so markierte Einträge nicht
const CLIP_MAX=20000;
const FILE_MAX=20*1024*1024;   // wie MAX_FILE_BYTES in app.js
// Notizen als eigene Datei statt im Browser-Speicher. Im Flatpak liegt XDG_DATA_HOME unter ~/.var/app/<id>/data.
const DATA_DIR=path.join(process.env.XDG_DATA_HOME||path.join(app.getPath('home'),'.local','share'),'alien-notes');
const VAULT_FILE=path.join(DATA_DIR,'notes.ainv');

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
  let ownedSel=null;   // Hash des zuletzt in der App markierten Texts (X11-Auswahl, Mittelklick) — Klipper speichert sie nicht, aber jedes Programm liest sie
  async function clearOwned(){
    if(owned){ let cur=''; try{ cur=await clipboard.readText(); }catch(_){}
      if(cur&&sha(cur)===owned) await clipboard.clear();   // nur löschen, was noch von uns stammt; fremde Kopien bleiben
      owned=null; }
    if(ownedSel){ let cur=''; try{ cur=await clipboard.selection.readText(); }catch(_){}
      if(cur&&sha(cur)===ownedSel){ try{ await clipboard.selection.clear(); }catch(_){} }   // ebenso nur die eigene Markierung
      ownedSel=null; }
  }
  ipcMain.handle('clip:write',async(e,text)=>{
    if(!fromApp(e)) throw new Error('denied');
    if(typeof text!=='string'||!text||text.length>CLIP_MAX) throw new Error('bad');
    await clipboard.write([new ClipboardItem({'text/plain':new Blob([text],{type:'text/plain'}),[KDE_HINT]:new Blob(['secret'])})]);
    owned=sha(text); return true;
  });
  ipcMain.handle('clip:selected',async(e,text)=>{   // App meldet markierten Text; gemerkt wird nur der Hash
    if(!fromApp(e)) throw new Error('denied');
    if(typeof text!=='string'||text.length>CLIP_MAX) throw new Error('bad');
    ownedSel=text?sha(text):null; return true;
  });
  ipcMain.handle('clip:clear',async e=>{ if(!fromApp(e)) throw new Error('denied'); await clearOwned(); return true; });

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

  // Jede Webansicht: keine Navigation, keine neuen Fenster, keine <webview>
  app.on('web-contents-created',(_e,wc)=>{
    wc.on('will-navigate',ev=>ev.preventDefault());
    wc.on('will-redirect',ev=>ev.preventDefault());
    wc.on('will-attach-webview',ev=>ev.preventDefault());
    wc.setWindowOpenHandler(()=>({action:'deny'}));
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

  // Beim Beenden die eigene Kopie aus der Zwischenablage nehmen
  let quitting=false;
  app.on('before-quit',ev=>{ if(quitting||(!owned&&!ownedSel)) return; ev.preventDefault(); quitting=true; clearOwned().catch(()=>{}).finally(()=>app.quit()); });
  app.on('window-all-closed',()=>app.quit());
}
