'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../extension/popup-surface.js'),'utf8');
const ctx={window:{}};vm.runInNewContext(src,ctx);
const engine=ctx.window.SmartCaptureSurface,view={width:1900,height:900},trigger={x:660,y:135,width:14,height:14};
const R=(x,y,w,h)=>({x,y,width:w,height:h});
function el(rect,style,text,parent=null){
 return {parentElement:parent,innerText:text,textContent:text,
 getBoundingClientRect:()=>({...rect,left:rect.x,top:rect.y}),
 getAttribute:k=>k==='class'?'overlay':'',style};
}
const floating={backgroundColor:'rgb(255,255,255)',boxShadow:'0 3px 12px #aaa',position:'absolute',opacity:'1',display:'block',visibility:'visible'};
test('chooses actual white popup bounds instead of screenshot difference including background',()=>{
 const page=el(R(140,85,1640,280),{backgroundColor:'rgb(255,255,255)',position:'static'},'Product Details Billing Account DKK 319.00');
 const popup=el(R(710,169,230,78),floating,'Total Discount 9% DKK 30.00 Initial Price DKK 349.00',page);
 const label=el(R(730,190,140,15),{position:'static'},'Total Discount',popup);
 const found=engine.identify(R(684,150,285,130),trigger,view,[label,popup],e=>e.style);
 assert.equal(found.element,popup);
 assert.equal(found.rect.x,710);assert.equal(found.rect.width,230);
});
test('rejects screenshot diff without a credible popup surface',()=>{
 const page=el(R(145,88,1700,275),{backgroundColor:'white',position:'static'},'Total Monthly DKK 319 Balance');
 const found=engine.identify(R(490,115,320,130),trigger,view,[page],e=>e.style);
 assert.equal(found,null);
});
test('two visually identical popups still resolve to their own DOM rect',()=>{
 const popup=el(R(1560,330,235,122),floating,'Current Rabat 30 kr Discount DKK 30');
 const result=engine.identify(R(1530,315,270,140),R(1620,380,16,16),view,[popup],e=>e.style);
 assert.equal(result.rect.y,330);assert.equal(result.rect.height,122);
});

test('rejects translucent popup background that would bleed page text into screenshot',()=>{
 assert.equal(engine.opaqueColor('rgba(255, 255, 255, 0.85)'),false);
 assert.equal(engine.opaqueColor('transparent'),false);
 assert.equal(engine.opaqueColor('rgb(255, 255, 255)'),true);
});
