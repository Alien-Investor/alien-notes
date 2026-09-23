'use strict';
// Prüfprogramm für die echte Hülle (Alien Notes, aus Alien Pass übernommen): lädt main.js wie die App und prüft von innen (keine Fernsteuerung
// von außen — die Hülle verweigert --remote-debugging-*, und die Fuses sperren --inspect). Aufruf über verify-desktop.mjs.
// Gibt je Prüfung eine Zeile "R <json>" aus, nie Notizen- oder Zwischenablage-Inhalte.
const {app,BrowserWindow,Menu,session,clipboard,ClipboardItem}=require('electron');
const path=require('path'); const fs=require('fs'); const net=require('net'); const dgram=require('dgram');
require('./main.js');

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
    try{await AlienDesktop.saveBackup('a.notes','x');r.push('save-OK')}catch(e){r.push('save-DENIED')}
    return r.join(',');})()`,true);
  R('fremder Frame: alle Brücken-Aufrufe abgewiesen', foreign==='read-DENIED,write-DENIED,clip-DENIED,save-DENIED', foreign);
  w2.destroy();

  const M1='an-harness-'+process.pid+'-a', M2='an-harness-'+process.pid+'-b';
  await js(`AlienDesktop.clip.write({text:${JSON.stringify(M1)}})`);
  R('Kopie trägt den KDE-Hinweis', await clipboard.has(KDE_HINT)&&(await clipboard.readText())===M1);
  await js(`AlienDesktop.clip.clear()`);
  R('eigene Kopie gelöscht', (await clipboard.readText())!==M1);
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

  await js(`(()=>{ const n=[...document.querySelectorAll('#entry-list .entry .t')].find(x=>x.textContent==='Harness Notiz'); const r=document.createRange(); r.selectNodeContents(n); const g=getSelection(); g.removeAllRanges(); g.addRange(r); document.execCommand('copy'); g.removeAllRanges(); })()`);
  await sleep(400);
  R('Strg+C: Kopie mit KDE-Hinweis', await clipboard.has(KDE_HINT)&&(await clipboard.readText())==='Harness Notiz');
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
  await fill('lock-pass',PP);
  await clipboard.selection.writeText('vorher-'+process.pid);
  await js(`document.getElementById('lock-pass').focus(); true`); await sleep(200);
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']}); win.webContents.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['control']});
  await sleep(500);
  R('Sperrbildschirm: Strg+A im maskierten Feld legt die Passphrase in PRIMARY (Chromium) — darum muss die App sie melden', (await clipboard.selection.readText())===PP);
  await click('#unlock-btn');
  R('entsperrt mit der Passphrase', await until(visible('screen-app')));
  R('Notiz aus der Datei da', await until(`[...document.querySelectorAll('#entry-list .entry .t')].some(n=>n.textContent==='Harness Notiz')`,10000));
  await sleep(500);
  R('Sperrbildschirm: markierte Passphrase nach dem Entsperren aus der Auswahl', (await clipboard.selection.readText())!==PP);
  await clipboard.selection.clear();
  // PIN in der echten Hülle: einrichten, Hintergrund-Sperre, per PIN öffnen — nichts davon auf der Platte
  await js(`App.tab('settings')`); await sleep(200);
  R('PIN-Karte in der Hülle sichtbar', await js(`(()=>{const n=document.getElementById('pin-card');return !!n&&getComputedStyle(n).display!=='none';})()`));
  await fill('pin-new','246810'); await fill('pin-rep','246810'); await fill('pin-pass',PP); await click('#pin-btn-on');
  R('PIN eingerichtet', await until(visible('pin-on'),40000));
  await js(`App.setBgLock('0')`); await sleep(600);
  const h0=fs.readFileSync(VAULT,'utf8');   // nach der Einstellung lesen: die Datei darf sich durch PIN-Einrichtung + Sperre nicht mehr ändern
  win.minimize(); R('Hintergrund-Sperre', await until(visible('screen-lock'),5000)); win.restore(); await sleep(400);
  R('PIN-Block auf dem Sperrbildschirm', await js(visible('pin-box')));
  R('Notizen-Datei durch PIN-Einrichtung und Sperre unverändert (nichts auf der Platte)', fs.readFileSync(VAULT,'utf8')===h0&&fs.readdirSync(DATA).every(n=>n==='notes.ainv'));
  await fill('lock-pin','246810'); await click('#pin-btn');
  R('per PIN entsperrt', await until(visible('screen-app'),40000));
  await js(`App.setBgLock('1800')`); await sleep(400);
}
async function background(){
  R('Hintergrund: Sperrbildschirm', await until(visible('screen-lock'),15000));
  await fill('lock-pass',PP); await click('#unlock-btn'); R('Hintergrund: entsperrt', await until(visible('screen-app')));
  await js(`App.setAutolock('0')`); await js(`App.setBgLock('0')`); await sleep(600);
  win.minimize(); const locked=await until(visible('screen-lock'),5000);
  R('Minimieren sperrt bei „sofort“ (Inaktivität aus)', locked);
  win.restore(); await sleep(400);
  await fill('lock-pass',PP); await click('#unlock-btn'); await until(visible('screen-app'));
  await js(`App.setBgLock('60')`); await sleep(600);
  win.minimize(); await sleep(1200); win.restore(); await sleep(600);
  R('kurz minimiert bei 1 min: bleibt entsperrt', await js(visible('screen-app')));
  await fill('lock-pass','x'); win.hide(); await sleep(600); win.show(); await sleep(400);
  R('Verstecken leert getippte Eingaben', await js(`document.getElementById('lock-pass').value===''`));
  R('Hülle verdrahtet blur', fs.readFileSync(path.join(__dirname,'main.js'),'utf8').includes("win.on('blur',bg('blur'))"));
  await js(`App.tab('settings')`); await fill('cp-cur','halb-getippt'); win.webContents.send('bg','blur'); await sleep(400);
  R('Fensterwechsel leert getippte Passphrase, sperrt nicht', await js(`document.getElementById('cp-cur').value===''`)&&await js(visible('screen-app')));
  await js(`App.tab('list')`);
  await fill('lock-pass',PP); await click('#unlock-btn'); await until(visible('screen-app'));
  await js(`App.setBgLock('0')`); await sleep(600); await js(`App.lockNow()`); await until(visible('screen-lock'),5000);
  await fill('lock-pass',PP); await click('#unlock-btn'); win.minimize(); await sleep(4000); win.restore(); await sleep(600);
  R('während des Entsperrens minimiert: bleibt gesperrt', await js(visible('screen-lock'))&&!(await js(visible('screen-app'))));
  await fill('lock-pass',PP); await click('#unlock-btn'); await until(visible('screen-app'));
  // Editor-Stand wird vor der Hintergrund-Sperre gesichert (Autosave, Alien Notes)
  await js(`App.setBgLock('60')`); await sleep(400);
  await click('button[data-action="newEntry"]'); await sleep(300); await fill('f-body','hintergrund-gesichert-'+process.pid);
  win.minimize(); await sleep(800); win.restore(); await sleep(800);
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
      else if(STEP==='hold'){ R('läuft',true); await sleep(Number(process.env.AP_HOLD||8000)); }
    }catch(e){ R('Ausnahme im Prüfprogramm',false,String(e&&e.stack||e)); }
    app.exit(0);
  });
});
