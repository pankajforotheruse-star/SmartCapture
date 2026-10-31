'use strict';
(() => {
 if(window.__smartCaptureV2)return;
 window.__smartCaptureV2=true;
 const state={active:false,base:null,items:[],anchor:null,pending:null,observing:null,busy:false,lastCapture:0,protectedRects:[]};
 const rect=r=>({x:r.x,y:r.y,width:r.width,height:r.height});
 const sleep=t=>new Promise(r=>setTimeout(r,t));
 const visible=el=>{if(!(el instanceof Element))return false;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>75&&r.height>35&&r.width<innerWidth*.85&&r.height<innerHeight*.94&&r.top>=-2&&r.left>=-2&&r.bottom<=innerHeight+2&&r.right<=innerWidth+2&&s.visibility!=='hidden'&&s.display!=='none'&&+s.opacity!==0;};
 const textOf=el=>(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
 const normalize=s=>s.toLowerCase().replace(/\s+/g,' ').trim();
 async function shot(){const r=await chrome.runtime.sendMessage({type:'SCREENSHOT'});if(!r?.image)throw Error(r?.error||'Cannot capture tab');return r.image;}
 const load=src=>new Promise((ok,bad)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=()=>bad(Error('Image decoding failed'));im.src=src;});
 function pick(anchor){
  const pool=new Set(document.querySelectorAll('[role="dialog"],[role="tooltip"],[role="menu"],[role="listbox"],[aria-modal="true"],[class*="popover" i],[class*="dropdown" i],[class*="tooltip" i],[class*="overlay" i]'));
  if(state.pending?.target instanceof Element){for(let el=state.pending.target,n=0;el&&n<5;el=el.parentElement,n++)pool.add(el);}
  let result=null,top=-Infinity;
  for(const el of pool){
   if(!visible(el))continue;const r=el.getBoundingClientRect(),s=getComputedStyle(el);
   const content=textOf(el);if(content.length<8||content.length>3500)continue;
   const dx=Math.max(0,r.left-(anchor.x+anchor.width),anchor.x-r.right),dy=Math.max(0,r.top-(anchor.y+anchor.height),anchor.y-r.bottom);
   const cls=String(el.className||'');
   const hint=/tooltip|popover|dropdown|dialog|menu|overlay/i.test(cls)||/dialog|tooltip|menu|listbox/.test(el.getAttribute('role')||'');
   const layer=['absolute','fixed','sticky'].includes(s.position)||parseInt(s.zIndex,10)>1;
   if(!hint&&!layer)continue;
   const score=(hint?200:0)+(layer?100:0)-Math.hypot(dx,dy)*1.4-Math.max(0,r.width*r.height-100000)/2000;
   if(score>top){top=score;result=el;}
  }
  return top>-500?result:null;
 }
 function schedule(target,delay=320){
  if(!state.active||!state.anchor)return;
  state.pending={target};clearTimeout(state.timer);
  state.timer=setTimeout(()=>record().catch(()=>{}),delay);
 }
 function effectiveOpacity(el){
  let opacity=1;
  for(let n=el;n instanceof Element;n=n.parentElement){
    const style=getComputedStyle(n);opacity*=Number(style.opacity||1);
    if(style.visibility==='hidden'||style.display==='none')return 0;
  }
  return opacity;
 }
 async function waitStable(el){
  let previous='',matches=0;
  for(let attempt=0;attempt<15;attempt++){
    if(!el.isConnected||!visible(el))return false;
    const r=el.getBoundingClientRect(),label=normalize(textOf(el));
    const signature=[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height),label].join('|');
    const moving=[el,el.parentElement].filter(Boolean).some(node=>node.getAnimations?.().some(a=>a.playState==='running'));
    if(effectiveOpacity(el)>=0.98&&!moving&&signature===previous)matches++;
    else matches=0;
    if(matches>=2){await sleep(130);return el.isConnected&&effectiveOpacity(el)>=.98;}
    previous=signature;await sleep(160);
  }
  return false; // Decline to capture a partially transparent, animated popup.
 }
 async function record(){
  if(!state.active||state.busy||!state.anchor)return;
  const anchor={...state.anchor},el=pick(anchor.rect);if(!el)return;
  const content=normalize(textOf(el));
  const key=[anchor.label,Math.round(anchor.rect.x/12),Math.round(anchor.rect.y/12),content].join('|');
  if(state.items.some(it=>it.key===key))return;
  state.busy=true;
  try{
    if(!await waitStable(el))return;
    if(!state.active)return;
    // Popup may update while waiting. Record the stable content signature.
    const stableText=normalize(textOf(el));
    const stableKey=[anchor.label,Math.round(anchor.rect.x/12),Math.round(anchor.rect.y/12),stableText].join('|');
    if(state.items.some(it=>it.key===stableKey))return;
    const r=el.getBoundingClientRect(),image=await load(await shot());
    const sx=image.naturalWidth/innerWidth,sy=image.naturalHeight/innerHeight;
    const x=Math.max(0,Math.round(r.left*sx)),y=Math.max(0,Math.round(r.top*sy));
    const w=Math.min(image.naturalWidth-x,Math.round(r.width*sx)),h=Math.min(image.naturalHeight-y,Math.round(r.height*sy));
    if(w<20||h<20)return;
    const c=document.createElement('canvas');c.width=w;c.height=h;
    c.getContext('2d').drawImage(image,x,y,w,h,0,0,w,h);
    state.items.push({key:stableKey,label:anchor.label,anchor:anchor.rect,image:c.toDataURL('image/png'),width:w,height:h});
    state.lastCapture=Date.now();
  }finally{state.busy=false;}
 }
 function anchorFrom(target){
  const el=target?.closest?.('button,a,[role="button"],[aria-haspopup],input,[tabindex]')||target;
  if(!(el instanceof Element))return;
  const r=el.getBoundingClientRect();
  if(r.width>innerWidth*.75||r.height>innerHeight*.6)return;
  state.anchor={rect:rect(r),label:normalize(textOf(el)||el.getAttribute('aria-label')||el.getAttribute('title')||el.tagName).slice(0,100)};
 }
 document.addEventListener('pointerdown',e=>{if(!state.active)return;anchorFrom(e.target);state.clickAnchorUntil=Date.now()+2300;schedule(e.target,340);},true);
 document.addEventListener('pointerover',e=>{if(!state.active)return;const t=e.target;if(t?.closest?.('button,a,[role="button"],[aria-haspopup],[title],[aria-label]')){if(Date.now()>(state.clickAnchorUntil||0))anchorFrom(t);schedule(t,550);}else if(state.anchor)schedule(t,380);},true);
 document.addEventListener('focusin',e=>{if(state.active){anchorFrom(e.target);schedule(e.target,350);}},true);
 function observer(){state.observing=new MutationObserver(()=>{if(state.active&&state.anchor&&Date.now()-state.lastCapture>550)schedule(state.pending?.target||document.activeElement,420);});state.observing.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','aria-expanded','aria-hidden']});}
 async function start(){
  state.active=false;clearTimeout(state.timer);state.observing?.disconnect();
  state.items=[];state.anchor=null;state.pending=null;state.busy=false;
  await sleep(150);const image=await shot();const im=await load(image);
  state.base={image,width:im.naturalWidth,height:im.naturalHeight,viewportWidth:innerWidth,viewportHeight:innerHeight};
  // Text-level occupancy: never block whole white cards merely because they're containers.
  const protectedRects=[];const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  let node,seen=0;
  while((node=walker.nextNode())&&seen++<18000){
    if(!node.textContent?.trim()||!node.parentElement)continue;
    const style=getComputedStyle(node.parentElement);
    if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)continue;
    const range=document.createRange();range.selectNodeContents(node);
    for(const r of range.getClientRects()){
      if(r.width<2||r.height<2||r.bottom<=0||r.right<=0||r.left>=innerWidth||r.top>=innerHeight)continue;
      protectedRects.push({x:Math.max(0,r.left),y:Math.max(0,r.top),w:Math.min(innerWidth,r.right)-Math.max(0,r.left),h:Math.min(innerHeight,r.bottom)-Math.max(0,r.top)});
    }
  }
  const controls='button,a,input,select,textarea,svg,canvas,img,[role="button"],[role="img"],[role="checkbox"]';
  for(const el of document.querySelectorAll(controls)){
    const r=el.getBoundingClientRect(),sty=getComputedStyle(el);
    if(r.width<3||r.height<3||r.bottom<0||r.right<0||r.top>=innerHeight||r.left>=innerWidth||sty.visibility==='hidden'||sty.display==='none')continue;
    if(r.width>innerWidth*.8||r.height>innerHeight*.8)continue;
    protectedRects.push({x:Math.max(0,r.left),y:Math.max(0,r.top),w:Math.min(innerWidth,r.right)-Math.max(0,r.left),h:Math.min(innerHeight,r.bottom)-Math.max(0,r.top)});
  }
  // Protect panel/card outlines, but NOT their empty interiors.
  // This stops a popup from straddling a statistics card or page section.
  const panels='header,nav,aside,main,section,article,[role="navigation"],[role="main"],[class*="card" i],[class*="panel" i],[class*="statistic" i]';
  let panelCount=0;
  for(const el of document.querySelectorAll(panels)){
    if(panelCount++>3500)break;
    const r=el.getBoundingClientRect(),sty=getComputedStyle(el);
    if(sty.display==='none'||sty.visibility==='hidden'||r.width<120||r.height<48||r.right<=0||r.bottom<=0||r.left>=innerWidth||r.top>=innerHeight)continue;
    const x=Math.max(0,r.left),y=Math.max(0,r.top),w=Math.min(innerWidth,r.right)-x,h=Math.min(innerHeight,r.bottom)-y;
    if(w<=0||h<=0)continue;
    if(el.matches('header,nav,aside,[role="navigation"]')&&w*h<innerWidth*innerHeight*.6){
      protectedRects.push({x,y,w,h});continue;
    }
    const thickness=3;
    protectedRects.push({x,y,w,h:thickness},{x,y:y+h-thickness,w,h:thickness});
    protectedRects.push({x,y,w:thickness,h},{x:x+w-thickness,y,w:thickness,h});
  }
  state.protectedRects=protectedRects;
  state.active=true;observer();return {message:'Recording started. Interact with popups, then Stop & Save PNG.'};
 }
 async function exportPNG(){
  if(!state.base)throw Error('No capture session.');
  if(!window.SmartCaptureLayout)throw Error('Layout engine missing. Reload extension and tab.');
  const b=state.base,img=await load(b.image),sx=b.width/b.viewportWidth,sy=b.height/b.viewportHeight;
  const obstacles=state.protectedRects.filter(r=>r.w>0&&r.h>0).map(r=>({x:r.x*sx,y:r.y*sy,w:r.w*sx,h:r.h*sy}));
  const result=window.SmartCaptureLayout.compute({items:state.items,obstacles,image:img,width:b.width,height:b.height,scale:sx});
  const canvas=document.createElement('canvas');canvas.width=b.width;canvas.height=result.height;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#f7f7fc';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0);
  // All connectors are painted BEFORE the popup pixels. Original popup text remains intact.
  result.routes.forEach((points,i)=>{
    if(!points||points.length<2)return;
    ctx.strokeStyle='#078a9f';ctx.lineWidth=Math.max(1.4,sx*1.7);ctx.lineJoin='round';ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
    for(const p of points.slice(1))ctx.lineTo(p.x,p.y);
    ctx.stroke();ctx.fillStyle='#078a9f';ctx.beginPath();ctx.arc(points[0].x,points[0].y,Math.max(2,sx*2),0,Math.PI*2);ctx.fill();
  });
  for(let i=0;i<state.items.length;i++){
    const item=state.items[i],pos=result.positions[i],overlay=await load(item.image);
    ctx.fillStyle='#fff';ctx.fillRect(pos.x,pos.y,pos.w,pos.h);
    ctx.drawImage(overlay,pos.x+2,pos.y+2); // native pixels; no resizing
    ctx.strokeStyle='#078a9f';ctx.lineWidth=Math.max(1,sx);ctx.strokeRect(pos.x+.5,pos.y+.5,pos.w-1,pos.h-1);
  }
  const link=document.createElement('a');link.download='SmartCapture-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png';
  link.href=canvas.toDataURL('image/png');document.documentElement.append(link);link.click();link.remove();
  return {message:'Saved '+state.items.length+' popups with global placement and obstacle-aware connectors.'};
 }
 async function stop(){state.active=false;clearTimeout(state.timer);state.observing?.disconnect();while(state.busy)await sleep(50);return exportPNG();}
 chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
  const action=msg?.type==='STATUS'?Promise.resolve({active:state.active,count:state.items.length}):msg?.type==='START'?start():msg?.type==='STOP'?stop():Promise.reject(Error('Unknown command'));
  action.then(sendResponse).catch(e=>sendResponse({error:e.message}));return true;
 });
})();