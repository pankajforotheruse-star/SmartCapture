'use strict';
(() => {
 if(window.__smartCaptureV2)return;
 window.__smartCaptureV2=true;
 const state={active:false,base:null,items:[],anchor:null,pending:null,observing:null,busy:false,lastCapture:0};
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
 async function record(){
  if(!state.active||state.busy||!state.anchor)return;
  const anchor={...state.anchor};const el=pick(anchor.rect);if(!el)return;
  const content=normalize(textOf(el));
  const key=[anchor.label,Math.round(anchor.rect.x/12),Math.round(anchor.rect.y/12),content].join('|');
  if(state.items.some(it=>it.key===key))return;
  if(Date.now()-state.lastCapture<300)return;
  state.busy=true;
  try{
   const r=el.getBoundingClientRect(),image=await load(await shot());
   // Use intrinsic screenshot pixels (not CSS pixels) to avoid resampling blur.
   const sx=image.naturalWidth/innerWidth,sy=image.naturalHeight/innerHeight;
   const x=Math.max(0,Math.round(r.left*sx)),y=Math.max(0,Math.round(r.top*sy));
   const w=Math.min(image.naturalWidth-x,Math.round(r.width*sx)),h=Math.min(image.naturalHeight-y,Math.round(r.height*sy));
   if(w<20||h<20)return;
   const c=document.createElement('canvas');c.width=w;c.height=h;
   c.getContext('2d').drawImage(image,x,y,w,h,0,0,w,h);
   if(!state.items.some(it=>it.key===key))state.items.push({key,label:anchor.label,anchor:anchor.rect,image:c.toDataURL('image/png'),width:w,height:h});
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
 document.addEventListener('pointerdown',e=>{if(!state.active)return;anchorFrom(e.target);schedule(e.target,340);},true);
 document.addEventListener('pointerover',e=>{if(!state.active)return;const t=e.target;if(t?.closest?.('button,a,[role="button"],[aria-haspopup],[title],[aria-label]')){anchorFrom(t);schedule(t,550);}else if(state.anchor)schedule(t,380);},true);
 document.addEventListener('focusin',e=>{if(state.active){anchorFrom(e.target);schedule(e.target,350);}},true);
 function observer(){state.observing=new MutationObserver(()=>{if(state.active&&state.anchor&&Date.now()-state.lastCapture>550)schedule(state.pending?.target||document.activeElement,420);});state.observing.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','aria-expanded','aria-hidden']});}
 async function start(){
  state.active=false;clearTimeout(state.timer);state.observing?.disconnect();
  state.items=[];state.anchor=null;state.pending=null;state.busy=false;
  await sleep(150);const image=await shot();const im=await load(image);
  state.base={image,width:im.naturalWidth,height:im.naturalHeight,viewportWidth:innerWidth,viewportHeight:innerHeight};
  state.active=true;observer();return {message:'Recording started. Interact with popups, then Stop & Save PNG.'};
 }
 async function exportPNG(){
  const base=state.base;if(!base)throw Error('No capture session.');
  const img=await load(base.image);const ratio=base.width/base.viewportWidth;
  const gutter=24*ratio,left=base.width+gutter,slotWidth=Math.max(310*ratio,...state.items.map(i=>i.width))+32*ratio;
  let y=24*ratio;const slots=state.items.map(i=>{const slot={x:left+12*ratio,y,width:i.width,height:i.height};y+=i.height+46*ratio;return slot;});
  const width=state.items.length?Math.ceil(left+slotWidth):base.width;
  const height=Math.max(base.height,Math.ceil(y+20*ratio));
  const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');
  ctx.fillStyle='#f7f7fc';ctx.fillRect(0,0,width,height);ctx.drawImage(img,0,0);
  if(state.items.length){ctx.fillStyle='#e7f1f5';ctx.fillRect(base.width,0,width-base.width,height);}
  for(let i=0;i<state.items.length;i++){
   const it=state.items[i],p=slots[i],im=await load(it.image),ax=(it.anchor.x+it.anchor.width/2)*ratio,ay=(it.anchor.y+it.anchor.height/2)*ratio,ex=p.x,ey=p.y+Math.min(p.height/2,24*ratio);
   // Connector is drawn across the new margin, not through the original page content.
   ctx.strokeStyle='#008da5';ctx.lineWidth=2.5*ratio;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(base.width+8*ratio,ay);ctx.lineTo(base.width+8*ratio,ey);ctx.lineTo(ex,ey);ctx.stroke();
   ctx.fillStyle='#008da5';ctx.beginPath();ctx.arc(ax,ay,3*ratio,0,Math.PI*2);ctx.fill();
   ctx.fillStyle='white';ctx.fillRect(p.x-3*ratio,p.y-3*ratio,p.width+6*ratio,p.height+6*ratio);
   ctx.drawImage(im,p.x,p.y);ctx.strokeStyle='#008da5';ctx.lineWidth=2*ratio;ctx.strokeRect(p.x-2*ratio,p.y-2*ratio,p.width+4*ratio,p.height+4*ratio);
   ctx.font=`${12*ratio}px Arial`;ctx.fillStyle='#16475a';ctx.fillText((it.label||'Captured popup').slice(0,55),p.x,p.y-8*ratio);
  }
  const url=c.toDataURL('image/png');const a=document.createElement('a');a.href=url;a.download='SmartCapture-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png';document.documentElement.append(a);a.click();a.remove();
  return {message:`Saved screenshot containing ${state.items.length} unique popup(s).`};
 }
 async function stop(){state.active=false;clearTimeout(state.timer);state.observing?.disconnect();while(state.busy)await sleep(50);return exportPNG();}
 chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
  const action=msg?.type==='STATUS'?Promise.resolve({active:state.active,count:state.items.length}):msg?.type==='START'?start():msg?.type==='STOP'?stop():Promise.reject(Error('Unknown command'));
  action.then(sendResponse).catch(e=>sendResponse({error:e.message}));return true;
 });
})();