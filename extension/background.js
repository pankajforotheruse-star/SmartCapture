'use strict';
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  if(msg?.type!=='SCREENSHOT')return;
  chrome.tabs.captureVisibleTab(sender.tab.windowId,{format:'png'}).then(image=>sendResponse({image})).catch(e=>sendResponse({error:e.message}));
  return true;
});