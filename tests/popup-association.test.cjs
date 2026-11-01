'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../extension/popup-association.js'),'utf8');
const context={window:{}};vm.runInNewContext(src,context);
const relation=context.window.SmartCaptureAssociation;
function el(tag,x,y,width,height,attrs={}){
 const attributes={...attrs};
 return {tagName:tag,id:attributes.id||'',getBoundingClientRect:()=>({x,y,width,height}),
   getAttribute:(name)=>attributes[name]??null,hasAttribute:(name)=>Object.hasOwn(attributes,name)};
}
function trigger(id,target,method,timestamp,rect,popup){
 return {id,target,method,timestamp,anchor:rect,visibleBefore:new Map(popup?[[popup,'old contents']]:[])};
}
test('ordinary hyperlink hover does not become an invented popup trigger',()=>{
 const file=el('A',1470,133,200,22,{href:'#file'});
 const dots=el('BUTTON',1963,94,22,27,{'aria-haspopup':'menu','aria-controls':'more-actions'});
 const menu=el('DIV',1870,131,126,90,{id:'more-actions'});
 const now=5000;
 const events=[
  trigger('file-hover',file,'hover',4700,file.getBoundingClientRect()),
  trigger('dots-click',dots,'click',4900,dots.getBoundingClientRect())
 ];
 assert.equal(relation.hoverEligible(file),false);
 assert.equal(relation.ownerFor(menu,'Stop the Processing Resume the Processing Modify Cancel',events,now).id,'dots-click');
});
test('filename click immediately followed by three-dot click attributes menu to three dots',()=>{
 const file=el('A',1470,134,200,19,{href:'#file'});
 const dots=el('BUTTON',1975,95,19,22,{'aria-haspopup':'menu'});
 const menu=el('DIV',1870,126,124,96);
 const now=10000;
 const events=[
  trigger('file-click',file,'click',9600,file.getBoundingClientRect()),
  trigger('dots-click',dots,'click',9910,dots.getBoundingClientRect())
 ];
 assert.equal(relation.ownerFor(menu,'Stop Processing Modify Cancel',events,now).id,'dots-click');
});
test('legitimate hover tooltip on a link with aria-describedby is recognized',()=>{
 const link=el('A',550,120,95,25,{'aria-describedby':'hover-hint'});
 const tip=el('DIV',555,147,160,70,{id:'hover-hint'});
 const events=[trigger('described-link',link,'hover',4900,link.getBoundingClientRect())];
 assert.equal(relation.hoverEligible(link),true);
 assert.equal(relation.ownerFor(tip,'A helpful tip appeared',events,5000).id,'described-link');
});
test('existing unrelated menu is not re-attributed to subsequent click',()=>{
 const menu=el('DIV',110,110,160,85);
 const source=el('BUTTON',105,88,30,22);
 const event=trigger('second',source,'click',4900,source.getBoundingClientRect(),menu);
 assert.equal(relation.ownerFor(menu,'old contents',[event],5000),null);
});
test('matching popup signatures are identical regardless of control source',()=>{
 const menu=el('DIV',1870,131,124,90);
 const first=relation.signature(menu,'Stop the Processing Modify Cancel');
 const again=relation.signature(menu,' Stop the Processing   Modify Cancel ');
 assert.equal(first,again);
});
test('two identical menus at distinct positions retain different signatures',()=>{
 const left=el('DIV',420,120,124,90);
 const right=el('DIV',1870,131,124,90);
 assert.notEqual(relation.signature(left,'Same menu text'),relation.signature(right,'Same menu text'));
});
