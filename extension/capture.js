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
  // Collect actual content bounds BEFORE popups are opened; white cards are not whitespace.
  const selector='header,nav,aside,main,section,article,[role="navigation"],[role="main"],button,a,input,table,[class*="card" i],[class*="panel" i]';
  state.protectedRects=[];
  for(const el of document.querySelectorAll(selector)){
    if(!(el instanceof Element))continue;
    const r=el.getBoundingClientRect(),sty=getComputedStyle(el);
    if(r.width<12||r.height<8||r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth||sty.display==='none'||sty.visibility==='hidden')continue;
    if(r.width>innerWidth*.96&&r.height>innerHeight*.88)continue;
    state.protectedRects.push({x:Math.max(0,r.x),y:Math.max(0,r.y),w:Math.min(innerWidth,r.right)-Math.max(0,r.x),h:Math.min(innerHeight,r.bottom)-Math.max(0,r.y)});
  }
  state.active=true;observer();return {message:'Recording started. Interact with popups, then Stop & Save PNG.'};
 }
 async function exportPNG(){
  const base=state.base;if(!base)throw Error('No capture session.');
  const img=await load(base.image),sx=base.width/base.viewportWidth,sy=base.height/base.viewportHeight,W=base.width,H=base.height;
  // Identify empty regions using both baseline DOM occupied rectangles and image detail.
  const probe=document.createElement('canvas'),factor=5;
  probe.width=Math.ceil(W/factor);probe.height=Math.ceil(H/factor);
  const pc=probe.getContext('2d',{willReadFrequently:true});pc.drawImage(img,0,0,probe.width,probe.height);
  const pw=probe.width,ph=probe.height,pixels=pc.getImageData(0,0,pw,ph).data;
  function intersects(a,b,pad=0){return a.x<b.x+b.w+pad&&a.x+a.w+pad>b.x&&a.y<b.y+b.h+pad&&a.y+a.h+pad>b.y;}
  const protectedZones=state.protectedRects.filter(r=>r.w>0&&r.h>0).map(r=>({x:r.x*sx,y:r.y*sy,w:r.w*sx,h:r.h*sy}));
  // Integral image of color/edge variation; prevents mistaking text-heavy white cards for blank space.
  const stride=pw+1,integral=new Float64Array((pw+1)*(ph+1));
  for(let y=0;y<ph;y++){let row=0;for(let x=0;x<pw;x++){
    const i=(y*pw+x)*4,up=((Math.max(0,y-1))*pw+x)*4,left=(y*pw+Math.max(0,x-1))*4;
    const dx=Math.abs(pixels[i]-pixels[left])+Math.abs(pixels[i+1]-pixels[left+1])+Math.abs(pixels[i+2]-pixels[left+2]);
    const dy=Math.abs(pixels[i]-pixels[up])+Math.abs(pixels[i+1]-pixels[up+1])+Math.abs(pixels[i+2]-pixels[up+2]);
    const saturation=Math.max(pixels[i],pixels[i+1],pixels[i+2])-Math.min(pixels[i],pixels[i+1],pixels[i+2]);
    row+= (dx+dy>40||saturation>30)?1:0;
    integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+row;
  }}
  function ink(p){
    const x1=Math.max(0,Math.floor(p.x/factor)),y1=Math.max(0,Math.floor(p.y/factor));
    const x2=Math.min(pw,Math.ceil((p.x+p.w)/factor)),y2=Math.min(ph,Math.ceil((p.y+p.h)/factor));
    if(x2<=x1||y2<=y1)return 1;
    return (integral[y2*stride+x2]-integral[y1*stride+x2]-integral[y2*stride+x1]+integral[y1*stride+x1])/((x2-x1)*(y2-y1));
  }
  const gap=Math.round(12*sx),margin=Math.round(12*sx),reserved=[],placements=[];
  // Start candidate search nearest each individual trigger, never at a predetermined popup position.
  for(const item of state.items){
    const w=item.width+4,h=item.height+4;
    const source={x:(item.anchor.x+item.anchor.width/2)*sx,y:(item.anchor.y+item.anchor.height/2)*sy};
    let best=null;
    for(let y=margin;y+h<=H-margin;y+=Math.max(8,Math.round(12*sy))){
      for(let x=margin;x+w<=W-margin;x+=Math.max(8,Math.round(12*sx))){
        const p={x,y,w,h};
        if(reserved.some(r=>intersects(p,r,gap)))continue;
        if(protectedZones.some(r=>intersects(p,r,Math.round(4*sx))))continue;
        const detail=ink(p);
        if(detail>.014)continue; // reject text, borders, icons and active content
        const distance=Math.hypot(x+w/2-source.x,y+h/2-source.y);
        const score=distance+detail*10000;
        if(!best||score<best.score)best={...p,score};
      }
    }
    if(!best){ // No suitable whitespace: preserve source content and extend canvas below.
      const y=Math.max(H+margin,...reserved.filter(r=>r.y>=H).map(r=>r.y+r.h+gap),H+margin);
      best={x:Math.max(margin,Math.min(W-w-margin,source.x-w/2)),y,w,h,extended:true};
    }
    placements.push(best);reserved.push(best);
  }
  const height=Math.max(H,...placements.map(p=>p.y+p.h+margin),H);
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=Math.ceil(height);
  const ctx=canvas.getContext('2d');ctx.fillStyle='#f7f7fc';ctx.fillRect(0,0,W,height);ctx.drawImage(img,0,0);
  // Render connectors first, then popup cards ON TOP. Connector strokes can never cover popup text.
  for(let i=0;i<placements.length;i++){
    const p=placements[i],item=state.items[i],source={x:(item.anchor.x+item.anchor.width/2)*sx,y:(item.anchor.y+item.anchor.height/2)*sy};
    const edge={x:Math.max(p.x,Math.min(p.x+p.w,source.x)),y:Math.max(p.y,Math.min(p.y+p.h,source.y))};
    // Route from the actual source to the closest popup edge, without entering the popup rectangle.
    const mid={x:source.x,y:(source.y+edge.y)/2};
    ctx.strokeStyle='#078a9f';ctx.lineWidth=Math.max(1.2,1.8*sx);ctx.lineJoin='round';
    ctx.beginPath();ctx.moveTo(source.x,source.y);ctx.lineTo(mid.x,mid.y);ctx.lineTo(edge.x,mid.y);ctx.lineTo(edge.x,edge.y);ctx.stroke();
    ctx.fillStyle='#078a9f';ctx.beginPath();ctx.arc(source.x,source.y,Math.max(2,2*sx),0,Math.PI*2);ctx.fill();
  }
  for(let i=0;i<placements.length;i++){
    const p=placements[i],item=state.items[i],overlay=await load(item.image);
    ctx.fillStyle='#fff';ctx.fillRect(p.x,p.y,p.w,p.h);
    // Exactly one intrinsic image pixel per output pixel; do not scale the captured popup.
    ctx.drawImage(overlay,p.x+2,p.y+2);
    ctx.strokeStyle='#078a9f';ctx.lineWidth=Math.max(1,1.2*sx);ctx.strokeRect(p.x+.5,p.y+.5,p.w-1,p.h-1);
  }
  const link=document.createElement('a');link.href=canvas.toDataURL('image/png');link.download='SmartCapture-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png';
  document.documentElement.appendChild(link);link.click();link.remove();
  return {message:'Saved '+state.items.length+' popups in nearest safe whitespace.'};
 }
 async function stop(){state.active=false;clearTimeout(state.timer);state.observing?.disconnect();while(state.busy)await sleep(50);return exportPNG();}
 chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
  const action=msg?.type==='STATUS'?Promise.resolve({active:state.active,count:state.items.length}):msg?.type==='START'?start():msg?.type==='STOP'?stop():Promise.reject(Error('Unknown command'));
  action.then(sendResponse).catch(e=>sendResponse({error:e.message}));return true;
 });
})();