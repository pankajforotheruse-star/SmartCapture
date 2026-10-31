'use strict';
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(msg?.type!=='SCREENSHOT')return;
 chrome.tabs.captureVisibleTab(sender.tab.windowId,{format:'png'}).then(image=>reply({image})).catch(e=>reply({error:e.message}));return true;
});
chrome.commands.onCommand.addListener(async command=>{
 if(command!=='capture-popup')return;
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
 if(tab?.id)chrome.tabs.sendMessage(tab.id,{type:'CAPTURE'}).catch(()=>{});
});