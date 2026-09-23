'use strict';
// Alien Notes Desktop — Brücke zur App. Mehr als diese Aufrufe gibt es nicht; die Seite sieht weder Node noch Pfade.
const {contextBridge,ipcRenderer}=require('electron');
const sync=(ch,...a)=>{ const r=ipcRenderer.sendSync(ch,...a); if(!r||!r.ok) throw new Error('store'); return r; };

contextBridge.exposeInMainWorld('AlienDesktop',{
  clip:{   // gleiche Gestalt wie SecureClip auf Android
    write:o=>ipcRenderer.invoke('clip:write',String(o&&o.text||'')),
    clear:()=>ipcRenderer.invoke('clip:clear'),
    selected:t=>ipcRenderer.invoke('clip:selected',String(t||''))   // markierter Text (X11-Auswahl) → wird mit der Frist mitgelöscht
  },
  store:{   // der Tresor als Datei; synchron wie localStorage, wirft bei jedem Fehler
    read:()=>sync('store:read').data,
    write:s=>{ sync('store:write',String(s)); },
    del:()=>{ sync('store:del'); }
  },
  saveBackup:(name,content)=>ipcRenderer.invoke('backup:save',String(name),String(content)),   // → Dateiname oder null (abgebrochen)
  onLock:cb=>{ if(typeof cb==='function') ipcRenderer.on('lock',()=>cb()); },
  onBackground:cb=>{ if(typeof cb==='function') ipcRenderer.on('bg',(_e,h)=>cb(h==='blur'?'blur':!!h)); }   // Fenster minimiert/versteckt (true), zurück (false), Fensterwechsel ('blur': nur Gate-Hygiene, keine Sperre)
});
