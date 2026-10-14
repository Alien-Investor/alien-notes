'use strict';
// Einzeltest für desktop/atomic.js bei voller Platte (Audit run-6 #2). Läuft unter „trap '' XFSZ; ulimit -f <KiB>“ (aus verify-desktop.mjs):
// ein Schreibvorgang über der Grenze muss werfen, die alte Datei muss unverändert bleiben, keine Temp-Reste.
const fs=require('fs'); const path=require('path');
const {writeAtomic}=require('../atomic.js');
const R=(name,ok,info)=>console.log('R '+JSON.stringify({name,ok:!!ok,info:info===undefined?null:info}));
const dir=process.argv[2]; fs.mkdirSync(dir,{recursive:true}); const file=path.join(dir,'notes.ainv');

const good=JSON.stringify({magic:'AINV1',body:'a'.repeat(20000)});
writeAtomic(file,good);
R('kleiner Stand geschrieben', fs.readFileSync(file,'utf8')===good);

let threw=null; try{ writeAtomic(file,JSON.stringify({magic:'AINV1',body:'b'.repeat(200000)})); }catch(e){ threw=e.code||e.message; }
R('zu großer Stand wirft', !!threw, threw);
R('alte Datei unverändert', fs.readFileSync(file,'utf8')===good);
R('keine Temp-Reste', fs.readdirSync(dir).every(n=>n==='notes.ainv'), fs.readdirSync(dir));

// v1.13 (Audit run-10 b-6): Temp-Name mit Zufall, exklusiv und ohne Symlink-Folgen. Eigener Ordner neben dem obigen, dort gilt weiter „keine Temp-Reste“.
const crypto=require('crypto');
const d2=path.join(path.dirname(dir),'atomic-b6'); fs.rmSync(d2,{recursive:true,force:true}); fs.mkdirSync(d2,{recursive:true});
const f2=path.join(d2,'notes.ainv'); const opened=[]; const realOpen=fs.openSync;
fs.openSync=function(p,fl,mode){ if(String(p).includes('.tmp-')) opened.push({p:String(p),fl,mode}); return realOpen.apply(fs,arguments); };
const realRnd=crypto.randomBytes;
try{
writeAtomic(f2,'eins'); writeAtomic(f2,'zwei');
const names=opened.map(o=>path.basename(o.p));
R('Temp-Name mit 12 Hex-Zeichen Zufall, nicht die PID', names.length===2&&names.every(n=>/^\.notes\.ainv\.tmp-[0-9a-f]{12}$/.test(n)&&!n.endsWith('-'+process.pid))&&names[0]!==names[1], names);
const C=fs.constants, WANT=C.O_WRONLY|C.O_CREAT|C.O_EXCL|C.O_NOFOLLOW;
R('Temp exklusiv ohne Symlink-Folgen (O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW), Rechte 0600', opened.length===2&&opened.every(o=>o.fl===WANT&&o.mode===0o600), opened.map(o=>[o.fl,o.mode]));
R('Zieldatei mit Rechten 600 und neuem Inhalt', (fs.statSync(f2).mode&0o777)===0o600&&fs.readFileSync(f2,'utf8')==='zwei', (fs.statSync(f2).mode&0o777).toString(8));
// Symlink am alten, vorhersagbaren Namen (bis v1.12: .tmp-<pid>) auf eine fremde Datei und ein hängender Link: beide lenken nichts mehr um
const victim=path.join(d2,'opfer.txt'); fs.writeFileSync(victim,'OPFER'); const ghost=path.join(d2,'nicht-da.txt'); const pidTmp=path.join(d2,'.notes.ainv.tmp-'+process.pid);
fs.symlinkSync(victim,pidTmp);
let e3=null; try{ writeAtomic(f2,'drei'); }catch(e){ e3=e.code||e.message; }
R('Symlink am alten PID-Namen lenkt nicht um', !e3&&fs.readFileSync(f2,'utf8')==='drei'&&fs.readFileSync(victim,'utf8')==='OPFER', e3);
try{ fs.unlinkSync(pidTmp); }catch(_){} fs.symlinkSync(ghost,pidTmp);
let e3b=null; try{ writeAtomic(f2,'drei-b'); }catch(e){ e3b=e.code||e.message; }
R('hängender Symlink am alten PID-Namen legt nichts an', !e3b&&fs.readFileSync(f2,'utf8')==='drei-b'&&!fs.existsSync(ghost), e3b);
// Symlink GENAU am Zufallsnamen (Zufall festgenagelt): Abbruch mit EEXIST, Ziel und fremde Datei unverändert
crypto.randomBytes=n=>Buffer.alloc(n,0xab); const fixed=path.join(d2,'.notes.ainv.tmp-'+'ab'.repeat(6));
fs.symlinkSync(victim,fixed);
let e4=null; try{ writeAtomic(f2,'vier'); }catch(e){ e4=e.code||e.message; }
R('Symlink am Zufallsnamen: EEXIST, nichts umgelenkt', e4==='EEXIST'&&fs.readFileSync(victim,'utf8')==='OPFER'&&fs.readFileSync(f2,'utf8')==='drei-b', e4);
// Normale (längere) Datei genau am Zufallsnamen: ohne O_EXCL würde sie geöffnet statt abgewiesen
try{ fs.unlinkSync(fixed); }catch(_){} fs.writeFileSync(fixed,'X'.repeat(100));
let e5=null; try{ writeAtomic(f2,'fuenf'); }catch(e){ e5=e.code||e.message; }
R('Datei am Zufallsnamen: EEXIST, Ziel unverändert', e5==='EEXIST'&&fs.readFileSync(f2,'utf8')==='drei-b', e5);
// Absturz-Reste (alter und neuer Stil) sperren kein späteres Speichern
try{ fs.unlinkSync(pidTmp); }catch(_){} fs.writeFileSync(pidTmp,'alt'); fs.writeFileSync(path.join(d2,'.notes.ainv.tmp-0123456789ab'),'alt');
let e6=null; try{ writeAtomic(f2,'sechs'); }catch(e){ e6=e.code||e.message; }
R('Absturz-Reste sperren kein Speichern', !e6&&fs.readFileSync(f2,'utf8')==='sechs', e6);
}finally{ fs.openSync=realOpen; crypto.randomBytes=realRnd; }
// Endmarke: fehlt sie (Abbruch, z. B. Dateisystem ohne Symlinks), meldet verify-desktop [2c] den Schritt als unvollständig statt still weniger Prüfungen
R('Schritt vollständig', true);
