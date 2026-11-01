'use strict';
/* Event-driven, source-specific popup recorder.
   One timer per genuine interaction. Mutations only retry the currently
   active trigger, never all historic mouseovers. */
(() => {
  function create({capture,delay=120,setTimer=setTimeout,clearTimer=clearTimeout}) {
    const entries=new Map();
    function schedule(e,ms=delay){
      if(e.done||e.timer!==null||e.running||e.attempts>=2)return;
      e.timer=setTimer(()=>{e.timer=null;void attempt(e);},ms);
    }
    async function attempt(e){
      if(e.done)return true;
      if(e.running)return false;
      e.running=true;e.attempts++;
      const info=e.info;
      let ok=false;
      try{ok=!!(await capture(info));}
      catch(error){e.error=String(error?.message||error);}
      finally{e.running=false;if(ok)e.done=true;}
      // A new hover may have arrived during the previous screenshot attempt.
      if(!ok&&e.info!==info)schedule(e,0);
      return ok;
    }
    function note(info){
      if(!info?.id)throw Error('Trigger id missing');
      let e=entries.get(info.id);
      if(!e){e={info,done:false,attempts:0,timer:null,running:false,error:null};entries.set(info.id,e);}
      else if(!e.done){
        if(e.info!==info){e.attempts=0;e.info=info;}
      }
      schedule(e);
      return e;
    }
    function retryPending(id){
      if(!id)return;
      const e=entries.get(id);
      if(e&&!e.done)schedule(e,85);
    }
    async function flush(){
      const eligible=[];
      for(const e of entries.values()){
        if(e.timer!==null){clearTimer(e.timer);e.timer=null;if(!e.done&&!e.running)eligible.push(e);}
      }
      await Promise.all(eligible.map(attempt));
      // Allow running screenshots to complete, but don't launch new
      // screenshots for stale interactions that disappeared long ago.
      while([...entries.values()].some(e=>e.running))
        await new Promise(resolve=>setTimer(resolve,35));
      return stats();
    }
    function stats(){
      const values=[...entries.values()];
      return {seen:values.length,captured:values.filter(e=>e.done).length,
        pending:values.filter(e=>!e.done).length,attempts:values.reduce((n,e)=>n+e.attempts,0)};
    }
    function reset(){
      for(const e of entries.values())if(e.timer!==null)clearTimer(e.timer);
      entries.clear();
    }
    return {note,retryPending,flush,stats,reset};
  }
  window.SmartCaptureTracker={create};
})();