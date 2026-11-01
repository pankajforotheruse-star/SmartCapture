'use strict';
/* Safety-first layout engine, v0.6. Strict non-overlap: no forced placement on content. */
(() => {
  const overlap=(a,b,p=0)=>a.x<b.x+b.w+p&&a.x+a.w+p>b.x&&a.y<b.y+b.h+p&&a.y+a.h+p>b.y;
  const clamp=(v,a,b)=>Math.max(a,Math.min(v,b));
  const center=r=>({x:r.x+r.w/2,y:r.y+r.h/2});
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  function occupancy(image,width,height,obstacles,scale,inkLimit=231) {
    const cell=Math.max(3,Math.round(4*scale)),cols=Math.ceil(width/cell),rows=Math.ceil(height/cell);
    const c=document.createElement('canvas');c.width=cols;c.height=rows;
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,cols,rows);
    const raw=ctx.getImageData(0,0,cols,rows).data;
    const blocked=new Uint8Array(cols*rows),visual=new Uint8Array(cols*rows);
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
      const i=y*cols+x,j=4*i,r=raw[j],g=raw[j+1],b=raw[j+2];
      const contrast=Math.max(r,g,b)-Math.min(r,g,b);
      // Conservative dark/color ink detector; light card surfaces remain available.
      visual[i]=(Math.min(r,g,b)<inkLimit||contrast>45)?1:0;
    }
    const padding=Math.ceil(7*scale/cell);
    for(const r of obstacles){
      const x1=clamp(Math.floor(r.x/cell)-padding,0,cols-1),x2=clamp(Math.ceil((r.x+r.w)/cell)+padding,0,cols-1);
      const y1=clamp(Math.floor(r.y/cell)-padding,0,rows-1),y2=clamp(Math.ceil((r.y+r.h)/cell)+padding,0,rows-1);
      for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++)blocked[y*cols+x]=1;
    }
    // Dilate visual details so neither borders nor antialiased text get touched.
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)if(visual[y*cols+x]){
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const xx=x+dx,yy=y+dy;
        if(xx>=0&&yy>=0&&xx<cols&&yy<rows)blocked[yy*cols+xx]=1;
      }
    }
    const stride=cols+1,sum=new Uint32Array((cols+1)*(rows+1));
    for(let y=0;y<rows;y++){let line=0;for(let x=0;x<cols;x++){line+=blocked[y*cols+x];sum[(y+1)*stride+x+1]=sum[y*stride+x+1]+line;}}
    function count(r){
      const x1=clamp(Math.floor(r.x/cell),0,cols),x2=clamp(Math.ceil((r.x+r.w)/cell),0,cols);
      const y1=clamp(Math.floor(r.y/cell),0,rows),y2=clamp(Math.ceil((r.y+r.h)/cell),0,rows);
      return sum[y2*stride+x2]-sum[y1*stride+x2]-sum[y2*stride+x1]+sum[y1*stride+x1];
    }
    return {count,blocked,cols,rows,cell};
  }
  function candidates(item,occ,width,height,scale){
    const w=item.width+4,h=item.height+4;
    const origin=item.anchor,step=Math.max(7,Math.round(10*scale)),gap=Math.round(10*scale);
    const found=[];
    // A popup may cross the bottom edge if MOST of it occupies genuinely blank space.
    // This avoids moving a 470px product list below the entire viewport when only
    // a few additional pixels are needed. Never extend sideways or over content.
    const minInside=Math.min(h,Math.max(70*scale,Math.min(h*.4,130*scale)));
    const lastY=Math.max(gap,height-minInside);
    for(let y=gap;y<=lastY;y+=step)for(let x=gap;x+w<width-gap;x+=step){
      const r={x,y,w,h};
      if(occ.count(r)>0)continue; // hard exclusion for the part over original screenshot
      const addedHeight=Math.max(0,y+h+gap-height);
      const extensionCost=addedHeight>0?65*scale+addedHeight*2.5:0;
      // Measure distance between the actual popup and source rectangles, rather
      // than their centers. A popup beside a tag should beat one far below it.
      const dx=Math.max(0,r.x-(origin.x+origin.w),origin.x-(r.x+r.w));
      const dy=Math.max(0,r.y-(origin.y+origin.h),origin.y-(r.y+r.h));
      const edgeDistance=Math.hypot(dx,dy);
      const alignment=Math.abs((r.y+r.h/2)-(origin.y+origin.h/2))*.03;
      found.push({...r,cost:edgeDistance+alignment+extensionCost,addedHeight});
    }
    found.sort((a,b)=>a.cost-b.cost);
    const best=[];
    for(const r of found){
      if(best.some(p=>Math.abs(p.x-r.x)<step&&Math.abs(p.y-r.y)<step))continue;
      best.push(r);if(best.length===180)break;
    }
    return best;
  }
  function layoutAll(items,options,width,height,scale){
    // Joint search; every candidate has already passed the original-page safety check.
    let beam=[{positions:[],cost:0}];
    for(let i=0;i<items.length;i++){
      const next=[];
      for(const entry of beam)for(const p of options[i]){
        if(entry.positions.some(q=>overlap(p,q,Math.round(12*scale))))continue;
        next.push({positions:[...entry.positions,p],cost:entry.cost+p.cost});
      }
      next.sort((a,b)=>a.cost-b.cost);beam=next.slice(0,96);
      if(!beam.length)break;
    }
    if(beam.length&&beam[0].positions.length===items.length)return beam[0].positions;
    // If all-in-page combination is unavailable, keep individually safe placements.
    // Prefer larger popups first, so narrow/short ones fill remaining gaps.
    const chosen=new Array(items.length),order=items.map((_,i)=>i).sort((a,b)=>
      (items[b].width*items[b].height)-(items[a].width*items[a].height));
    let below=height+Math.round(18*scale);
    for(const i of order){
      const p=options[i].find(candidate=>chosen.every(q=>!q||!overlap(candidate,q,12*scale)));
      if(p){chosen[i]=p;continue;}
      const w=items[i].width+4,h=items[i].height+4;
      const x=clamp(center(items[i].anchor).x-w/2,12,Math.max(12,width-w-12));
      chosen[i]={x,y:below,w,h,extended:true};below+=h+Math.round(18*scale);
    }
    return chosen;
  }
  function route(start,end,base,extra,height){
    const cell=Math.max(8,base.cell*3),nx=Math.ceil(base.cols*base.cell/cell),ny=Math.ceil(height/cell);
    const locate=(p)=>({x:clamp(Math.floor(p.x/cell),0,nx-1),y:clamp(Math.floor(p.y/cell),0,ny-1)});
    const a=locate(start),b=locate(end),index=(x,y)=>y*nx+x;
    const forbidden=new Uint8Array(nx*ny);
    // Any occupied subcell blocks a routing cell; original text remains protected.
    for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
      const xy={x:x*cell,y:y*cell,w:cell,h:cell};
      if(y*cell<base.rows*base.cell&&base.count(xy)>0)forbidden[index(x,y)]=1;
      if(extra.some(p=>overlap(xy,p,0)))forbidden[index(x,y)]=1;
    }
    // Allow escaping the originating button's bounding box and entering popup edge.
    for(let y=Math.max(0,a.y-1);y<=Math.min(ny-1,a.y+1);y++)
      for(let x=Math.max(0,a.x-1);x<=Math.min(nx-1,a.x+1);x++)forbidden[index(x,y)]=0;
    forbidden[index(b.x,b.y)]=0;
    const costs=new Float64Array(nx*ny).fill(Infinity),parent=new Int32Array(nx*ny).fill(-1);
    const heuristic=(x,y)=>Math.abs(x-b.x)+Math.abs(y-b.y);
    const queue=[{x:a.x,y:a.y,g:0,f:heuristic(a.x,a.y)}];costs[index(a.x,a.y)]=0;
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    let found=false,iterations=0;
    while(queue.length&&iterations++<nx*ny*5){
      queue.sort((u,v)=>v.f-u.f);const cur=queue.pop(),id=index(cur.x,cur.y);
      if(cur.g!==costs[id])continue;
      if(cur.x===b.x&&cur.y===b.y){found=true;break;}
      for(const [dx,dy] of dirs){
        const x=cur.x+dx,y=cur.y+dy;if(x<0||y<0||x>=nx||y>=ny||forbidden[index(x,y)])continue;
        const k=index(x,y),g=cur.g+1;if(g>=costs[k])continue;
        costs[k]=g;parent[k]=id;queue.push({x,y,g,f:g+heuristic(x,y)});
      }
    }
    if(!found)return null; // Do not draw damaging fallback connectors through page text.
    let at=index(b.x,b.y);const nodes=[];
    while(at>=0){nodes.push({x:(at%nx+.5)*cell,y:(Math.floor(at/nx)+.5)*cell});if(at===index(a.x,a.y))break;at=parent[at];}
    nodes.reverse();
    const routePoints=[start];
    if(nodes.length){
      // Orthogonal entry/exit to actual control and popup coordinates.
      routePoints.push({x:start.x,y:nodes[0].y},nodes[0]);
      for(let i=1;i<nodes.length-1;i++){
        const p=nodes[i-1],q=nodes[i],r=nodes[i+1];
        if((p.x===q.x&&q.x===r.x)||(p.y===q.y&&q.y===r.y))continue;
        routePoints.push(q);
      }
      routePoints.push(nodes.at(-1),{x:end.x,y:nodes.at(-1).y});
    }
    routePoints.push(end);return routePoints;
  }
  function compute({items,obstacles,routeObstacles=obstacles,image,width,height,scale=1}){
    if(!items.length)return {positions:[],routes:[],height};
    const converted=items.map(item=>({...item,anchor:{
      x:item.anchor.x*scale,y:item.anchor.y*scale,w:item.anchor.width*scale,h:item.anchor.height*scale
    }}));
    const occ=occupancy(image,width,height,obstacles,scale);
    const lineOcc=occupancy(image,width,height,routeObstacles,scale,175);
    const options=converted.map(item=>{
      const all=[];
      // Preserve full resolution whenever possible. Only shrink modestly when
      // it unlocks a substantially closer safe pocket next to the trigger.
      const scales=item.width>=220*scale&&item.height>=75*scale
        ? [[1,0],[.95,26],[.90,58],[.85,94]]
        : [[1,0]];
      for(const [factor,penalty] of scales){
        const adjusted=factor===1?item:{
          ...item,width:Math.round(item.width*factor),height:Math.round(item.height*factor)
        };
        for(const pos of candidates(adjusted,occ,width,height,scale)){
          all.push({...pos,renderScale:factor,cost:pos.cost+penalty*scale});
        }
      }
      return all.sort((a,b)=>a.cost-b.cost).slice(0,240);
    });
    const positions=layoutAll(converted,options,width,height,scale);
    const resultHeight=Math.ceil(Math.max(height,...positions.map(p=>p.y+p.h+12*scale)));
    const routes=positions.map((p,i)=>{
      const anchor=converted[i].anchor,mid=center(anchor),target=center(p);
      // Start outside the control, never through the link label itself.
      const starts=[
        {x:mid.x,y:anchor.y-3*scale},{x:mid.x,y:anchor.y+anchor.h+3*scale},
        {x:anchor.x-3*scale,y:mid.y},{x:anchor.x+anchor.w+3*scale,y:mid.y}
      ].sort((a,b)=>distance(a,target)-distance(b,target));
      const sides=[{x:p.x+p.w/2,y:p.y},{x:p.x+p.w/2,y:p.y+p.h},{x:p.x,y:p.y+p.h/2},{x:p.x+p.w,y:p.y+p.h/2}];
      let best=null;
      for(const start of starts.slice(0,2))for(const end of sides){
        const blocks=positions.filter((_,j)=>j!==i);
        const path=route(start,end,lineOcc,blocks,resultHeight);
        if(!path)continue;
        const length=path.slice(1).reduce((sum,point,j)=>sum+distance(point,path[j]),0);
        if(!best||length<best.length)best={path,length};
      }
      return best?.path||null;
    });
    return {positions,routes,height:resultHeight,unrouted:routes.filter(r=>!r).length};
  }
  window.SmartCaptureLayout={compute,overlap};
})();