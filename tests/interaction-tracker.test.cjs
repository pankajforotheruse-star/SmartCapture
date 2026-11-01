'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../extension/interaction-tracker.js'),'utf8');
function tracker(capture){
 const context={window:{}};vm.runInNewContext(source,context);
 // Never execute virtual timers until flush; simulate rapid click-click-stop.
 const timers=new Map();let next=0;
 return context.window.SmartCaptureTracker.create({
  capture,delay:200,
  setTimer:fn=>{const id=++next;timers.set(id,fn);return id;},
  clearTimer:id=>timers.delete(id)
 });
}
test('rapid clicks on separate links do not cancel the first capture',async()=>{
 const seen=[];
 const session=tracker(async info=>{seen.push(info.id);return true;});
 session.note({id:'agreement-572-account',anchor:{x:550,y:155}});
 session.note({id:'agreement-570-account',anchor:{x:550,y:377}});
 const result=await session.flush();
 assert.deepEqual(seen,['agreement-572-account','agreement-570-account']);
 assert.equal(result.seen,2);
 assert.equal(result.captured,2);
 assert.equal(result.pending,0);
});
test('clicking the same source twice does not duplicate one popup',async()=>{
 let calls=0;
 const session=tracker(async()=>{calls++;return true;});
 session.note({id:'same-account'});
 session.note({id:'same-account'});
 await session.flush();
 assert.equal(calls,1);
 assert.equal(session.stats().captured,1);
});
test('a failed attempt can be retried without losing its source anchor',async()=>{
 let calls=0;
 const session=tracker(async info=>{
   assert.equal(info.anchor.y,155);
   return ++calls>1;
 });
 session.note({id:'first',anchor:{x:500,y:155}});
 await session.flush();
 assert.equal(session.stats().pending,1);
 session.note({id:'first',anchor:{x:500,y:155}});
 await session.flush();
 assert.equal(session.stats().captured,1);
});
test('independent sources remain separate even when labels match',async()=>{
 const recorded=[];
 const session=tracker(async info=>{recorded.push(info.anchor.y);return true;});
 session.note({id:'same-label:155',label:'1 billing account',anchor:{x:550,y:155}});
 session.note({id:'same-label:377',label:'1 billing account',anchor:{x:550,y:377}});
 await session.flush();
 assert.deepEqual(recorded,[155,377]);
});

test('mutations retry only the named active source, not old hovers',async()=>{
 const attempted=[];
 const session=tracker(async info=>{attempted.push(info.id);return false;});
 for(const id of ['unrelated-a','real-price-icon','unrelated-b'])session.note({id});
 await session.flush();
 session.retryPending('real-price-icon');
 await session.flush();
 assert.deepEqual(attempted,['unrelated-a','real-price-icon','unrelated-b','real-price-icon']);
 session.retryPending('real-price-icon');
 await session.flush();
 assert.equal(attempted.length,4,'only two attempts allowed per hover activation');
});
test('mutation with no active source must not schedule screenshots',async()=>{
 const calls=[];
 const session=tracker(async info=>{calls.push(info.id);return false;});
 session.note({id:'old-hover'});
 await session.flush();
 session.retryPending();
 await session.flush();
 assert.deepEqual(calls,['old-hover']);
});

test('stale hover is discarded when Stop occurs after pointer has left',async()=>{
 const context={window:{}};vm.runInNewContext(source,context);
 const timers=new Map();let id=0,active='first',shots=[];
 const t=context.window.SmartCaptureTracker.create({
  capture:async info=>{shots.push(info.id);return true;},
  canAttempt:info=>info.id===active,
  setTimer:fn=>{timers.set(++id,fn);return id;},
  clearTimer:key=>timers.delete(key)
 });
 t.note({id:'first'});t.note({id:'second'});active='second';
 const result=await t.flush();
 assert.deepEqual(shots,['second']);
 assert.equal(result.captured,1);
});
test('re-entering same source can start fresh capture after failed hover',async()=>{
 const context={window:{}};vm.runInNewContext(source,context);
 let next=0;const timers=new Map(),seen=[];
 const t=context.window.SmartCaptureTracker.create({
  capture:async info=>{seen.push(info.timestamp);return info.timestamp===2;},
  setTimer:fn=>{timers.set(++next,fn);return next;},
  clearTimer:key=>timers.delete(key)
 });
 t.note({id:'icon',timestamp:1});await t.flush();
 t.note({id:'icon',timestamp:2});await t.flush();
 assert.deepEqual(seen,[1,2]);
 assert.equal(t.stats().captured,1);
});
