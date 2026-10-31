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
 document.addEventListener('pointerdown',e=>{if(!state.active)return;anchorFrom(e.target);state.clickAnchorUntil=Date.now()+2300;schedule(e.target,340);},true);
 document.addEventListener('pointerover',e=>{if(!state.active)return;const t=e.target;if(t?.closest?.('button,a,[role="button"],[aria-haspopup],[title],[aria-label]')){if(Date.now()>(state.clickAnchorUntil||0))anchorFrom(t);schedule(t,550);}else if(state.anchor)schedule(t,380);},true);
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
  const img=await load(base.image),ratio=base.width/base.viewportWidth,W=base.width,H=base.height;
  const c=document.createElement('canvas');c.width=W;c.height=H;
  const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
  // Sample a downscaled copy of the ORIGINAL screenshot to find unoccupied whitespace.
  const probe=document.createElement('canvas'),pw=Math.max(1,Math.ceil(W/8)),ph=Math.max(1,Math.ceil(H/8));
  probe.width=pw;probe.height=ph;const pc=probe.getContext('2d',{willReadFrequently:true});
  pc.drawImage(img,0,0,pw,ph);const pixels=pc.getImageData(0,0,pw,ph).data;
  function deviation(x,y,w,h){
    const x0=Math.max(1,Math.floor(x*pw/W)),x1=Math.min(pw-1,Math.ceil((x+w)*pw/W));
    const y0=Math.max(1,Math.floor(y*ph/H)),y1=Math.min(ph-1,Math.ceil((y+h)*ph/H));
    if(x0>=x1||y0>=y1)return Infinity;
    // Estimate foreground/ink relative to predominant background color within candidate.
    let sum=[0,0,0],n=0;
    for(let yy=y0;yy<y1;yy+=3)for(let xx=x0;xx<x1;xx+=3){const k=4*(yy*pw+xx);for(let z=0;z<3;z++)sum[z]+=pixels[k+z];n++;}
    const mean=sum.map(v=>v/n);let cost=0,samples=0;
    for(let yy=y0;yy<y1;yy+=2)for(let xx=x0;xx<x1;xx+=2){
      const k=4*(yy*pw+xx),prev=4*(yy*pw+xx-1),above=4*((yy-1)*pw+xx);
      const color=Math.max(...[0,1,2].map(z=>Math.abs(pixels[k+z]-mean[z])));
      const edge=Math.max(...[0,1,2].map(z=>Math.abs(pixels[k+z]-pixels[prev+z])+Math.abs(pixels[k+z]-pixels[above+z])));
      if(color>32||edge>24)cost++;samples++;
    }
    return samples?cost/samples:Infinity;
  }
  const margin=Math.max(12,Math.round(16*ratio)),gap=Math.max(10,Math.round(16*ratio));
  const positions=[],reserved=[];
  // Search inside the existing screenshot. Prefer low-ink regions and nearby anchors.
  for(const item of state.items){
    const w=item.width+6*ratio,h=item.height+6*ratio;
    const a={x:(item.anchor.x+item.anchor.width/2)*ratio,y:(item.anchor.y+item.anchor.height/2)*ratio};
    let best=null;
    for(let y=margin;y+h<H-margin;y+=Math.max(14,Math.round(20*ratio))){
      for(let x=margin;x+w<W-margin;x+=Math.max(14,Math.round(20*ratio))){
        if(reserved.some(b=>x<b.x+b.w+gap&&x+w+gap>b.x&&y<b.y+b.h+gap&&y+h+gap>b.y))continue;
        const ink=deviation(x,y,w,h);
        const distance=Math.hypot(x+w/2-a.x,y+h/2-a.y);
        // A strong penalty for nonempty regions, a gentle preference for proximity.
        const score=ink*24000+distance*.25+(y<Math.min(H*.27,210*ratio)?140:0);
        if(best===null||score<best.score)best={x,y,w,h,score,ink};
      }
    }
    if(!best||best.ink>.09){
      // Do not cover important page content if no reasonably blank slot exists.
      // Expand canvas DOWNWARDS, never rightwards, as a fallback.
      const y=Math.max(H+margin,...reserved.map(b=>b.y+b.h+gap),H+margin);
      best={x:Math.max(margin,Math.min(W-w-margin,a.x-w/2)),y,w,h,ink:0,extended:true};
    }
    positions.push(best);reserved.push(best);
  }
  const outHeight=Math.ceil(Math.max(H,...positions.map(p=>p.y+p.h+margin),H));
  if(outHeight!==H){const old=c.toDataURL('image/png');c.height=outHeight;const oldImg=await load(old);ctx.fillStyle='#f7f7fc';ctx.fillRect(0,0,W,outHeight);ctx.drawImage(oldImg,0,0); }
  // Setting canvas.height resets context state; draw in current full resolution.
  for(let i=0;i<state.items.length;i++){
    const item=state.items[i],p=positions[i],overlay=await load(item.image);
    const a={x:(item.anchor.x+item.anchor.width/2)*ratio,y:(item.anchor.y+item.anchor.height/2)*ratio};
    const ex=Math.max(p.x,Math.min(p.x+p.w,a.x)),ey=Math.max(p.y,Math.min(p.y+p.h,a.y));
    // Connect SOURCE -> popup with an elbow, never reuse another popup's endpoint.
    ctx.strokeStyle='#008da5';ctx.lineWidth=Math.max(2,2.2*ratio);
    ctx.beginPath();ctx.moveTo(a.x,a.y);
    const middleY=a.y+(ey-a.y)*.5;
    ctx.lineTo(a.x,middleY);ctx.lineTo(ex,middleY);ctx.lineTo(ex,ey);ctx.stroke();
    ctx.fillStyle='#008da5';ctx.beginPath();ctx.arc(a.x,a.y,Math.max(3,3*ratio),0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(ex,ey,Math.max(3,3*ratio),0,Math.PI*2);ctx.fill();
    ctx.fillStyle='white';ctx.fillRect(p.x,p.y,p.w,p.h);
    ctx.drawImage(overlay,p.x+3*ratio,p.y+3*ratio,item.width,item.height);
    ctx.strokeStyle='#008da5';ctx.lineWidth=Math.max(1,1.5*ratio);ctx.strokeRect(p.x,p.y,p.w,p.h);
  }
  const a=document.createElement('a');a.download='SmartCapture-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png';a.href=c.toDataURL('image/png');document.documentElement.append(a);a.click();a.remove();
  return {message:'Saved screenshot with '+state.items.length+' anchored popups inside page whitespace.'};
 }
 async function stop(){state.active=false;clearTimeout(state.timer);state.observing?.disconnect();while(state.busy)await sleep(50);return exportPNG();}
 chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
  const action=msg?.type==='STATUS'?Promise.resolve({active:state.active,count:state.items.length}):msg?.type==='START'?start():msg?.type==='STOP'?stop():Promise.reject(Error('Unknown command'));
  action.then(sendResponse).catch(e=>sendResponse({error:e.message}));return true;
 });
})();