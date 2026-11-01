'use strict';
/* Per-trigger capture coordinator. Independent timers; no cross-trigger cancellation. */
(() => {
  function create({capture, delay=180, setTimer=setTimeout, clearTimer=clearTimeout}) {
    const entries=new Map();
    function schedule(entry, ms=delay) {
      if(entry.done)return;
      if(entry.timer!==null)clearTimer(entry.timer);
      entry.timer=setTimer(()=>{entry.timer=null;void attempt(entry);},ms);
    }
    async function attempt(entry) {
      if(entry.done)return true;
      if(entry.running){entry.again=true;return false;}
      entry.running=true;
      let captured=false;
      try{captured=Boolean(await capture(entry.info));}
      catch(error){entry.error=String(error?.message||error);}
      finally{
        entry.running=false;
        if(captured)entry.done=true;
        else if(entry.again){entry.again=false;schedule(entry);}
      }
      return captured;
    }
    function note(info, immediate=false) {
      if(!info?.id)throw Error('Trigger id missing');
      let entry=entries.get(info.id);
      if(!entry){entry={info,done:false,running:false,again:false,timer:null,error:null};entries.set(info.id,entry);}
      else{entry.info=info;}
      schedule(entry,immediate?0:delay);
      return entry;
    }
    function retryPending(){
      for(const entry of entries.values())if(!entry.done&&!entry.running)schedule(entry,0);
    }
    async function flush() {
      for(const entry of entries.values())if(entry.timer!==null){clearTimer(entry.timer);entry.timer=null;}
      // Do not start a duplicate capture if one is already running.
      const pending=Array.from(entries.values()).filter(e=>!e.done&&!e.running);
      await Promise.all(pending.map(attempt));
      while(Array.from(entries.values()).some(e=>e.running))await new Promise(r=>setTimer(r,35));
      return stats();
    }
    function stats(){
      const all=Array.from(entries.values());return {seen:all.length,captured:all.filter(e=>e.done).length,pending:all.filter(e=>!e.done).length};
    }
    function reset(){for(const e of entries.values())if(e.timer!==null)clearTimer(e.timer);entries.clear();}
    return {note,retryPending,flush,stats,reset};
  }
  window.SmartCaptureTracker={create};
})();