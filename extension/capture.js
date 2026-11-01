'use strict';
(() => {
 if(window.__smartCaptureV123)return;
 window.__smartCaptureV123=true;
 const state={active:false,base:null,items:[],observing:null,protectedRects:[],tracker:null,shotQueue:Promise.resolve(),lastShot:0,events:new Map(),claims:new Map(),dynamicPopups:new Set(),lastFloatingScan:0,activeHoverId:null,baselineTimer:null,errors:[],sourceIds:new WeakMap(),nextSourceId:0,debug:{hoverEvents:0,hoverShots:0,hoverSaved:0,rejections:{'not-stable':0,clipped:0},stages:{noCandidate:0,staleHover:0,wrongOwner:0,invalidCrop:0}}};
 const rect=r=>({x:r.x,y:r.y,width:r.width,height:r.height});
 const sleep=t=>new Promise(r=>setTimeout(r,t));
 const visible=el=>{if(!(el instanceof Element))return false;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>75&&r.height>35&&r.width<innerWidth*.85&&r.height<innerHeight*.94&&r.top>=-2&&r.left>=-2&&r.bottom<=innerHeight+2&&r.right<=innerWidth+2&&s.visibility!=='hidden'&&s.display!=='none'&&+s.opacity!==0;};
 const textOf=el=>(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
 const normalize=s=>s.toLowerCase().replace(/\s+/g,' ').trim();
 async function shot(){const r=await chrome.runtime.sendMessage({type:'SCREENSHOT'});if(!r?.image)throw Error(r?.error||'Cannot capture tab');return r.image;}
 const load=src=>new Promise((ok,bad)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=()=>bad(Error('Image decoding failed'));im.src=src;});
 const popupSelector='[role="dialog"],[role="tooltip"],[role="menu"],[role="listbox"],[aria-modal="true"],[class*="popover" i],[class*="popup" i],[class*="dropdown" i],[class*="tooltip" i],[class*="overlay" i],[class*="floating" i]';
 function popupElements(){
   const found=new Set(document.querySelectorAll(popupSelector));
   for(const el of state.dynamicPopups){
     if(!el.isConnected){state.dynamicPopups.delete(el);continue;}
     found.add(el);
   }
   return [...found].filter(visible);
 }
 function scanFloatingFallback(force=false){
   // Framework-independent fallback for CSS-only hover panels: they may toggle
   // :hover visibility without DOM mutations or conventional tooltip class names.
   if(!force&&Date.now()-state.lastFloatingScan<300)return;
   state.lastFloatingScan=Date.now();
   const helper=window.SmartCaptureHover,view={width:innerWidth,height:innerHeight};
   let count=0;
   for(const el of document.querySelectorAll('body *')){
     if(++count>6500)break; // bounded work on large applications
     const box=el.getBoundingClientRect();
     if(box.width<75||box.height<28||box.width>innerWidth*.87||box.height>innerHeight*.96)continue;
     const style=getComputedStyle(el);
     if(!['absolute','fixed'].includes(style.position)&&!(Number.parseInt(style.zIndex,10)>1))continue;
     if(!helper.floating(el,()=>style,view))continue;
     const text=textOf(el);
     if(text.length<6||text.length>4500)continue;
     state.dynamicPopups.add(el);
   }
 }
 function effectiveOpacity(el){
   let opacity=1;
   for(let n=el;n instanceof Element;n=n.parentElement){
     const s=getComputedStyle(n);opacity*=Number(s.opacity||1);
     if(s.visibility==='hidden'||s.display==='none')return 0;
   }
   return opacity;
 }
 function pick(info){
   const pool=popupElements(),a=info.anchor,association=window.SmartCaptureAssociation;
   if(!association)return null;
   let winner=null,best=-Infinity;
   for(const el of pool){
     if(el===info.target||el.contains(info.target))continue;
     const r=el.getBoundingClientRect(),label=textOf(el);
     if(label.length<6||label.length>4500)continue;
     // Multiple pending interactions may observe one newly opened popup.
     // Only the most plausible ORIGINAL trigger may claim that popup.
     const owner=association.ownerFor(el,label,[info]);
     if(owner?.id!==info.id)continue;
     const signature=association.signature(el,label);
     const claimed=state.claims.get(signature);
     if(claimed&&claimed!==info.id)continue;
     const style=getComputedStyle(el),classes=String(el.className||'');
     const hinted=/popover|popup|tooltip|dropdown|dialog|menu|overlay|floating/i.test(classes)||el.hasAttribute('role');
     const layer=['absolute','fixed','sticky'].includes(style.position)||parseInt(style.zIndex,10)>1;
     if(!hinted&&!layer)continue;
     const dx=Math.max(0,r.left-(a.x+a.width),a.x-r.right);
     const dy=Math.max(0,r.top-(a.y+a.height),a.y-r.bottom);
     const score=(hinted?200:0)+(layer?80:0)-Math.hypot(dx,dy)*1.5-r.width*r.height/12000;
     if(score>best){best=score;winner=el;}
   }
   return best>-420?winner:null;
 }
 async function waitStable(el){
   // Typical CSS fades finish within ~150ms. Avoid the previous 850ms wait
   // that let a user move away before the screenshot was finally taken.
   let previous='';
   for(let attempt=0;attempt<6;attempt++){
     if(!el.isConnected||!visible(el))return false;
     const r=el.getBoundingClientRect();
     const signature=[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height),normalize(textOf(el))].join('|');
     if(effectiveOpacity(el)>.97&&previous===signature)return true;
     previous=signature;await sleep(48);
   }
   return false;
 }
 function minReadableFont(el) {
   let smallest=Infinity,checked=0;
   for(const node of [el,...el.querySelectorAll('*')]){
     if(++checked>150)break;
     if(!node.textContent?.trim())continue;
     const style=getComputedStyle(node),font=Number.parseFloat(style.fontSize);
     if(font>=8&&font<smallest)smallest=font;
   }
   return Number.isFinite(smallest)?smallest:12;
 }
 function cropPopup(image,element,info,kind){
   const surface=window.SmartCaptureSurface;
   if(!surface||!element?.isConnected||!visible(element))return false;
   // Accept transparent portal wrappers ONLY if they contain a complete,
   // independently opaque popup panel. Never crop the transparent wrapper.
   const resolved=surface.resolveOpaque(element,getComputedStyle,{width:innerWidth,height:innerHeight});
   if(!resolved.element){
     state.debug.rejections[resolved.reason]=(state.debug.rejections[resolved.reason]||0)+1;
     return false;
   }
   const panel=resolved.element;
   if(!panel.isConnected||effectiveOpacity(panel)<.98){
     state.debug.rejections['not-stable']++;
     return false;
   }
   const bounds=panel.getBoundingClientRect();
   const scale=window.SmartCaptureGeometry.scaleFor(image.naturalWidth,innerWidth);
   const imageBox=window.SmartCaptureGeometry.rectInImage(bounds,scale,image.naturalWidth,image.naturalHeight);
   if(!imageBox||imageBox.width<55||imageBox.height<22){
     state.debug.rejections['clipped']++;
     return false;
   }
   const {x,y,width:w,height:h}=imageBox;
   const content=normalize(textOf(panel));
   if(content.length<5)return false;
   const key='source:'+info.id+'|content:'+content;
   if(state.items.some(item=>item.key===key))return true;
   const identity=window.SmartCaptureAssociation.signature(panel,content);
   const claimed=state.claims.get(identity);
   if(claimed&&claimed!==info.id)return false;
   const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
   canvas.getContext('2d').drawImage(image,x,y,w,h,0,0,w,h);
   state.claims.set(identity,info.id);
   state.items.push({
     key,kind,sourceId:info.id,label:info.label,anchor:info.anchor,
     image:canvas.toDataURL('image/png'),width:w,height:h,
     minFontPx:minReadableFont(panel)
   });
   return true;
 }
 async function visualCapture(info){
   if(!state.active||!state.baseDecoded||!window.SmartCaptureVisualDiff||
      !window.SmartCaptureSurface)return false;
   if(info.method==='hover'&&(!info.target.matches(':hover')||
       state.activeHoverId!==info.id||state.events.get(info.id)!==info)){
     state.debug.stages.staleHover++;return false;
   }
   // Never capture the guessed image-difference rectangle itself.
   // Only a visually matched, opaque DOM surface may be used as a screenshot crop.
   const job=async()=>{
     const elapsed=Date.now()-state.lastShot;
     if(elapsed<530)await sleep(530-elapsed);
     if(!state.active||state.activeHoverId!==info.id||
         state.events.get(info.id)!==info||!info.target.matches(':hover')){
       state.debug.stages.staleHover++;return false;
     }
     let data;
     try{data=await shot();}catch(e){state.errors.push('hover screenshot: '+e.message);return false;}
     state.lastShot=Date.now();state.debug.hoverShots++;
     const image=await load(data);
     const changed=window.SmartCaptureVisualDiff.fromImages(
       state.baseDecoded,image,info.anchor,{width:state.base.viewportWidth,height:state.base.viewportHeight});
     if(!changed)return false;
     const scale=window.SmartCaptureGeometry.scaleFor(image.naturalWidth,innerWidth);
     const region={x:changed.x/scale,y:changed.y/scale,
       width:changed.width/scale,height:changed.height/scale};
     const match=window.SmartCaptureSurface.identifyOnPage(
       region,info.anchor,{width:innerWidth,height:innerHeight},document,getComputedStyle);
     if(!match){state.debug.stages.noCandidate++;return false;}
     if(window.SmartCaptureAssociation.ownerFor(match.element,textOf(match.element),[info])?.id!==info.id){
       state.debug.stages.wrongOwner++;return false;
     }
     const saved=cropPopup(image,match.element,info,'hover');
     if(!saved)state.debug.stages.invalidCrop++;
     if(saved)state.debug.hoverSaved++;
     return saved;
   };
   const queued=state.shotQueue.catch(()=>{}).then(job);
   state.shotQueue=queued.catch(e=>state.errors.push('hover job: '+String(e?.message||e)));
   return queued;
 }
 async function captureTrigger(info){
   if(!state.active)return false;
   if(info.method==='hover'&&(state.activeHoverId!==info.id||
       !info.target?.matches(':hover')||state.events.get(info.id)!==info)){
     state.debug.stages.staleHover++;return false;
   }
   // A real popup element is the primary source of truth. Capture it while
   // still visible; screenshot differencing is a fallback, not the first step.
   let el=pick(info);
   if(!el){scanFloatingFallback();el=pick(info);}
   if(el&&await waitStable(el)&&state.active&&
      window.SmartCaptureAssociation.ownerFor(el,textOf(el),state.events.values())?.id===info.id){
     const job=async()=>{
       const elapsed=Date.now()-state.lastShot;
       if(elapsed<530)await sleep(530-elapsed);
       if(!state.active||!el.isConnected||!visible(el)||effectiveOpacity(el)<.98)return false;
       if(info.method==='hover'&&(state.activeHoverId!==info.id||
           state.events.get(info.id)!==info||!info.target.matches(':hover'))){
         state.debug.stages.staleHover++;return false;
       }
       let data;
       try{data=await shot();}catch(e){state.errors.push('DOM capture: '+e.message);return false;}
       state.lastShot=Date.now();
       if(!el.isConnected||!visible(el))return false;
       const image=await load(data);
       return cropPopup(image,el,info,info.method==='hover'?'hover':'click');
     };
     const queued=state.shotQueue.catch(()=>{}).then(job);
     state.shotQueue=queued.catch(e=>state.errors.push('DOM job: '+String(e?.message||e)));
     if(await queued)return true;
   } else if(!el)state.debug.stages.noCandidate++;
   return info.method==='hover'?visualCapture(info):false;
 }
 function sourceFrom(target,method){
   if(!(target instanceof Element))return null;
   let source=(method==='hover'?window.SmartCaptureHover?.hoverSource(target,getComputedStyle,{width:innerWidth,height:innerHeight}):null)
     ||target.closest('button,a,[role="button"],[aria-haspopup],[aria-expanded],input,[tabindex]');
   if(!source){
     for(let el=target,n=0;el&&n<4;el=el.parentElement,n++){
       const style=getComputedStyle(el);
       if(style.cursor==='pointer'||el.hasAttribute('onclick')){source=el;break;}
     }
   }
   source||=target;
   const r=source.getBoundingClientRect();
   if(r.width<4||r.height<4||r.width>innerWidth*.65||r.height>innerHeight*.6)return null;
   const label=normalize(textOf(source)||source.getAttribute('aria-label')||source.getAttribute('title')||'interactive element').slice(0,100);
   return {source,anchor:rect(r),label};
 }
 function refreshIdleBaseline(){
   if(state.baselineTimer!==null)clearTimeout(state.baselineTimer);
   state.baselineTimer=setTimeout(()=>{
     state.baselineTimer=null;
     if(!state.active||state.activeHoverId!==null)return;
     // When a tooltip closes on pointer leave, it must no longer count as
     // already visible for the NEXT hover. CSS :hover changes may not mutate DOM.
     state.baselineVisible=new Map(popupElements().map(el=>[el,normalize(textOf(el))]));
   },45);
 }
 function observeTrigger(target,method){
   if(!state.active)return;
   const src=sourceFrom(target,method);if(!src)return;
   if(popupElements().some(el=>el.contains(src.source)))return; // popup controls are not new source links
   if(method==='hover'&&!window.SmartCaptureAssociation?.hoverEligible(src.source))return;
   const a=src.anchor;
   if(!state.sourceIds.has(src.source))state.sourceIds.set(src.source,++state.nextSourceId);
   const id=String(state.sourceIds.get(src.source));
   const existing=state.events.get(id);
   // One real pointer entry per source. SVG descendants are not new hovers.
   if(existing&&method==='hover'&&state.activeHoverId===id&&src.source.matches(':hover'))return;
   if(existing&&method==='focus'&&state.activeHoverId===id)return;
   if(existing&&Date.now()-existing.clickedAt<800)return;
   if(method==='hover'){
     if(state.baselineTimer!==null){clearTimeout(state.baselineTimer);state.baselineTimer=null;}
     state.debug.hoverEvents++;state.activeHoverId=id;
   }
   const visibleBefore=method==='hover' ? new Map(state.baselineVisible||[]) : new Map(popupElements().map(el=>[el,normalize(textOf(el))]));
   const info={id,anchor:a,label:src.label,target:src.source,method,timestamp:Date.now(),
     visibleBefore,clickedAt:method==='click'?Date.now():(existing?.clickedAt||0)};
   state.events.set(id,info);
   state.tracker?.note(info);
 }
 document.addEventListener('pointerdown',e=>{
   if(!state.active)return;
   observeTrigger(e.target,'click');
   // The outgoing popup's capture may still be in flight; its own timer is not cancelled.
 },true);
 document.addEventListener('pointerover',e=>{
   if(!state.active)return;
   const icon=window.SmartCaptureHover?.hoverSource(e.target,getComputedStyle,{width:innerWidth,height:innerHeight});
   if(!icon){refreshIdleBaseline();return;}
   if(popupElements().some(el=>el.contains(icon)))return;
   // Moving between SVG children is not a new interaction.
   if(e.relatedTarget instanceof Node&&icon.contains(e.relatedTarget))return;
   observeTrigger(icon,'hover');
 },true);
 document.addEventListener('pointerout',e=>{
   if(!state.active)return;
   if(!state.activeHoverId){refreshIdleBaseline();return;}
   const info=state.events.get(state.activeHoverId);
   if(!info?.target||!(info.target===e.target||info.target.contains(e.target)))return;
   if(e.relatedTarget instanceof Node&&info.target.contains(e.relatedTarget))return;
   state.activeHoverId=null;
   refreshIdleBaseline();
 },true);
 document.addEventListener('focusin',e=>{if(state.active)observeTrigger(e.target,'focus');},true);
 function observer(){
   let last=0;
   state.observing=new MutationObserver(records=>{
     if(!state.active||!state.tracker)return;
     const helper=window.SmartCaptureHover,view={width:innerWidth,height:innerHeight};
     // Discover floating panels based on DOM changes, not CSS framework names.
     for(const record of records){
       const nodes=[record.target,...record.addedNodes];
       for(const n of nodes){
         const floating=helper?.floatingAncestor(n,getComputedStyle,view);
         if(floating)state.dynamicPopups.add(floating);
       }
     }
     const now=Date.now();if(now-last<100)return;last=now;
     // Only retry the control that is CURRENTLY hovered. Do not relaunch
     // screenshots for every old mouseover whenever the page mutates.
     const id=state.activeHoverId,info=state.events.get(id);
     if(id&&info?.target?.matches(':hover'))state.tracker.retryPending(id);
   });
   state.observing.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','aria-expanded','aria-hidden']});
 }
 async function start(){
  state.active=false;state.observing?.disconnect();state.tracker?.reset();
  if(state.baselineTimer!==null){clearTimeout(state.baselineTimer);state.baselineTimer=null;}
  state.layoutDiagnostics=null;state.items=[];state.events.clear();state.claims.clear();state.dynamicPopups.clear();state.errors=[];state.sourceIds=new WeakMap();state.nextSourceId=0;state.activeHoverId=null;
  state.debug={hoverEvents:0,hoverShots:0,hoverSaved:0,rejections:{'not-stable':0,clipped:0},stages:{noCandidate:0,staleHover:0,wrongOwner:0,invalidCrop:0}};state.shotQueue=Promise.resolve();state.lastShot=0;
  if(!window.SmartCaptureTracker||!window.SmartCaptureAssociation||!window.SmartCaptureHover||!window.SmartCaptureVisualDiff||!window.SmartCaptureSurface||!window.SmartCaptureGeometry)throw Error('Capture modules missing. Reload extension.');
  await sleep(150);const image=await shot();const im=await load(image);
  state.base={image,width:im.naturalWidth,height:im.naturalHeight,viewportWidth:innerWidth,viewportHeight:innerHeight};
  state.baseDecoded=im;state.lastShot=Date.now();
  scanFloatingFallback(true); // establish baseline before any new hover or click
  state.baselineVisible=new Map(popupElements().map(el=>[el,normalize(textOf(el))]));
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
  state.routeRects=protectedRects.slice(); // Connectors may cross card borders, not text/controls.
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
  state.tracker=window.SmartCaptureTracker.create({
    capture:captureTrigger,delay:110,
    canAttempt:info=>{
      if(!state.active)return false;
      if(info.method==='hover')
        return state.activeHoverId===info.id&&info.target?.isConnected&&info.target.matches(':hover');
      return Date.now()-info.timestamp<1600;
    }
  });
  state.active=true;observer();return {message:'Recording started. Interact with popups, then Stop & Save PNG.'};
 }
 async function exportPNG(){
  if(!state.base)throw Error('No capture session.');
  if(!window.SmartCaptureLayout)throw Error('Layout engine missing. Reload extension and tab.');
  const b=state.base,img=await load(b.image),sx=window.SmartCaptureGeometry.scaleFor(b.width,b.viewportWidth),sy=sx;
  const obstacles=state.protectedRects.filter(r=>r.w>0&&r.h>0).map(r=>({x:r.x*sx,y:r.y*sy,w:r.w*sx,h:r.h*sy}));
  const routeObstacles=(state.routeRects||state.protectedRects).filter(r=>r.w>0&&r.h>0).map(r=>({x:r.x*sx,y:r.y*sy,w:r.w*sx,h:r.h*sy}));
  const result=window.SmartCaptureLayout.compute({items:state.items,obstacles,routeObstacles,image:img,width:b.width,height:b.height,scale:sx});
  state.layoutDiagnostics=result.positions.map((p,i)=>({x:p.x,y:p.y,width:p.w,height:p.h,renderScale:p.renderScale||1,source:state.items[i].anchor}));
  const canvas=document.createElement('canvas');canvas.width=b.width;canvas.height=result.height;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#f7f7fc';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0);
  const colors=['#067b99','#8153b2','#a35a19','#228158','#b34577'];
  // Outline the source link, never paint a filled label over its text.
  for(let i=0;i<state.items.length;i++){
    const a=state.items[i].anchor,col=colors[i%colors.length];
    ctx.strokeStyle=col;ctx.lineWidth=Math.max(1.2,sx*1.4);
    ctx.strokeRect(a.x*sx-2,a.y*sy-2,a.width*sx+4,a.height*sy+4);
  }
  // Connectors are routed around protected text. Impossible routes are omitted.
  // Distinct source/popup outlines remain to preserve the association.
  result.routes.forEach((points,i)=>{
    if(!points||points.length<2)return;
    ctx.strokeStyle=colors[i%colors.length];ctx.lineWidth=Math.max(1.3,sx*1.7);ctx.lineJoin='round';ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
    for(const p of points.slice(1))ctx.lineTo(p.x,p.y);
    ctx.stroke();
  });
  // Paint popup imagery last, so no line can pass over captured text.
  for(let i=0;i<state.items.length;i++){
    const item=state.items[i],pos=result.positions[i],overlay=await load(item.image);
    ctx.fillStyle='#fff';ctx.fillRect(pos.x,pos.y,pos.w,pos.h);
    const renderScale=pos.renderScale||1;
    if(renderScale!==1){ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';}
    ctx.drawImage(overlay,pos.x+2,pos.y+2,item.width*renderScale,item.height*renderScale);
    ctx.strokeStyle=colors[i%colors.length];ctx.lineWidth=Math.max(1.2,sx*1.5);
    ctx.strokeRect(pos.x+.5,pos.y+.5,pos.w-1,pos.h-1);
  }
  const link=document.createElement('a');link.download='SmartCapture-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png';
  link.href=canvas.toDataURL('image/png');document.documentElement.append(link);link.click();link.remove();
  return {message:'Saved '+state.items.length+' popups safely ('+(result.unrouted||0)+' links marked by matching outlines instead of unsafe lines).'};
 }
 async function stop(){
   if(!state.active)throw Error('No active capture.');
   state.observing?.disconnect();
   if(state.baselineTimer!==null){clearTimeout(state.baselineTimer);state.baselineTimer=null;}
   const results=await state.tracker.flush();
   state.active=false;
   // Never silently download a normal screenshot and call it a successful
   // SmartCapture when every requested interaction was rejected.
   if(!state.items.length){
     const rejects=Object.entries(state.debug.rejections).filter(([,n])=>n>0);
     return {message:'No popups captured — PNG not saved. Detected '+results.seen+
       ' interactions; '+state.debug.hoverEvents+' hover events, '+
       state.debug.hoverShots+' hover screenshots. '+
       (rejects.length?'Rejected surfaces: '+rejects.map(([reason,n])=>reason+' '+n).join(', ')+'. ':'')+
       (state.errors.length?'Screenshot errors: '+state.errors.length+'. ':'')+
       'Stages: '+JSON.stringify(state.debug.stages)+'.'};
   }
   const output=await exportPNG();
   output.message+=' Captured '+results.captured+' of '+results.seen+' detected interactions.';
   if(results.pending)output.message+=' '+results.pending+' did not produce a stable popup.';
   output.message+=' Hover diagnostics: '+state.debug.hoverEvents+' events, '+state.debug.hoverShots+' screenshots, '+state.debug.hoverSaved+' visually saved.';
   const rejected=Object.entries(state.debug.rejections).filter(([,count])=>count>0);
   if(rejected.length)output.message+=' Skipped: '+rejected.map(([reason,count])=>reason+' '+count).join(', ')+'.';
   if(!state.items.length)output.message+=' No valid popup was recorded. Please report the hover diagnostics.';
   if(state.errors.length)output.message+=' '+state.errors.length+' screenshot/capture error(s).';
   output.message+=' Stages: '+JSON.stringify(state.debug.stages)+'.';
   return output;
 }
 chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
  const action=msg?.type==='STATUS'?Promise.resolve({version:'0.12.3',active:state.active,count:state.items.length,detected:state.tracker?.stats().seen||0,hoverShots:state.debug.hoverShots,hoverSaved:state.debug.hoverSaved,rejections:state.debug.rejections}):msg?.type==='METRICS'?Promise.resolve({items:state.items.map(i=>({kind:i.kind,width:i.width,height:i.height,anchor:i.anchor,minFontPx:i.minFontPx})),layout:state.layoutDiagnostics||null}):msg?.type==='START'?start():msg?.type==='STOP'?stop():Promise.reject(Error('Unknown command'));
  action.then(sendResponse).catch(e=>sendResponse({error:e.message}));return true;
 });
})();