'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const script=fs.readFileSync(path.join(__dirname,'../extension/layout.js'),'utf8');
function engine(inkRects=[]){
 const doc={createElement(){
  const c={width:0,height:0,getContext(){return {drawImage(){},getImageData(){
   const data=new Uint8ClampedArray(c.width*c.height*4);
   for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
    const i=(y*c.width+x)*4,occupied=inkRects.some(p=>x>=p.x/4&&x<(p.x+p.w)/4&&y>=p.y/4&&y<(p.y+p.h)/4);
    data[i]=occupied?35:248;data[i+1]=occupied?48:246;data[i+2]=occupied?57:251;data[i+3]=255;
   }
   return {data};
  }}}};return c;
 }};
 const context={document:doc,window:{}};vm.runInNewContext(script,context,{filename:'extension/layout.js'});
 return context.window.SmartCaptureLayout;
}
function intersects(a,b,pad=0){return a.x<b.x+b.w+pad&&a.x+a.w+pad>b.x&&a.y<b.y+b.h+pad&&a.y+a.h+pad>b.y;}
const items=[
 {width:153,height:103,anchor:{x:585,y:120,width:73,height:22}},
 {width:170,height:295,anchor:{x:669,y:120,width:75,height:22}}
];
const contentObstacles=[
 {x:0,y:0,w:2048,h:56},{x:0,y:56,w:138,h:840},
 {x:585,y:120,w:73,h:22},{x:669,y:120,w:75,h:22},
 {x:590,y:166,w:106,h:74},{x:856,y:164,w:95,h:80},
 {x:300,y:354,w:115,h:40},{x:792,y:354,w:110,h:40},
 {x:1300,y:354,w:110,h:40},{x:1740,y:354,w:100,h:40}
];
const panels=[
 {x:145,y:85,w:1850,h:3},{x:145,y:280,w:1850,h:3},
 {x:145,y:318,w:1850,h:3},{x:145,y:419,w:1850,h:3}
];
test('two interactive popups occupy safe blank space in original screenshot',()=>{
 const layout=engine();
 const obstacles=[...contentObstacles,...panels];
 const result=layout.compute({items,obstacles,routeObstacles:contentObstacles,image:{},width:2048,height:900,scale:1});
 assert.equal(result.positions.length,2);
 assert.equal(result.height,900,'should not expand if free space is available');
 for(const p of result.positions){
  assert.ok(p.x>=0&&p.y>=0&&p.x+p.w<=2048&&p.y+p.h<=900);
  assert.ok(obstacles.every(o=>!intersects(p,o)), 'a popup obscures protected webpage information');
 }
 assert.ok(!intersects(result.positions[0],result.positions[1],10),'popups overlap');
 assert.ok(result.routes.some(route=>route&&route.length>1),'expected at least one safe connector');
});
test('dense page falls back below original screenshot, not over content',()=>{
 const layout=engine();
 const obstacle={x:0,y:0,w:1200,h:650};
 const result=layout.compute({items,obstacles:[obstacle],routeObstacles:[obstacle],image:{},width:1200,height:700,scale:1});
 assert.equal(result.positions.length,2);
 assert.ok(result.positions.every(p=>!intersects(p,obstacle)));
 assert.ok(result.height>700);
 assert.ok(!intersects(result.positions[0],result.positions[1],10));
});
test('screenshot image ink is an obstacle even without DOM geometry',()=>{
 const ink={x:230,y:170,w:230,h:220},layout=engine([ink]);
 const result=layout.compute({items:[{width:110,height:100,anchor:{x:255,y:130,width:45,height:20}}],obstacles:[],image:{},width:850,height:610,scale:1});
 const p=result.positions[0];
 assert.ok(!intersects(p,ink,0),'placement covered image content');
});

test('tall product popup reuses blank viewport space with minimal extension',()=>{
 const layout=engine();
 const tallItems=[
  {width:144,height:96,anchor:{x:460,y:98,width:79,height:21}},
  {width:160,height:478,anchor:{x:550,y:98,width:85,height:21}}
 ];
 const blockers=[
  {x:0,y:0,w:1653,h:55},{x:0,y:55,w:130,h:765},
  {x:440,y:96,w:100,h:24},{x:550,y:96,w:85,h:24},
  {x:450,y:150,w:100,h:90},{x:770,y:150,w:110,h:90},
  {x:130,y:270,w:1500,h:4},{x:130,y:353,w:1500,h:4},
  {x:350,y:305,w:100,h:40},{x:810,y:305,w:100,h:40}
 ];
 const result=layout.compute({items:tallItems,obstacles:blockers,routeObstacles:blockers.filter(o=>o.h!==4),image:{},width:1653,height:820,scale:1});
 assert.ok(result.positions[1].y<820,'product must start within the original viewport');
 assert.ok(result.height<=920,'avoid adding a second screenshot-height worth of blank space');
 assert.ok(result.positions.every(p=>blockers.every(b=>!intersects(p,b,0))),'no original content may be covered');
 assert.ok(!intersects(result.positions[0],result.positions[1],10),'popup boxes may not overlap');
});

test('small optional resize places a large popup in nearby safe whitespace',()=>{
 const layout=engine();
 const obstacles=[
  {x:0,y:0,w:800,h:105},{x:0,y:105,w:150,h:395},
  {x:456,y:105,w:344,h:395},{x:150,y:260,w:306,h:240}
 ];
 const result=layout.compute({
  items:[{width:290,height:122,anchor:{x:304,y:79,width:30,height:18}}],
  obstacles,image:{},width:800,height:500,scale:1
 });
 assert.equal(result.positions.length,1);
 const p=result.positions[0];
 assert.equal(p.renderScale,0.94,'use only the controlled 94% reduction');
 assert.ok(p.y<260,'popup belongs inside the nearest free pocket');
 assert.ok(obstacles.every(o=>!intersects(p,o)),'resize must not overwrite source content');
 assert.equal(result.height,500,'the screenshot should not be expanded unnecessarily');
});
