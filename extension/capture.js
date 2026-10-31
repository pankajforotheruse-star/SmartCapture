'use strict';
(() => {
  if (window.__smartCaptureLoaded) return;
  window.__smartCaptureLoaded = true;
  const session={base:null,popups:[],anchor:null,hover:null,busy:false};
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const rect=r=>({x:r.x,y:r.y,width:r.width,height:r.height});
  const visible=el=>{
    if(!(el instanceof Element))return false;
    const r=el.getBoundingClientRect(),s=getComputedStyle(el);
    return r.width>=65&&r.height>=30&&r.width<=innerWidth*.95&&r.height<=innerHeight*.95&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0;
  };
  document.addEventListener('pointerdown',e=>{
    if(session.busy)return;
    const el=e.target.closest?.('button,a,[role="button"],[aria-haspopup],input,[tabindex]')||e.target;
    if(!(el instanceof Element))return;
    session.anchor={rect:rect(el.getBoundingClientRect()),text:(el.innerText||el.getAttribute('aria-label')||'').trim().slice(0,80)};
  },true);
  document.addEventListener('pointermove',e=>{session.hover=e.target;},{passive:true,capture:true});
  function candidate(){
    if(!session.anchor)throw Error('Click the popup trigger first.');
    const a=session.anchor.rect;
    const options=new Set(document.querySelectorAll('[role="dialog"],[role="tooltip"],[role="menu"],[role="listbox"],[class*="popover" i],[class*="dropdown" i],[class*="tooltip" i],[aria-modal="true"]'));
    let node=session.hover;
    for(let n=0;n<5&&node instanceof Element;n++,node=node.parentElement)if(visible(node)&&node.children.length>=1)options.add(node);
    let best=null,score=-Infinity;
    for(const el of options){
      if(!visible(el))continue;
      const r=el.getBoundingClientRect(),s=getComputedStyle(el);
      const dx=Math.max(0,r.left-(a.x+a.width),a.x-r.right),dy=Math.max(0,r.top-(a.y+a.height),a.y-r.bottom);
      const distance=Math.hypot(dx,dy),area=r.width*r.height;
      const hint=/popover|tooltip|dropdown|dialog|menu/i.test(String(el.className))||el.hasAttribute('role');
      const layered=['absolute','fixed'].includes(s.position)||Number(s.zIndex)>1;
      const rating=(hint?300:0)+(layered?125:0)-1.4*distance-Math.abs(area-42000)/1000+(el.contains(session.hover)?180:0);
      if(rating>score){score=rating;best=el;}
    }
    if(!best||score< -400)throw Error('No popup detected. Hover over the open popup and try again.');
    return best;
  }
  const load=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Image could not be decoded'));img.src=src;});
  async function shot(){const r=await chrome.runtime.sendMessage({type:'SCREENSHOT'});if(!r?.image)throw Error(r?.error||'Screenshot failed');return r.image;}
  async function start(){
    if(session.busy)throw Error('Capture in progress');session.busy=true;
    try{await wait(180);session.base={image:await shot(),width:innerWidth,height:innerHeight};session.popups=[];return {message:'Base captured. Click a link, hover its popup, then use Alt+Shift+S.'};}
    finally{session.busy=false;}
  }
  async function capture(){
    if(!session.base)throw Error('Capture the base page first.');
    if(session.busy)throw Error('Capture already in progress.');session.busy=true;
    try{
      const el=candidate(),r=el.getBoundingClientRect();
      const box={x:Math.max(0,r.left),y:Math.max(0,r.top)};
      box.width=Math.min(innerWidth,r.right)-box.x;box.height=Math.min(innerHeight,r.bottom)-box.y;
      if(box.width<65||box.height<30)throw Error('Popup is outside the viewport.');
      const img=await load(await shot()),sx=img.naturalWidth/innerWidth,sy=img.naturalHeight/innerHeight;
      const c=document.createElement('canvas');c.width=Math.round(box.width*sx);c.height=Math.round(box.height*sy);
      c.getContext('2d').drawImage(img,box.x*sx,box.y*sy,box.width*sx,box.height*sy,0,0,c.width,c.height);
      session.popups.push({image:c.toDataURL('image/png'),width:box.width,height:box.height,anchor:{...session.anchor.rect},label:session.anchor.text});
      return {message:'Saved popup '+session.popups.length+' from '+(session.anchor.text||'selected control')};
    }finally{session.busy=false;}
  }
  async function exportPNG(){
    if(!session.base)throw Error('Start a capture session first.');
    const base=await load(session.base.image),scale=base.naturalWidth/session.base.width,occupied=[],placed=[];
    let maxX=session.base.width,maxY=session.base.height;
    for(const p of session.popups){
      const a=p.anchor,w=p.width,h=p.height,choices=[];
      for(let ring=0;ring<12;ring++)for(let dir=0;dir<4;dir++){
        const d=ring*42,positions=[
          [a.x,a.y+a.height+28+d],
          [a.x+a.width+28+d,a.y],
          [a.x-w-28-d,a.y+a.height+18],
          [a.x+d,a.y-h-28]
        ];
        const [px,py]=positions[dir],x=Math.max(12,px),y=Math.max(12,py);
        const overlap=occupied.reduce((sum,q)=>sum+Math.max(0,Math.min(q.x+q.w,x+w)-Math.max(q.x,x))*Math.max(0,Math.min(q.y+q.h,y+h)-Math.max(q.y,y)),0);
        const distance=Math.hypot(x-a.x,y-a.y);
        choices.push({x,y,w,h,cost:overlap*15+distance+Math.max(0,x+w-session.base.width)*.3+Math.max(0,y+h-session.base.height)*.3});
      }
      choices.sort((a,b)=>a.cost-b.cost);const pos=choices[0];occupied.push(pos);placed.push(pos);
      maxX=Math.max(maxX,pos.x+w+18);maxY=Math.max(maxY,pos.y+h+18);
    }
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(maxX*scale);canvas.height=Math.ceil(maxY*scale);
    const ctx=canvas.getContext('2d');ctx.setTransform(scale,0,0,scale,0,0);
    ctx.fillStyle='#f7f7fc';ctx.fillRect(0,0,maxX,maxY);ctx.drawImage(base,0,0,session.base.width,session.base.height);
    for(let i=0;i<session.popups.length;i++){
      const p=session.popups[i],q=placed[i],im=await load(p.image);
      const start={x:p.anchor.x+p.anchor.width/2,y:p.anchor.y+p.anchor.height/2};
      const end={x:Math.max(q.x,Math.min(q.x+q.w,start.x)),y:Math.max(q.y,Math.min(q.y+q.h,start.y))};
      ctx.strokeStyle='#008ba6';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(start.x,Math.min(end.y,start.y+28));ctx.lineTo(end.x,end.y);ctx.stroke();
      ctx.fillStyle='#008ba6';ctx.beginPath();ctx.arc(start.x,start.y,4,0,2*Math.PI);ctx.fill();
      ctx.shadowColor='rgba(0,0,0,.2)';ctx.shadowBlur=14;ctx.shadowOffsetY=4;ctx.fillStyle='white';ctx.fillRect(q.x-3,q.y-3,q.w+6,q.h+6);ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetY=0;
      ctx.drawImage(im,q.x,q.y,q.w,q.h);ctx.strokeStyle='#008ba6';ctx.lineWidth=2;ctx.strokeRect(q.x-3,q.y-3,q.w+6,q.h+6);
    }
    const a=document.createElement('a');a.download='SmartCapture-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png';a.href=canvas.toDataURL('image/png');document.documentElement.appendChild(a);a.click();a.remove();
    return {message:'Exported '+session.popups.length+' anchored popup(s).'};
  }
  async function handle(type){
    if(type==='STATUS')return {started:!!session.base,count:session.popups.length};
    if(type==='START')return start();
    if(type==='CAPTURE')return capture();
    if(type==='EXPORT')return exportPNG();
    if(type==='RESET'){session.base=null;session.popups=[];session.anchor=null;return {message:'Capture session reset'};}
    throw Error('Unknown command');
  }
  chrome.runtime.onMessage.addListener((msg,_sender,reply)=>{handle(msg?.type).then(reply).catch(e=>reply({error:e.message}));return true;});
})();