'use strict';
/* Detect a real DOM surface corresponding to a visually new region.
 * Bounding boxes always come from DOM; visual differences NEVER define the crop.
 * Pure geometry functions are exposed for regression tests. */
(() => {
  const overlap=(a,b)=>{
    const x=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x));
    const y=Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
    return x*y;
  };
  const area=r=>Math.max(0,r.width)*Math.max(0,r.height);
  const norm=s=>String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
  const transparent=color=>{
    if(!color||color==='transparent')return true;
    const match=color.match(/^rgba?\((.+)\)$/i);
    if(!match)return false;
    const parts=match[1].replaceAll(',',' ').replace(/\//g,' ').split(/\s+/).filter(Boolean);
    return parts.length>=4&&Number(parts[3])<.98;
  };
  function rank(candidate,region,viewport,source){
    if(!candidate||!candidate.rect)return -Infinity;
    const r=candidate.rect,s=candidate.style||{},words=norm(candidate.text);
    if(r.width<65||r.height<27||r.width>viewport.width*.75||r.height>viewport.height*.92)return -Infinity;
    if(r.x<0||r.y<0||r.x+r.width>viewport.width+3||r.y+r.height>viewport.height+3)return -Infinity;
    if(words.length<5||words.length>5000)return -Infinity;
    if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity||1)<.96)return -Infinity;
    const filled=!transparent(s.backgroundColor);
    const bordered=s.boxShadow&&s.boxShadow!=='none'||s.borderTopStyle&&s.borderTopStyle!=='none';
    const positioning=s.position==='absolute'||s.position==='fixed'||Number(s.zIndex)>1;
    const semantic=/dialog|menu|tooltip|popover|popup|listbox/i.test((candidate.role||'')+' '+(candidate.className||''));
    if(!filled&&!bordered&&!positioning&&!semantic)return -Infinity;
    const intersection=overlap(r,region),coverage=intersection/Math.max(1,area(region));
    const precision=intersection/Math.max(1,area(r));
    // The screenshot-diff rectangle may be wider than the actual box.
    // But at least most changed pixels should be within the DOM candidate.
    if(coverage<.46||precision<.18)return -Infinity;
    const sx=Math.max(0,r.x-(source.x+source.width),source.x-(r.x+r.width));
    const sy=Math.max(0,r.y-(source.y+source.height),source.y-(r.y+r.height));
    const dist=Math.hypot(sx,sy);
    return coverage*120+precision*28+(filled?40:0)+(bordered?25:0)+(positioning?25:0)+(semantic?25:0)-dist*.12-Math.log2(area(r))*1.7;
  }
  function identify(region,source,viewport,elements,styleOf){
    if(!region||!elements?.length)return null;
    const seen=new Set(),candidates=[];
    for(const element of elements){
      for(let n=element,depth=0;n&&depth<9;n=n.parentElement,depth++){
        if(seen.has(n))continue;seen.add(n);
        const r=n.getBoundingClientRect?.();if(!r)continue;
        const style=styleOf(n);
        const candidate={
          rect:{x:r.left??r.x,y:r.top??r.y,width:r.width,height:r.height},
          style,text:n.innerText||n.textContent||'',
          role:n.getAttribute?.('role'),
          className:String(n.getAttribute?.('class')||'')
        };
        const score=rank(candidate,region,viewport,source);
        if(Number.isFinite(score))candidates.push({element:n,score,rect:candidate.rect});
      }
    }
    candidates.sort((a,b)=>b.score-a.score);
    return candidates[0]||null;
  }
  function identifyOnPage(region,source,viewport,doc,styleOf){
    if(!doc?.elementsFromPoint)return null;
    const pts=[
      [.50,.50],[.25,.35],[.75,.35],[.25,.70],[.75,.70]
    ];
    const elements=[];
    for(const [fx,fy] of pts){
      const x=Math.max(0,Math.min(viewport.width-1,region.x+region.width*fx));
      const y=Math.max(0,Math.min(viewport.height-1,region.y+region.height*fy));
      elements.push(...doc.elementsFromPoint(x,y).slice(0,12));
    }
    return identify(region,source,viewport,elements,styleOf);
  }

  function resolveOpaque(element,styleOf,viewport){
    if(!element?.getBoundingClientRect)return {element:null,reason:'invalid-element'};
    const outer=element.getBoundingClientRect();
    const original=norm(element.innerText||element.textContent||'');
    const candidates=[element];
    // Popovers often use a transparent portal shell surrounding the white panel.
    // Descend only into that shell; do not expand into parent page cards.
    if(element.querySelectorAll){
      for(const n of Array.from(element.querySelectorAll('*')).slice(0,180))candidates.push(n);
    }
    const valid=[];
    for(const node of candidates){
      const rect=node.getBoundingClientRect?.(),style=styleOf(node);
      if(!rect||!style)continue;
      if(transparent(style.backgroundColor)||Number(style.opacity||1)<.98||
         style.visibility==='hidden'||style.display==='none')continue;
      const r={x:rect.left??rect.x,y:rect.top??rect.y,width:rect.width,height:rect.height};
      if(r.width<60||r.height<25||r.x<-1||r.y<-1||
         r.x+r.width>viewport.width+2||r.y+r.height>viewport.height+2)continue;
      // The selected opaque surface must contain the great majority of visible
      // popup text and controls. Otherwise it is a label, not a complete panel.
      const text=norm(node.innerText||node.textContent||'');
      if(text.length<5)continue;
      const retention=original?text.length/original.length:0;
      if(node!==element&&retention<.80)continue;
      if(node!==element&&(r.width>outer.width*1.1||r.height>outer.height*1.1))continue;
      // Opaque children win over a transparent wrapper; prefer the smallest
      // complete container, avoiding unrelated page labels in the crop.
      valid.push({element:node,rect:r,score:retention*1000-Math.log2(area(r))*5});
    }
    valid.sort((a,b)=>b.score-a.score);
    if(!valid.length)return {element:null,reason:'no-opaque-complete-surface'};
    return {element:valid[0].element,rect:valid[0].rect,reason:null};
  }

  window.SmartCaptureSurface={identify,identifyOnPage,rank,overlap,resolveOpaque,opaqueColor:color=>!transparent(color)};
})();