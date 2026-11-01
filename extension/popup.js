'use strict';
const status=document.getElementById('status'),button=document.getElementById('toggle');let tabId,active=false;
async function ensure(){
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});tabId=tab?.id;
 if(!tabId||!/^https?:/.test(tab.url||''))throw Error('Open an ordinary http/https webpage.');
 let existing=null;
 try{existing=await chrome.tabs.sendMessage(tabId,{type:'STATUS'});}catch(_){}
 if(existing?.version==='0.8.0')return existing;
 await chrome.scripting.executeScript({target:{tabId},files:['layout.js','interaction-tracker.js','capture.js']});
 const status=await chrome.tabs.sendMessage(tabId,{type:'STATUS'});
 if(status?.version!=='0.8.0')throw Error('Could not initialize SmartCapture v0.8. Reload this tab and retry.');
 return status;
}
async function refresh(){try{const r=await ensure();active=r.active;button.textContent=active?'Stop & Save PNG':'Start Capture';status.textContent=active?`Recording — ${r.count} popup(s) saved from ${r.detected||0} interactions`:'Ready to record this tab';button.disabled=false;}catch(e){button.disabled=true;status.textContent=e.message;}}
button.onclick=async()=>{button.disabled=true;try{const r=await chrome.tabs.sendMessage(tabId,{type:active?'STOP':'START'});if(r.error)throw Error(r.error);status.textContent=r.message;if(!active)window.close();else{active=false;button.textContent='Start Capture';button.disabled=false;}}catch(e){status.textContent=e.message;button.disabled=false;}};
refresh();