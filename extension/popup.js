'use strict';
const status=document.getElementById('status'),button=document.getElementById('toggle');let tabId,active=false;
async function ensure(){
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});tabId=tab?.id;
 if(!tabId||!/^https?:/.test(tab.url||''))throw Error('Open an ordinary http/https webpage.');
 try{const r=await chrome.tabs.sendMessage(tabId,{type:'STATUS'});if(r?.version==='0.8.0')return r;}
 catch(_){await chrome.scripting.executeScript({target:{tabId},files:['layout.js','interaction-tracker.js','capture.js']});return chrome.tabs.sendMessage(tabId,{type:'STATUS'});}
}
async function refresh(){try{const r=await ensure();active=r.active;button.textContent=active?'Stop & Save PNG':'Start Capture';status.textContent=active?`Recording — ${r.count} unique popup(s) collected`:'Ready to record this tab';button.disabled=false;}catch(e){button.disabled=true;status.textContent=e.message;}}
button.onclick=async()=>{button.disabled=true;try{const r=await chrome.tabs.sendMessage(tabId,{type:active?'STOP':'START'});if(r.error)throw Error(r.error);status.textContent=r.message;if(!active)window.close();else await refresh();}catch(e){status.textContent=e.message;button.disabled=false;}};
refresh();