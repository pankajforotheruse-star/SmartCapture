'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../extension/geometry.js'),'utf8'),ctx);
const g=ctx.window.SmartCaptureGeometry;
test('uses uniform device pixel scale even when capture image is shorter than innerHeight',()=>{
 const scale=g.scaleFor(1440,1440);
 const rect=g.rectInImage({left:290,top:156,right:560,bottom:270.75},scale,1440,716);
 assert.equal(rect.width,270);
 assert.equal(rect.height,115);
 assert.equal(rect.y,156);
});
test('never yields an incomplete crop when screenshot clips popup bottom',()=>{
 const scale=g.scaleFor(1440,1440);
 assert.equal(g.rectInImage({left:200,top:680,right:470,bottom:820},scale,1440,716),null);
});
test('two-times density uses identical pixel factor on horizontal and vertical dimensions',()=>{
 const scale=g.scaleFor(2880,1440);
 const rect=g.rectInImage({left:300,top:150,right:530,bottom:250},scale,2880,1800);
 assert.equal(rect.width,460);assert.equal(rect.height,200);assert.equal(rect.y,300);
});
