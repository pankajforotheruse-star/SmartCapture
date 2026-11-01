'use strict';
/* Generic hover and floating-layer discovery. Never identifies popups by page-specific text. */
(() => {
  const interactive='button,a,[role="button"],[aria-haspopup],[aria-expanded],[aria-describedby],[title],[data-tooltip],[data-popover]';
  const tags=new Set(['svg','i','img','span','small','label']);
  const marker=/icon|info|help|question|discount|price|hint|tooltip|popover|trigger/i;
  function hoverSource(target,styleOf,viewport){
    if(!target?.closest)return null;
    // Prefer the precise icon under the pointer to a larger parent price label.
    // This prevents "DKK 319.00" from being anchored when its adjacent %
    // information icon is the real hover target.
    const icon=target.closest('svg,i,[role="img"],[data-tooltip],[class*="info-icon" i],[class*="help-icon" i]');
    if(icon){
      // An SVG and its outer 17px icon bubble represent ONE hover source.
      // Use that small interactive wrapper when it exists; never a whole price label.
      const parent=icon.parentElement,outer=parent?.getBoundingClientRect?.();
      const cls=String(parent?.getAttribute?.('class')||'');
      if(outer&&outer.width>=10&&outer.height>=10&&outer.width<=42&&outer.height<=42&&
        (/icon|info|help|tooltip/i.test(cls)||parent?.hasAttribute?.('aria-label')||
          ['pointer','help'].includes(styleOf(parent)?.cursor)))return parent;
      const r=icon.getBoundingClientRect?.();
      if(r&&r.width>=5&&r.height>=5&&r.width<=42&&r.height<=42)return icon;
    }
    const marked=target.closest(interactive);
    if(marked&&marked.tagName?.toLowerCase()==='a'){
      // Preserve v0.9's safeguard against plain filename links.
      const hasPopupEvidence=['aria-haspopup','aria-controls','aria-describedby','aria-details',
        'data-tooltip','data-popover','data-tippy-content','data-bs-toggle'].some(a=>marked.hasAttribute(a));
      if(!hasPopupEvidence)return null;
    }
    if(marked){
      const r=marked.getBoundingClientRect();
      if(r.width>3&&r.height>3&&r.width<=viewport.width*.65&&r.height<=viewport.height*.6)return marked;
    }
    // Tooltips are frequently attached to tiny SVG/icon or price/discount text,
    // without ARIA attributes. Remember the *leaf*, not a large containing card.
    for(let element=target,depth=0;element&&depth<5;element=element.parentElement,depth++){
      const r=element.getBoundingClientRect?.();
      if(!r||r.width<3||r.height<3||r.width>125||r.height>85)continue;
      const tag=element.tagName?.toLowerCase()||'';
      // SVG paths can be just a few pixels across; anchor to the enclosing icon.
      if(['path','circle','rect','line','polygon','polyline','g','use'].includes(tag))continue;
      const classes=String(element.getAttribute?.('class')||'');
      const style=styleOf(element);
      // Ordinary text spans/labels are NOT hover controls. Treating every
      // small span as a trigger caused a dozen false interactions and queued
      // screenshot jobs before genuine discount popups could be captured.
      const svgIcon=tag==='svg'||tag==='i'||tag==='img';
      const meaningful=marker.test(classes)||['pointer','help'].includes(style?.cursor)||
        element.hasAttribute?.('title')||element.hasAttribute?.('aria-describedby')||
        element.hasAttribute?.('aria-haspopup')||element.hasAttribute?.('data-tooltip');
      if(svgIcon||meaningful)return element;
    }
    return null;
  }
  function floating(el,styleOf,viewport){
    if(!el?.getBoundingClientRect)return false;
    const r=el.getBoundingClientRect(),s=styleOf(el);
    if(r.width<75||r.height<28||r.width>viewport.width*.87||r.height>viewport.height*.96)return false;
    if(r.bottom<0||r.right<0||r.left>viewport.width||r.top>viewport.height)return false;
    if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return false;
    const role=el.getAttribute?.('role')||'',cls=String(el.getAttribute?.('class')||'');
    const semantic=/tooltip|popover|popup|floating|dialog|menu|listbox/i.test(role+' '+cls);
    const layer=['fixed','absolute'].includes(s.position)||Number.parseInt(s.zIndex,10)>1;
    return semantic||layer;
  }
  function floatingAncestor(start,styleOf,viewport){
    let el=start?.nodeType===3?start.parentElement:start;
    const results=[];
    for(let depth=0;el&&depth<7;el=el.parentElement,depth++){
      if(floating(el,styleOf,viewport))results.push(el);
    }
    // Select the smallest meaningful floating surface, not its whole overlay portal.
    results.sort((a,b)=>{
      const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();
      return ra.width*ra.height-rb.width*rb.height;
    });
    return results[0]||null;
  }
  window.SmartCaptureHover={hoverSource,floating,floatingAncestor};
})();