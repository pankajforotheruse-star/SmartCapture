'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'../extension/visual-diff.js'),'utf8');
const context={window:{}};vm.runInNewContext(code,context);
const detect=context.window.SmartCaptureVisualDiff.detect;
const W=980,H=620;
function frame(){const b=new Uint8ClampedArray(W*H*4);for(let i=0;i<b.length;i+=4){b[i]=249;b[i+1]=247;b[i+2]=252;b[i+3]=255;}return b;}
function fill(buf,x,y,w,h,v){
 for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){
  const k=(yy*W+xx)*4;buf[k]=v;buf[k+1]=v;buf[k+2]=v;
 }
}
function tooltip(b,x,y,w,h){
 fill(b,x,y,w,h,241);
 fill(b,x,y,w,2,64);fill(b,x,y+h-2,w,2,64);
 fill(b,x,y,2,h,64);fill(b,x+w-2,y,2,h,64);
 for(let yy=y+14;yy<y+h-10;yy+=19)fill(b,x+14,yy,w-48,3,38);
}
test('recognizes price tooltip visible only in the after-hover screenshot',()=>{
 const before=frame(),after=frame();
 tooltip(after,610,205,242,78);
 const r=detect(before,after,W,H,{x:600,y:180,width:16,height:16});
 assert.ok(r,'popup was not found');
 assert.ok(r.x<=610&&r.y<=205,'crop must include top left border');
 assert.ok(r.x+r.width>=852&&r.y+r.height>=283,'crop must include complete tooltip');
});
test('ignores a tiny hovered icon highlight without popup',()=>{
 const before=frame(),after=frame();fill(after,600,180,13,13,20);
 assert.equal(detect(before,after,W,H,{x:600,y:180,width:13,height:13}),null);
});
test('ignores unrelated popup appearing very far from hovered source',()=>{
 const before=frame(),after=frame();tooltip(after,670,230,220,75);
 assert.equal(detect(before,after,W,H,{x:15,y:15,width:12,height:12}),null);
});
test('does not invent a tooltip when screenshot pixels are identical',()=>{
 const before=frame();
 assert.equal(detect(before,before,W,H,{x:600,y:180,width:12,height:12}),null);
});
