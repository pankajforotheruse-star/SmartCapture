'use strict';
/* Visual fallback for hover-only overlays. Works with CSS-only and DOM-driven popups.
   No customer-specific strings, IDs, coordinates or CSS frameworks. */
(() => {
  const clamp=(n,a,b)=>Math.max(a,Math.min(n,b));
  function detect(before,after,width,height,anchor){
    if(!before||!after||before.length!==after.length||before.length!==width*height*4)return null;
    const tile=8,cols=Math.ceil(width/tile),rows=Math.ceil(height/tile),changes=new Uint16Array(cols*rows);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=(y*width+x)*4;
      const delta=Math.abs(before[i]-after[i])+Math.abs(before[i+1]-after[i+1])+Math.abs(before[i+2]-after[i+2]);
      if(delta>=68)changes[Math.floor(y/tile)*cols+Math.floor(x/tile)]++;
    }
    // Pixel differences from tooltip text may be separated by whitespace.
    // Dilate tiles in a temporary grid and group them before extracting bounds.
    const marked=new Uint8Array(cols*rows);
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
      if(changes[y*cols+x]<3)continue;
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
        const xx=x+dx,yy=y+dy;
        if(xx>=0&&yy>=0&&xx<cols&&yy<rows)marked[yy*cols+xx]=1;
      }
    }
    const visited=new Uint8Array(cols*rows),neighbors=[[1,0],[-1,0],[0,1],[0,-1]];
    const results=[];
    for(let cy=0;cy<rows;cy++)for(let cx=0;cx<cols;cx++){
      const first=cy*cols+cx;if(!marked[first]||visited[first])continue;
      const pending=[first];visited[first]=1;let head=0;
      let left=cols,top=rows,right=0,bottom=0,total=0;
      while(head<pending.length){
        const index=pending[head++],x=index%cols,y=Math.floor(index/cols);
        left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
        total+=changes[index];
        for(const [dx,dy] of neighbors){
          const xx=x+dx,yy=y+dy;
          if(xx<0||yy<0||xx>=cols||yy>=rows)continue;
          const k=yy*cols+xx;if(!marked[k]||visited[k])continue;
          visited[k]=1;pending.push(k);
        }
      }
      const x=clamp(left*tile-5,0,width),y=clamp(top*tile-5,0,height);
      const w=Math.min(width-x,(right-left+1)*tile+10),h=Math.min(height-y,(bottom-top+1)*tile+10);
      if(w<70||h<34||total<90||w*h>width*height*.22)continue;
      const dx=Math.max(0,x-(anchor.x+anchor.width),anchor.x-(x+w));
      const dy=Math.max(0,y-(anchor.y+anchor.height),anchor.y-(y+h));
      const distance=Math.hypot(dx,dy),radius=Math.max(380,Math.min(750,Math.max(w,h)*2));
      if(distance>radius)continue;
      results.push({x,y,width:w,height:h,score:total/Math.sqrt(w*h)-distance*.012,total});
    }
    results.sort((a,b)=>b.score-a.score);
    return results[0]||null;
  }
  function fromImages(base,after,anchor,viewport){
    if(base.naturalWidth!==after.naturalWidth||base.naturalHeight!==after.naturalHeight)return null;
    const w=base.naturalWidth,h=base.naturalHeight;
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(base,0,0);const first=ctx.getImageData(0,0,w,h).data;
    ctx.clearRect(0,0,w,h);ctx.drawImage(after,0,0);
    const second=ctx.getImageData(0,0,w,h).data;
    const sx=w/viewport.width,sy=h/viewport.height;
    return detect(first,second,w,h,{
      x:anchor.x*sx,y:anchor.y*sy,width:anchor.width*sx,height:anchor.height*sy
    });
  }
  window.SmartCaptureVisualDiff={detect,fromImages};
})();