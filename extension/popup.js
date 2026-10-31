'use strict';
let tabId;const status=document.getElementById('status');
async function send(type){if(!tabId)throw Error('No active tab');const result=await chrome.tabs.sendMessage(tabId,{type});if(result?.error)throw Error(result.error);return result;}
async function refresh(){try{const r=await send('STATUS');status.textContent=r.started?`Session active — ${r.count} popup(s) saved`:'Ready to capture base page';document.getElementById('capture').disabled=!r.started;document.getElementById('export').disabled=!r.started;}catch(e){status.textContent=e.message;}}
(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});tabId=tab?.id;await refresh();})();
for(const [id,type] of [['start','START'],['capture','CAPTURE'],['export','EXPORT'],['reset','RESET']])document.getElementById(id).onclick=async()=>{try{const r=await send(type);status.textContent=r.message||'Done';}catch(e){status.textContent='Error: '+e.message;}setTimeout(refresh,500);};