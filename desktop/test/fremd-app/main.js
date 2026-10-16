'use strict';
// Prüfer B3: fremder Zwischenablage-Teilnehmer (eigener Prozess, eigene X11-Verbindung).
// FREMD_MODE=own (Vorgabe): schreibt FREMD_TEXT in PRIMARY (FREMD_BUF=clipboard: in CLIPBOARD), meldet "OWN" und bleibt am Leben, bis er beendet wird.
//   Der Aufrufer hält ihn per SIGSTOP an — dann beantwortet er keine Auswahl-Anfragen mehr (hängender fremder Besitzer).
// FREMD_MODE=read: liest PRIMARY (Frist 3 s) und meldet nur Länge und Anzahl des Markers FREMD_MARK ("READ {...}"), dann Ende.
const {app,clipboard,BrowserWindow}=require('electron');
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  if(process.env.FREMD_MODE==='read'){
    const t=await Promise.race([clipboard.selection.readText(),new Promise(r=>setTimeout(()=>r(null),3000))]);
    const m=process.env.FREMD_MARK||'\u0000';
    console.log('READ '+JSON.stringify(t===null?{haengt:true}:{len:t.length,mark:t.split(m).length-1}));
    app.exit(0); return; }
  const w=new BrowserWindow({show:false,width:50,height:50});
  const t=process.env.FREMD_TEXT||'fremd';
  if(process.env.FREMD_BUF==='clipboard') await clipboard.writeText(t);
  else if(clipboard.selection&&clipboard.selection.writeText) await clipboard.selection.writeText(t); else clipboard.writeText(t,'selection');
  console.log('OWN'); });
app.on('window-all-closed',()=>{});
