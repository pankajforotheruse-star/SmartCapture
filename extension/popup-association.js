'use strict';
/* Popup-to-trigger ownership. Intentionally independent of page-specific selectors/text. */
(() => {
  const norm=s=>String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
  const gap=(a,b)=>{
    const dx=Math.max(0,b.x-(a.x+a.width),a.x-(b.x+b.width));
    const dy=Math.max(0,b.y-(a.y+a.height),a.y-(b.y+b.height));
    return Math.hypot(dx,dy);
  };
  function explicitRelation(source,popup) {
    const id=popup.id;
    if(!id||!source?.getAttribute)return false;
    for(const name of ['aria-controls','aria-owns','aria-describedby','aria-details']) {
      const ids=(source.getAttribute(name)||'').split(/\s+/);
      if(ids.includes(id))return true;
    }
    return false;
  }
  function hoverEligible(element) {
    if(!element?.getAttribute)return false;
    // Ordinary hyperlinks should not be treated as popup triggers just because the
    // pointer passed over them. Links can opt in through ARIA and tooltip markers.
    const tag=element.tagName?.toLowerCase();
    if(tag!=='a')return true;
    return ['aria-haspopup','aria-controls','aria-describedby','aria-expanded','aria-details',
      'data-tooltip','data-popover','data-tippy-content','data-bs-toggle'].some(k=>element.hasAttribute(k));
  }
  function changedSince(info,popup,text) {
    if(!info.visibleBefore)return false;
    const previous=info.visibleBefore.get(popup);
    return previous===undefined||previous!==norm(text);
  }
  function ownerFor(popup,text,events,now=Date.now()) {
    if(!popup?.getBoundingClientRect)return null;
    const box=popup.getBoundingClientRect();
    let result=null,highest=-Infinity;
    for(const info of events) {
      if(!info?.id||!info.anchor||!changedSince(info,popup,text))continue;
      const age=Math.max(0,now-(info.timestamp||0));
      const method=info.method||'click';
      const lifetime=method==='hover'?2500:method==='focus'?2000:6000;
      if(age>lifetime)continue;
      if(method==='hover'&&!hoverEligible(info.target))continue;
      const related=explicitRelation(info.target,popup);
      const distance=gap(info.anchor,box);
      // Avoid associating completely unrelated distant overlays. ARIA linking overrides distance.
      const radius=Math.max(360,Math.min(850,Math.max(box.width,box.height)*2));
      if(!related&&distance>radius)continue;
      // Recency matters more than a historical click: a newly hovered icon
      // should own the tooltip it just revealed, even after an earlier click.
      const score=(related?10000:0)+(method==='click'?145:method==='focus'?105:120)
        +Math.max(0,1200-age)*.75-distance*.85;
      if(score>highest){highest=score;result=info;}
    }
    return result;
  }
  function signature(popup,text){
    const r=popup.getBoundingClientRect();
    // Deduplicate identical content of a single menu at the same visual location,
    // regardless of how many unrelated interactions were pending.
    return [norm(text),Math.round(r.x/18),Math.round(r.y/18),
      Math.round(r.width/18),Math.round(r.height/18)].join('|');
  }
  window.SmartCaptureAssociation={ownerFor,hoverEligible,changedSince,signature,gap};
})();