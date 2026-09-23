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
