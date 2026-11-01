'use strict';
/* Generic hover and floating-layer discovery. Never identifies popups by page-specific text. */
(() => {
  const interactive='button,a,[role="button"],[aria-haspopup],[aria-expanded],[aria-describedby],[title],[data-tooltip],[data-popover]';
  const tags=new Set(['svg','i','img','span','small','label']);
  const marker=/icon|info|help|question|discount|price|hint|tooltip|popover|trigger/i;
  function hoverSource(target,styleOf,viewport){
    if(!target?.closest)return null;
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
      const classes=String(element.getAttribute?.('class')||'');
      const style=styleOf(element);
      if(tags.has(tag)||marker.test(classes)||style?.cursor==='pointer')return element;
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