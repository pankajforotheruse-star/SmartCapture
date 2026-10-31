'use strict';
/* SmartCapture layout engine v0.5: no network, no dependencies. */
(() => {
 const overlap=(a,b,p=0)=>a.x<b.x+b.w+p&&a.x+a.w+p>b.x&&a.y<b.y+b.h+p&&a.y+a.h+p>b.y;
 const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const center=r=>({x:r.x+r.w/2,y:r.y+r.h/2});
 const clamp=(x,l,h)=>Math.max(l,Math.min(h,x));
 function densityMap(image,w,h){
  const c=document.createElement('canvas'),step=6;c.width=Math.ceil(w/step);c.height=Math.ceil(h/step);
  const context=c.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,c.width,c.height);
  const {data}=context.getImageData(0,0,c.width,c.height),iw=c.width,ih=c.height;
  const integral=new Float64Array((iw+1)*(ih+1));
  for(let y=0;y<ih;y++){let row=0;for(let x=0;x<iw;x++){
   const k=(y*iw+x)*4,kl=(y*iw+Math.max(x-1,0))*4,ku=(Math.max(y-1,0)*iw+x)*4;
   const delta=[0,1,2].reduce((t,z)=>t+Math.abs(data[k+z]-data[kl+z])+Math.abs(data[k+z]-data[ku+z]),0);
   row+=delta>44?1:0;integral[(y+1)*(iw+1)+x+1]=integral[y*(iw+1)+x+1]+row;
  }}
  return r=>{
   const x1=clamp(Math.floor(r.x/step),0,iw),x2=clamp(Math.ceil((r.x+r.w)/step),0,iw);
   const y1=clamp(Math.floor(r.y/step),0,ih),y2=clamp(Math.ceil((r.y+r.h)/step),0,ih);
   if(x1>=x2||y1>=y2)return 1;
   return (integral[y2*(iw+1)+x2]-integral[y1*(iw+1)+x2]-integral[y2*(iw+1)+x1]+integral[y1*(iw+1)+x1])/((x2-x1)*(y2-y1));
  };
 }
 function candidates(item,obstacles,ink,W,H,scale){
  const a=center(item.anchor),w=item.width+4,h=item.height+4,pad=Math.max(5,4*scale),step=Math.max(10,Math.round(14*scale));
  const result=[];
  // Coarse dynamic grid; refine around the best coarse locations.
  function test(x,y){
   const r={x,y,w,h};
   if(x<8||y<8||x+w>W-8||y+h>H-8)return;
   if(obstacles.some(o=>overlap(r,o,pad)))return;
   const noise=ink(r);if(noise>.025)return;
   const d=dist(a,center(r));
   result.push({...r,cost:d+noise*16000+Math.max(0,y-a.y)*.025});
  }
  for(let y=10;y+h<=H-10;y+=step)for(let x=10;x+w<=W-10;x+=step)test(x,y);
  result.sort((a,b)=>a.cost-b.cost);
  const short=result.slice(0,22);
  for(const p of short)for(const dy of [-step/2,0,step/2])for(const dx of [-step/2,0,step/2])test(Math.round(p.x+dx),Math.round(p.y+dy));
  result.sort((a,b)=>a.cost-b.cost);
  const unique=[];for(const r of result){if(unique.every(v=>Math.abs(v.x-r.x)+Math.abs(v.y-r.y)>step))unique.push(r);if(unique.length>=18)break;}
  return unique;
 }
 function route(start,end,obstacles,W,H,scale,soft=false){
  // A* on a coarse grid with obstacle inflation, then orthogonalize and simplify.
  const unit=Math.max(8,Math.round(12*scale)),nx=Math.ceil(W/unit)+1,ny=Math.ceil(H/unit)+1;
  const point=(x,y)=>({x:clamp(Math.round(x/unit),0,nx-1),y:clamp(Math.round(y/unit),0,ny-1)});
  const a=point(start.x,start.y),b=point(end.x,end.y),key=(x,y)=>y*nx+x;
  const blocked=new Uint8Array(nx*ny);
  for(const o of obstacles){
   const x1=clamp(Math.floor((o.x-3*scale)/unit),0,nx-1),x2=clamp(Math.ceil((o.x+o.w+3*scale)/unit),0,nx-1);
   const y1=clamp(Math.floor((o.y-3*scale)/unit),0,ny-1),y2=clamp(Math.ceil((o.y+o.h+3*scale)/unit),0,ny-1);
   for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++)blocked[key(x,y)]=1;
  }
  // Endpoint cells must remain accessible; anchored controls themselves can be occupied.
  blocked[key(a.x,a.y)]=0;blocked[key(b.x,b.y)]=0;
  const queue=[{x:a.x,y:a.y,g:0,f:Math.abs(a.x-b.x)+Math.abs(a.y-b.y),direction:-1}];
  const costs=new Float64Array(nx*ny).fill(Infinity),previous=new Int32Array(nx*ny).fill(-1),turns=new Int8Array(nx*ny).fill(-1);
  costs[key(a.x,a.y)]=0;let reached=false,iterations=0;
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  while(queue.length&&iterations++<nx*ny*5){
   queue.sort((u,v)=>v.f-u.f);const cur=queue.pop(),k=key(cur.x,cur.y);
   if(cur.g>costs[k]+.0001)continue;
   if(cur.x===b.x&&cur.y===b.y){reached=true;break;}
   for(let d=0;d<4;d++){
    const x=cur.x+dirs[d][0],y=cur.y+dirs[d][1];if(x<0||y<0||x>=nx||y>=ny)continue;
    const next=key(x,y);if(blocked[next]&&!soft)continue;
    const g=cur.g+1+(blocked[next]?75:0)+(cur.direction>=0&&cur.direction!==d?.35:0);
    if(g>=costs[next])continue;
    costs[next]=g;previous[next]=k;turns[next]=d;
    queue.push({x,y,g,f:g+Math.abs(x-b.x)+Math.abs(y-b.y),direction:d});
   }
  }
  if(!reached)return null;
  const nodes=[];let at=key(b.x,b.y);while(at>=0){nodes.push({x:(at%nx)*unit,y:Math.floor(at/nx)*unit});if(at===key(a.x,a.y))break;at=previous[at];}
  nodes.reverse();const reduced=[start];
  for(let i=1;i<nodes.length-1;i++){
   const p=nodes[i-1],q=nodes[i],r=nodes[i+1];if((p.x===q.x&&q.x===r.x)||(p.y===q.y&&q.y===r.y))continue;reduced.push(q);
  }
  reduced.push(end);
  // Add an orthogonal entry/exit where possible. Never draw a diagonal over page text.
  return reduced;
 }
 function compute({items,obstacles,image,width,height,scale=1}){
  const W=width,H=height,ink=densityMap(image,W,H);
  const popupItems=items.map(i=>({...i,anchor:{x:i.anchor.x*scale,y:i.anchor.y*scale,w:i.anchor.width*scale,h:i.anchor.height*scale}}));
  const options=popupItems.map(it=>candidates(it,obstacles,ink,W,H,scale));
  // Global beam search: solve all popup positions jointly, not in click order.
  let beam=[{positions:[],cost:0}];
  for(let i=0;i<items.length;i++){
   const choices=options[i],next=[];
   for(const previous of beam)for(const pos of choices){
    if(previous.positions.some(p=>overlap(pos,p,12*scale)))continue;
    next.push({positions:[...previous.positions,pos],cost:previous.cost+pos.cost});
   }
   next.sort((a,b)=>a.cost-b.cost);beam=next.slice(0,80);
   if(!beam.length)break;
  }
  let positions=beam.length?beam[0].positions:[];
  // Conservative fallback: never overwrite page data; extend downwards when necessary.
  if(positions.length!==items.length){
   positions=[];let below=H+16*scale;
   for(let i=0;i<items.length;i++){
    const it=popupItems[i],cand=options[i].find(p=>positions.every(q=>!overlap(p,q,12*scale)));
    if(cand){positions.push(cand);continue;}
    const w=it.width+4,h=it.height+4;
    const x=clamp(center(it.anchor).x-w/2,12,W-w-12);
    positions.push({x,y:below,w,h});below+=h+18*scale;
   }
  }
  const routes=positions.map((pos,i)=>{
   const a=center(popupItems[i].anchor);
   const sides=[{x:pos.x,y:pos.y+pos.h/2},{x:pos.x+pos.w,y:pos.y+pos.h/2},{x:pos.x+pos.w/2,y:pos.y},{x:pos.x+pos.w/2,y:pos.y+pos.h}];
   const blocks=[...obstacles.filter(o=>!overlap(o,popupItems[i].anchor,2)),...positions];
   let best=null;
   for(const edge of sides){
    const routeObstacles=blocks.filter(o=>o!==pos);
    const routeHeight=Math.max(H,...positions.map(p=>p.y+p.h))+24*scale;
    const path=route(a,edge,routeObstacles,W,routeHeight,scale)||route(a,edge,routeObstacles,W,routeHeight,scale,true);
    if(path){const length=path.slice(1).reduce((sum,p,j)=>sum+dist(p,path[j]),0);if(!best||length<best.length)best={path,length};}
   }
   return best?.path||null;
  });
  return {positions,routes,height:Math.ceil(Math.max(H,...positions.map(p=>p.y+p.h+12*scale)))};
 }
 window.SmartCaptureLayout={compute,overlap};
})();