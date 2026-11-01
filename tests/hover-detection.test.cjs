'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../extension/hover-detection.js'),'utf8'),context);
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../extension/popup-association.js'),'utf8'),context);
const hover=context.window.SmartCaptureHover,relation=context.window.SmartCaptureAssociation;
function el(tag,box,style={},attrs={},parent=null){
 const o={tagName:tag.toUpperCase(),parentElement:parent,
   getBoundingClientRect:()=>({x:box.x,y:box.y,width:box.w,height:box.h,left:box.x,top:box.y,right:box.x+box.w,bottom:box.y+box.h}),
   getAttribute:a=>attrs[a]??null,hasAttribute:a=>Object.hasOwn(attrs,a)};
 o.closest=selector=>{
   for(let e=o;e;e=e.parentElement){
     const tag=e.tagName?.toLowerCase();
     if(selector.split(',').some(x=>x.trim()===tag))return e;
     if(selector.includes('[role="button"]')&&e.hasAttribute?.('role')&&e.getAttribute('role')==='button')return e;
     if(selector.includes('[title]')&&e.hasAttribute?.('title'))return e;
   }
   return null;
 };
 o.css=style;return o;
}
const styleOf=e=>e.css||{display:'block',visibility:'visible',position:'static',opacity:'1',cursor:'auto'};
const screen={width:1900,height:900};
test('tiny unmarked SVG icon is recognized as a hover source',()=>{
 const host=el('DIV',{x:670,y:145,w:180,h:60});
 const svg=el('SVG',{x:702,y:181,w:13,h:13},{cursor:'pointer'},{},host);
 const path=el('PATH',{x:704,y:183,w:8,h:8},{cursor:'pointer'},{},svg);
 assert.equal(hover.hoverSource(path,styleOf,screen),svg);
});
test('plain filename link remains excluded as a speculative hover source',()=>{
 const link=el('A',{x:1000,y:220,w:210,h:22},{cursor:'pointer'},{href:'#file'});
 assert.equal(hover.hoverSource(link,styleOf,screen),null);
});
test('newly inserted unclassified fixed popup can be discovered from child text',()=>{
 const portal=el('DIV',{x:760,y:175,w:240,h:78},{position:'fixed',zIndex:'10000',display:'block',visibility:'visible',opacity:'1'});
 const inner=el('SPAN',{x:780,y:187,w:125,h:15},{position:'static',display:'block',visibility:'visible',opacity:'1'},{},portal);
 assert.equal(hover.floatingAncestor(inner,styleOf,screen),portal);
});
test('ordinary page text is not mistaken for a floating popup',()=>{
 const parent=el('DIV',{x:450,y:125,w:450,h:200},{position:'static',zIndex:'auto',display:'block',visibility:'visible',opacity:'1'});
 const text=el('SPAN',{x:480,y:160,w:90,h:15},{position:'static',display:'block',visibility:'visible',opacity:'1'},{},parent);
 assert.equal(hover.floatingAncestor(text,styleOf,screen),null);
});
test('new price tooltip follows recent icon hover rather than older click',()=>{
 const btn=el('BUTTON',{x:320,y:170,w:65,h:20},{},{}),icon=el('SVG',{x:710,y:180,w:15,h:15});
 const popup=el('DIV',{x:725,y:195,w:245,h:65},{position:'fixed',zIndex:'10',opacity:'1'});
 const before=new Map();
 const older={id:'prior-click',target:btn,anchor:{x:320,y:170,width:65,height:20},method:'click',timestamp:1000,visibleBefore:before};
 const recent={id:'price-hover',target:icon,anchor:{x:710,y:180,width:15,height:15},method:'hover',timestamp:4550,visibleBefore:new Map()};
 assert.equal(relation.ownerFor(popup,'Total Discount 2% Initial Price',[older,recent],5000)?.id,'price-hover');
});
test('multiple popups around separate small icons keep distinct owners',()=>{
 const iconA=el('SVG',{x:710,y:180,w:12,h:12}),iconB=el('SVG',{x:1710,y:400,w:12,h:12});
 const popupA=el('DIV',{x:760,y:181,w:240,h:65}),popupB=el('DIV',{x:1670,y:345,w:240,h:140});
 const evA={id:'a',target:iconA,anchor:{x:710,y:180,width:12,height:12},method:'hover',timestamp:4900,visibleBefore:new Map()};
 const evB={id:'b',target:iconB,anchor:{x:1710,y:400,width:12,height:12},method:'hover',timestamp:4900,visibleBefore:new Map([[popupA,'total discount']])};
 assert.equal(relation.ownerFor(popupA,'Total Discount',[evA,evB],5000)?.id,'a');
 assert.equal(relation.ownerFor(popupB,'Current Discount',[evA,evB],5000)?.id,'b');
});

test('small info bubble stays the canonical owner for nested svg paths',()=>{
 const outer=el('SPAN',{x:712,y:180,w:17,h:17},{cursor:'help'},{class:'price-info-icon'});
 const svg=el('SVG',{x:714,y:182,w:12,h:12},{cursor:'help'},{},outer);
 const path=el('PATH',{x:717,y:185,w:6,h:6},{cursor:'help'},{},svg);
 assert.equal(hover.hoverSource(path,styleOf,screen),outer);
 assert.equal(hover.hoverSource(svg,styleOf,screen),outer);
 assert.equal(hover.hoverSource(outer,styleOf,screen),outer);
});

test('ordinary small text spans do not count as hover popup triggers',()=>{
 const regular=el('SPAN',{x:580,y:123,w:80,h:15},{cursor:'auto'},{class:'ordinary-text'});
 assert.equal(hover.hoverSource(regular,styleOf,screen),null);
});
