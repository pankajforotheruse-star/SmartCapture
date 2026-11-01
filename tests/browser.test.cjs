'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const http=require('node:http'),os=require('node:os');
test('browser extension: independently captures three tooltip owners once',async()=>{
 const {chromium}=require('playwright');
 const fixture=fs.readFileSync(path.join(__dirname,'fixtures/interactive.html'));
 const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end(fixture);});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const port=server.address().port,folder=fs.mkdtempSync(path.join(os.tmpdir(),'smartcapture-e2e-'));
 const extension=path.resolve(__dirname,'../extension');
 let context;
 try {
  context=await chromium.launchPersistentContext(folder,{headless:true,channel:'chromium',
   args:['--disable-extensions-except='+extension,'--load-extension='+extension],
   acceptDownloads:true,viewport:{width:1440,height:850}});
  const sw=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:30000});
  const page=await context.newPage();
  const url='http://127.0.0.1:'+port+'/';
  await page.goto(url,{waitUntil:'load'});
  await page.bringToFront();
  await sw.evaluate(async url=>{
   const tabs=await chrome.tabs.query({});
   const tab=tabs.find(x=>x.url?.startsWith(url));
   if(!tab)throw Error('Fixture tab missing');
   await chrome.scripting.executeScript({target:{tabId:tab.id},
    files:['layout.js','interaction-tracker.js','popup-association.js','hover-detection.js','visual-diff.js','popup-surface.js','geometry.js','capture.js']});
  },url);
  async function send(type){
   return sw.evaluate(async({url,type})=>{
    const tabs=await chrome.tabs.query({});
    const tab=tabs.find(x=>x.url?.startsWith(url));
    if(!tab)throw Error('No fixture tab');
    return chrome.tabs.sendMessage(tab.id,{type});
   },{url,type});
  }
  const started=await send('START');
  assert.ok(!started?.error,started?.error);
  const expected=[],iconBoxes=[];
  for(const [icon,popup] of [['#assoc-icon','#association-panel'],
    ['#discount-icon','#discount-popup'],['#current-icon','#current-popup']]){
   await page.locator(icon).hover();await page.waitForTimeout(1800);
   expected.push(await page.locator(popup).boundingBox());
   iconBoxes.push(await page.locator(icon).boundingBox());
  }
  const metrics=await send('METRICS');
  assert.equal(metrics.items.length,3,'Must identify three real popup surfaces');
  for(const actualBox of metrics.items){
    const match=expected.find(box=>Math.abs(box.width-actualBox.width)<5&&
      Math.abs(box.height-actualBox.height)<5);
    assert.ok(match,'Crop mismatch: actual='+JSON.stringify(actualBox)+' expected='+JSON.stringify(expected));
  }
  assert.ok(metrics.items.every(i=>i.anchor.width<=42),
    'Only small info icons may own these three tooltips; not whole price labels');
  for(const item of metrics.items){
    assert.ok(iconBoxes.some(box=>Math.abs(box.x-item.anchor.x)<5&&Math.abs(box.y-item.anchor.y)<5),
      'Captured popup anchor is not one of the actual hovered info bubbles: '+JSON.stringify(item));
  }
  const before=await send('STATUS');
  assert.equal(before.count,3,'Three unique tooltip captures expected; got '+before.count);
  await page.locator('#current-icon').hover();await page.locator('#discount-icon').hover();
  await page.waitForTimeout(1600);
  assert.equal((await send('STATUS')).count,3,'Repeated hover must not duplicate captured content');
  await page.locator('#ordinary-link').hover();await page.waitForTimeout(700);
  assert.equal((await send('STATUS')).count,3,'Ordinary link must not create a popup');
  const stopped=await send('STOP');
  assert.ok(!stopped?.error,stopped?.error);
  const placed=(await send('METRICS')).layout;
  assert.equal(placed.length,3);
  for(const p of placed) {
    assert.ok(p.renderScale>=.9,'Popup was scaled below readability floor');
    assert.ok(p.width>100&&p.height>45,'Popup was clipped or made unreadably small');
  }
  for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++){
    const a=placed[i],b=placed[j];
    const separated=a.x+a.width<=b.x||b.x+b.width<=a.x||
      a.y+a.height<=b.y||b.y+b.height<=a.y;
    assert.ok(separated,'Popup placements overlap');
  }
 }finally{
  if(context)await context.close();
  await new Promise(ok=>server.close(ok));
  fs.rmSync(folder,{recursive:true,force:true});
 }
},{timeout:120000});